from datetime import date
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.admin_module.models import (
    Booking, Consultation, ConsultationBill, DoctorProfile, Patient,
    RegistrationBill, Staff, Token,
)


class ReceptionWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reception_user = User.objects.create_user(username="reception", password="secret")
        Staff.objects.create(
            user=self.reception_user, full_name="Reception User", gender=Staff.Gender.OTHER,
            date_of_birth=date(1990, 1, 1), phone="9000000001", role=Staff.Role.RECEPTIONIST,
            joining_date=date(2020, 1, 1),
        )
        self.doctor_user = User.objects.create_user(username="doctor1", password="secret")
        doctor_staff = Staff.objects.create(
            user=self.doctor_user, full_name="Doctor One", gender=Staff.Gender.OTHER,
            date_of_birth=date(1980, 1, 1), phone="9000000002", role=Staff.Role.DOCTOR,
            joining_date=date(2020, 1, 1),
        )
        self.doctor = DoctorProfile.objects.create(staff=doctor_staff, consultation_fee="500.00")
        self.client.force_authenticate(self.reception_user)
        self.patient_data = {
            "full_name": "Test Patient", "date_of_birth": "1990-01-01", "gender": "Other",
            "phone": "9876543210", "email": "", "address": "Test address",
        }

    def register_patient(self):
        response = self.client.post("/api/reception/patients/", self.patient_data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Patient.objects.get(pk=response.data["id"])

    def test_registration_creates_pending_bill_and_duplicate_phone_is_rejected(self):
        patient = self.register_patient()
        bill = RegistrationBill.objects.get(patient=patient)
        self.assertEqual(bill.payment_status, RegistrationBill.PaymentStatus.PENDING)
        duplicate = self.client.post("/api/reception/patients/", self.patient_data, format="json")
        self.assertEqual(duplicate.status_code, 400)

    def test_registration_payment_issues_today_appointment_token_once(self):
        patient = self.register_patient()
        booking_response = self.client.post("/api/reception/bookings/", {
            "patient": patient.pk, "doctor": self.doctor.pk, "date": timezone.localdate().isoformat(),
        }, format="json")
        self.assertEqual(booking_response.status_code, 201, booking_response.data)
        self.assertIsNone(booking_response.data["token_number"])
        self.assertFalse(Token.objects.filter(source_booking_id=booking_response.data["id"]).exists())

        payment = self.client.post(
            f"/api/reception/patients/{patient.pk}/collect-registration-payment/",
            {"payment_method": "UPI"}, format="json",
        )
        self.assertEqual(payment.status_code, 200, payment.data)
        self.assertEqual(payment.data["token_numbers"], [1])
        token = Token.objects.get(source_booking_id=booking_response.data["id"])
        self.assertEqual(token.status, Token.Status.ACTIVE)
        self.assertEqual(token.token_number, 1)
        self.assertEqual(token.source_booking.status, Booking.Status.ACTIVATED)
        bill = RegistrationBill.objects.get(patient=patient)
        self.assertEqual(bill.payment_status, RegistrationBill.PaymentStatus.PAID)
        self.assertEqual(bill.payment_method, "UPI")
        self.assertEqual(bill.paid_by, self.reception_user)

        repeated = self.client.post(
            f"/api/reception/patients/{patient.pk}/collect-registration-payment/",
            {"payment_method": "UPI"}, format="json",
        )
        self.assertEqual(repeated.status_code, 400)
        self.assertEqual(Token.objects.filter(source_booking_id=booking_response.data["id"]).count(), 1)

    def test_patient_can_be_viewed_and_updated_without_losing_history(self):
        patient = self.register_patient()
        detail = self.client.get(f"/api/reception/patients/{patient.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertIn("appointment_history", detail.data)
        updated = self.client.patch(f"/api/reception/patients/{patient.pk}/", {"address": "Updated address"}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        patient.refresh_from_db()
        self.assertEqual(patient.address, "Updated address")
        self.assertTrue(RegistrationBill.objects.filter(patient=patient).exists())

        deactivated = self.client.delete(f"/api/reception/patients/{patient.pk}/")
        self.assertEqual(deactivated.status_code, 204)
        patient.refresh_from_db()
        self.assertFalse(patient.is_active)
        self.assertTrue(RegistrationBill.objects.filter(patient=patient).exists())

    def test_duplicate_appointment_and_unavailable_schedule_are_rejected(self):
        patient = self.register_patient()
        self.doctor.consultation_days = ["Monday"]
        self.doctor.save(update_fields=["consultation_days"])
        next_monday = timezone.localdate() + timedelta(days=(7 - timezone.localdate().weekday()) % 7 or 7)
        booking_payload = {"patient": patient.pk, "doctor": self.doctor.pk, "date": next_monday.isoformat()}
        first = self.client.post("/api/reception/bookings/", booking_payload, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        duplicate = self.client.post("/api/reception/bookings/", booking_payload, format="json")
        self.assertEqual(duplicate.status_code, 400)
        invalid_day = next_monday + timedelta(days=1)
        invalid = self.client.post("/api/reception/bookings/", {**booking_payload, "date": invalid_day.isoformat()}, format="json")
        self.assertEqual(invalid.status_code, 400)

    def test_walk_in_requires_paid_registration(self):
        patient = self.register_patient()
        url = "/api/reception/walk-ins/"
        response = self.client.post(url, {"patient": patient.pk, "doctor": self.doctor.pk}, format="json")
        self.assertEqual(response.status_code, 400)
        self.client.post(
            f"/api/reception/patients/{patient.pk}/collect-registration-payment/",
            {"payment_method": "Cash"}, format="json",
        )
        response = self.client.post(url, {"patient": patient.pk, "doctor": self.doctor.pk}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["token_number"], 1)
        self.assertFalse(ConsultationBill.objects.exists())

    def test_existing_reserved_token_can_be_activated_after_registration_payment(self):
        patient = self.register_patient()
        self.client.post(
            f"/api/reception/patients/{patient.pk}/collect-registration-payment/",
            {"payment_method": "Cash"}, format="json",
        )
        token = Token.objects.create(
            doctor=self.doctor, patient=patient, date=timezone.localdate(), token_number=2,
            token_type=Token.Type.WALK_IN, status=Token.Status.RESERVED,
        )
        response = self.client.post(f"/api/reception/tokens/{token.pk}/activate/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        token.refresh_from_db()
        self.assertEqual(token.status, Token.Status.ACTIVE)
        self.assertEqual(response.data["token_number"], 2)

    def test_reserved_token_cannot_activate_before_registration_payment(self):
        patient = self.register_patient()
        token = Token.objects.create(
            doctor=self.doctor, patient=patient, date=timezone.localdate(), token_number=2,
            token_type=Token.Type.WALK_IN, status=Token.Status.RESERVED,
        )
        response = self.client.post(f"/api/reception/tokens/{token.pk}/activate/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_consultation_bill_is_created_only_after_doctor_completes(self):
        patient = self.register_patient()
        self.client.post(
            f"/api/reception/patients/{patient.pk}/collect-registration-payment/",
            {"payment_method": "Cash"}, format="json",
        )
        token = Token.objects.create(
            patient=patient, doctor=self.doctor, date=timezone.localdate(), token_number=7,
            token_type=Token.Type.WALK_IN, status=Token.Status.ACTIVE,
        )
        self.client.force_authenticate(self.doctor_user)
        start = self.client.post(f"/api/doctor/tokens/{token.pk}/start/", {}, format="json")
        self.assertEqual(start.status_code, 201, start.data)
        self.assertFalse(ConsultationBill.objects.filter(token=token).exists())

        self.client.force_authenticate(self.reception_user)
        premature_payment = self.client.post(
            f"/api/reception/tokens/{token.pk}/collect-payment/",
            {"payment_method": "Cash"}, format="json",
        )
        self.assertEqual(premature_payment.status_code, 400)
        self.client.force_authenticate(self.doctor_user)

        complete = self.client.post(f"/api/doctor/tokens/{token.pk}/complete/", {"diagnosis": "Routine"}, format="json")
        self.assertEqual(complete.status_code, 200, complete.data)
        self.assertEqual(Consultation.objects.get(token=token).status, Consultation.Status.COMPLETED)
        bill = ConsultationBill.objects.get(token=token)
        self.assertEqual(bill.payment_status, ConsultationBill.PaymentStatus.PENDING)
        self.assertEqual(bill.total, 500)
        self.assertEqual(token.__class__.objects.get(pk=token.pk).status, Token.Status.COMPLETED)
        repeated_completion = self.client.post(f"/api/doctor/tokens/{token.pk}/complete/", {}, format="json")
        self.assertEqual(repeated_completion.status_code, 400)
        self.assertEqual(ConsultationBill.objects.filter(token=token).count(), 1)

        self.client.force_authenticate(self.reception_user)
        paid = self.client.post(
            f"/api/reception/tokens/{token.pk}/collect-payment/",
            {"payment_method": "Card"}, format="json",
        )
        self.assertEqual(paid.status_code, 200, paid.data)
        bill.refresh_from_db()
        self.assertEqual(bill.payment_status, ConsultationBill.PaymentStatus.PAID)
        self.assertEqual(bill.payment_method, "Card")
        self.assertEqual(bill.paid_by, self.reception_user)
        duplicate = self.client.post(
            f"/api/reception/tokens/{token.pk}/collect-payment/",
            {"payment_method": "Card"}, format="json",
        )
        self.assertEqual(duplicate.status_code, 400)

    def test_receptionist_cannot_access_reception_apis_without_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/reception/dashboard/")
        self.assertEqual(response.status_code, 401)

    def test_receptionist_cannot_access_doctor_queue(self):
        response = self.client.get("/api/doctor/queue/")
        self.assertEqual(response.status_code, 403)
