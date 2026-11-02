from datetime import timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.admin_module.models import (
    Consultation,
    ConsultationBill,
    Department,
    DoctorProfile,
    LabOrder,
    LabOrderItem,
    LabReport,
    LabResult,
    LabTest,
    Medicine,
    Patient,
    Prescription,
    PrescriptionItem,
    Staff,
    Token,
)


class DoctorModuleIntegrationTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()

        # 1. Department
        self.department = Department.objects.create(name="Cardiology")

        # 2. Doctor user and profile
        self.doctor_user = User.objects.create_user(
            username="doc_smith", password="password123", email="smith@clinic.com"
        )
        self.doctor_staff = Staff.objects.create(
            user=self.doctor_user,
            full_name="Alice Smith",
            gender="Female",
            date_of_birth=self.today - timedelta(days=365 * 40),
            joining_date=self.today,
            email="smith@clinic.com",
            phone="9876543210",
            role=Staff.Role.DOCTOR,
            is_active=True,
        )
        self.doctor_profile = DoctorProfile.objects.create(
            staff=self.doctor_staff,
            department=self.department,
            medical_license_number="MED-12345",
            experience_years=10,
            consultation_fee=Decimal("500.00"),
            is_active=True,
        )

        # 3. Pharmacist user and staff (for testing pharmacist integration)
        self.pharmacist_user = User.objects.create_user(
            username="pharm_bob", password="password123", email="bob@clinic.com"
        )
        self.pharmacist_staff = Staff.objects.create(
            user=self.pharmacist_user,
            full_name="Bob Jones",
            gender="Male",
            date_of_birth=self.today - timedelta(days=365 * 30),
            joining_date=self.today,
            email="bob@clinic.com",
            phone="9876543211",
            role=Staff.Role.PHARMACIST,
            is_active=True,
        )

        # 4. Lab technician staff
        self.lab_tech_user = User.objects.create_user(
            username="lab_tech", password="password123", email="lab@clinic.com"
        )
        self.lab_tech_staff = Staff.objects.create(
            user=self.lab_tech_user,
            full_name="Tech Dave",
            gender="Male",
            date_of_birth=self.today - timedelta(days=365 * 28),
            joining_date=self.today,
            email="lab@clinic.com",
            phone="9876543212",
            role=Staff.Role.LAB_TECHNICIAN,
            is_active=True,
        )

        # 5. Patient
        self.patient = Patient.objects.create(
            full_name="John Doe",
            date_of_birth=self.today - timedelta(days=365 * 35),
            gender="Male",
            phone="9123456789",
            email="john@example.com",
            address="123 Main St",
            blood_group="O+",
            emergency_contact_name="Jane Doe",
            emergency_contact_phone="9123456780",
            is_active=True,
        )

        # 5. Token for today
        self.token = Token.objects.create(
            doctor=self.doctor_profile,
            patient=self.patient,
            token_number=1,
            token_type=Token.Type.WALK_IN,
            date=self.today,
            status=Token.Status.ACTIVE,
            activated_at=timezone.now(),
        )

        # 6. Medicine
        self.medicine = Medicine.objects.create(
            name="Amoxicillin 500mg",
            manufacturer="PharmaCorp",
            price=Decimal("15.00"),
            stock_quantity=100,
            expiry_date=self.today + timedelta(days=365),
            is_active=True,
        )

        # 7. Lab Test
        self.lab_test = LabTest.objects.create(
            name="Complete Blood Count",
            cost=Decimal("350.00"),
            normal_values="4.5 - 11.0 x10^9/L",
            is_active=True,
        )

    def test_doctor_profile_endpoint(self):
        self.client.force_authenticate(user=self.doctor_user)
        response = self.client.get("/api/doctor/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Alice Smith")
        self.assertEqual(response.data["specialization"], "Cardiology")
        self.assertEqual(response.data["license_number"], "MED-12345")

    def test_doctor_queue_retrieval(self):
        self.client.force_authenticate(user=self.doctor_user)
        response = self.client.get(f"/api/doctor/queue/?date={self.today}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["token_number"], 1)
        self.assertEqual(response.data[0]["patient"]["full_name"], "John Doe")

    def test_start_and_complete_consultation_with_prescription_and_lab_orders(self):
        self.client.force_authenticate(user=self.doctor_user)

        # 1. Start Consultation
        start_res = self.client.post(f"/api/doctor/tokens/{self.token.id}/start/")
        self.assertIn(start_res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        consultation_id = start_res.data["id"]

        # Verify Consultation state
        cons = Consultation.objects.get(pk=consultation_id)
        self.assertEqual(cons.status, Consultation.Status.IN_PROGRESS)

        # 2. Get Consultation Details (sidebar and workspace)
        detail_res = self.client.get(f"/api/doctor/consultations/{consultation_id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_res.data["patient"]["full_name"], "John Doe")
        self.assertIn("recent_consultations", detail_res.data)
        self.assertIn("recent_lab_results", detail_res.data)

        # 3. Complete Consultation
        complete_payload = {
            "diagnosis": "Bacterial Sinusitis",
            "clinical_notes": "Patient presents with facial pain and nasal congestion for 5 days. Prescribed antibiotics.",
            "prescription_items": [
                {
                    "medicine_id": self.medicine.id,
                    "quantity": 10,
                    "instructions": "1 capsule thrice daily after food for 5 days",
                }
            ],
            "lab_test_ids": [self.lab_test.id],
        }
        complete_res = self.client.post(
            f"/api/doctor/consultations/{consultation_id}/complete/",
            data=complete_payload,
            format="json",
        )
        self.assertEqual(complete_res.status_code, status.HTTP_200_OK)
        self.assertEqual(complete_res.data["consultation_status"], "Completed")

        # Verify Database Updates
        cons.refresh_from_db()
        self.assertEqual(cons.status, Consultation.Status.COMPLETED)
        self.assertEqual(cons.diagnosis, "Bacterial Sinusitis")

        self.token.refresh_from_db()
        self.assertEqual(self.token.status, Token.Status.COMPLETED)

        # Verify Consultation Bill
        self.assertTrue(ConsultationBill.objects.filter(token=self.token).exists())

        # 4. Verify Pharmacist Integration
        # Pharmacist logs in and fetches prescriptions via /api/pharmacy/prescriptions/
        self.client.force_authenticate(user=self.pharmacist_user)
        pharm_res = self.client.get("/api/pharmacy/prescriptions/")
        self.assertEqual(pharm_res.status_code, status.HTTP_200_OK)
        pharm_prescriptions = pharm_res.data if isinstance(pharm_res.data, list) else pharm_res.data.get("results", [])
        self.assertTrue(len(pharm_prescriptions) >= 1)
        rx_item = next((r for r in pharm_prescriptions if r["patient"] == self.patient.id), None)
        self.assertIsNotNone(rx_item)
        self.assertEqual(rx_item["doctor_name"], "Alice Smith")
        self.assertEqual(len(rx_item["items"]), 1)
        self.assertEqual(rx_item["items"][0]["medicine_name"], "Amoxicillin 500mg")
        self.assertEqual(rx_item["items"][0]["prescribed_quantity"], 10)

        # 5. Verify Lab Module Integration
        # Doctor created lab order should exist with status Recommended and report created
        self.assertTrue(LabOrder.objects.filter(consultation=cons).exists())
        lab_order = LabOrder.objects.get(consultation=cons)
        order_item = LabOrderItem.objects.get(lab_order=lab_order, test=self.lab_test)
        self.assertEqual(order_item.status, LabOrderItem.Status.RECOMMENDED)
        self.assertTrue(LabReport.objects.filter(lab_order=lab_order).exists())

    def test_patient_history_and_past_consultations_views(self):
        # Create an existing past consultation with prescription and lab result
        past_cons = Consultation.objects.create(
            token=self.token,
            patient=self.patient,
            doctor=self.doctor_profile,
            diagnosis="Hypertension Stage 1",
            clinical_notes="Advised low salt diet and regular exercise.",
            status=Consultation.Status.COMPLETED,
            completed_at=timezone.now(),
        )
        rx = Prescription.objects.create(
            consultation=past_cons,
            patient=self.patient,
            doctor=self.doctor_profile,
            status=Prescription.Status.DISPENSED,
        )
        PrescriptionItem.objects.create(
            prescription=rx,
            medicine=self.medicine,
            medicine_name="Amoxicillin 500mg",
            prescribed_quantity=10,
            dispensed_quantity=10,
            instructions="1 tab daily",
        )
        lab_order = LabOrder.objects.create(
            consultation=past_cons,
            patient=self.patient,
            doctor=self.doctor_profile,
        )
        lab_item = LabOrderItem.objects.create(
            lab_order=lab_order,
            test=self.lab_test,
            test_name=self.lab_test.name,
            cost=self.lab_test.cost,
            status=LabOrderItem.Status.COMPLETED,
            completed_date=self.today,
        )
        report = LabReport.objects.create(lab_order=lab_order, status=LabReport.Status.COMPLETED)
        LabResult.objects.create(
            order_item=lab_item,
            report=report,
            result="7.2 x10^9/L",
            reference_range="4.5 - 11.0 x10^9/L",
            remarks="Normal range.",
            technician=self.lab_tech_staff,
        )

        self.client.force_authenticate(user=self.doctor_user)

        # Test Patient History Endpoint
        history_res = self.client.get(f"/api/doctor/patients/{self.patient.id}/history/")
        self.assertEqual(history_res.status_code, status.HTTP_200_OK)
        data = history_res.data
        self.assertEqual(data["patient"]["full_name"], "John Doe")
        self.assertEqual(len(data["consultations"]), 1)
        self.assertEqual(data["consultations"][0]["diagnosis"], "Hypertension Stage 1")
        self.assertEqual(len(data["prescriptions"]), 1)
        self.assertEqual(data["prescriptions"][0]["items"][0]["medicine_name"], "Amoxicillin 500mg")
        self.assertEqual(len(data["lab_records"]), 1)
        self.assertEqual(data["lab_records"][0]["result"], "7.2 x10^9/L")
        self.assertEqual(data["lab_records"][0]["status"], "Completed")

        # Test Past Consultations Endpoint
        past_res = self.client.get("/api/doctor/past-consultations/?search=Hypertension")
        self.assertEqual(past_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(past_res.data), 1)
        self.assertEqual(past_res.data[0]["patient_name"], "John Doe")
        self.assertEqual(past_res.data[0]["prescription_items_count"], 1)
        self.assertEqual(past_res.data[0]["lab_tests_count"], 1)
