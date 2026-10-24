from datetime import date, timedelta

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.admin_module.models import (
    Consultation,
    Department,
    DoctorProfile,
    Medicine,
    MedicineRequest,
    Patient,
    PharmacyBill,
    Prescription,
    PrescriptionItem,
    Staff,
    Token,
)

BASE = "/api/pharmacy"


class PharmacyFlowTests(APITestCase):
    def setUp(self):
        dept = Department.objects.create(name="General")
        doc_staff = Staff.objects.create(
            user=User.objects.create_user("doc", password="x"), full_name="Dr A",
            gender="Male", date_of_birth="1980-01-01", phone="1", role="Doctor",
            joining_date="2020-01-01",
        )
        self.doctor = DoctorProfile.objects.create(staff=doc_staff, department=dept)

        self.user = User.objects.create_user("pharm", password="x")
        self.pharmacist = Staff.objects.create(
            user=self.user, full_name="Pharm", gender="Male", date_of_birth="1990-01-01",
            phone="2", role="Pharmacist", joining_date="2021-01-01",
        )
        self.client.force_authenticate(self.user)

        self.patient1 = Patient.objects.create(
            full_name="P1", date_of_birth="2000-01-01", gender="Male", phone="3", address="x")
        self.patient2 = Patient.objects.create(
            full_name="P2", date_of_birth="2000-01-01", gender="Male", phone="4", address="x")

        expiry = date.today() + timedelta(days=300)
        self.para = Medicine.objects.create(name="Para", price=5, stock_quantity=10, expiry_date=expiry)
        self.amox = Medicine.objects.create(name="Amox", price=20, stock_quantity=0, expiry_date=expiry)
        self.token_no = 0

    def make_prescription(self, patient, items):
        self.token_no += 1
        token = Token.objects.create(
            doctor=self.doctor, patient=patient, date=date.today(),
            token_number=self.token_no, token_type="Walk-in")
        consultation = Consultation.objects.create(token=token, patient=patient, doctor=self.doctor)
        prescription = Prescription.objects.create(
            consultation=consultation, patient=patient, doctor=self.doctor)
        for medicine, qty in items:
            PrescriptionItem.objects.create(
                prescription=prescription, medicine=medicine,
                medicine_name=medicine.name, prescribed_quantity=qty)
        return prescription

    def create_bill(self, prescription, **body):
        return self.client.post(f"{BASE}/prescriptions/{prescription.id}/create-bill/", body, format="json")

    # ---- main flow --------------------------------------------------------
    def test_bill_pay_dispense(self):
        pres = self.make_prescription(self.patient1, [(self.para, 4)])
        response = self.create_bill(pres)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(float(response.data["total"]), 20.0)
        bill_id = response.data["id"]

        # Cannot dispense before paying.
        response = self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/")
        self.assertEqual(response.status_code, 400)

        self.assertEqual(self.client.post(f"{BASE}/bills/{bill_id}/pay/").status_code, 200)
        response = self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "Dispensed")
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 6)

    def test_partial_dispense(self):
        pres = self.make_prescription(self.patient1, [(self.para, 6)])
        item = pres.items.first()
        bill_id = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 2}]).data["id"]
        self.client.post(f"{BASE}/bills/{bill_id}/pay/")
        response = self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/")
        self.assertEqual(response.data["status"], "Partially Dispensed")

    def test_decline_only_without_bill(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        self.assertEqual(self.client.post(f"{BASE}/prescriptions/{pres.id}/decline/").status_code, 200)
        pres2 = self.make_prescription(self.patient2, [(self.para, 2)])
        self.create_bill(pres2)
        self.assertEqual(self.client.post(f"{BASE}/prescriptions/{pres2.id}/decline/").status_code, 400)

    def test_out_of_stock_item_blocks_default_bill(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2), (self.amox, 3)])
        self.assertEqual(self.create_bill(pres).status_code, 400)
        # Billing only the available item works.
        para_item = pres.items.get(medicine=self.para)
        response = self.create_bill(pres, items=[{"item_id": para_item.id, "quantity": 2}])
        self.assertEqual(response.status_code, 201)

    # ---- fix 1: cancel an unpaid bill ------------------------------------
    def test_cancel_unpaid_bill(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        bill_id = self.create_bill(pres).data["id"]
        self.assertEqual(self.client.post(f"{BASE}/bills/{bill_id}/cancel/").status_code, 204)
        self.assertFalse(PharmacyBill.objects.filter(pk=bill_id).exists())
        # Now the prescription is free again: new bill or decline.
        self.assertEqual(self.create_bill(pres).status_code, 201)

    def test_cannot_cancel_paid_bill(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        bill_id = self.create_bill(pres).data["id"]
        self.client.post(f"{BASE}/bills/{bill_id}/pay/")
        self.assertEqual(self.client.post(f"{BASE}/bills/{bill_id}/cancel/").status_code, 400)

    # ---- fix 2: stock re-checked when paying ------------------------------
    def test_pay_blocked_when_stock_gone(self):
        first = self.make_prescription(self.patient1, [(self.para, 8)])
        second = self.make_prescription(self.patient2, [(self.para, 8)])
        bill1 = self.create_bill(first).data["id"]
        bill2 = self.create_bill(second).data["id"]  # allowed: stock is not reserved
        self.client.post(f"{BASE}/bills/{bill1}/pay/")
        self.client.post(f"{BASE}/prescriptions/{first.id}/dispense/")  # stock is now 2
        response = self.client.post(f"{BASE}/bills/{bill2}/pay/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(PharmacyBill.objects.get(pk=bill2).payment_status, "Pending")

    # ---- fix 3: stock request rules ---------------------------------------
    def test_request_not_allowed_when_in_stock(self):
        # Default low-stock threshold is 10, so use a clearly healthy stock level.
        self.para.stock_quantity = 50
        self.para.save()
        response = self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.para.id, "requested_quantity": 5})
        self.assertEqual(response.status_code, 400)

    def test_request_for_out_of_stock_and_no_duplicate(self):
        data = {"medicine": self.amox.id, "requested_quantity": 20}
        self.assertEqual(self.client.post(f"{BASE}/medicine-requests/", data).status_code, 201)
        self.assertEqual(self.client.post(f"{BASE}/medicine-requests/", data).status_code, 400)
        request = MedicineRequest.objects.get()
        self.assertEqual(request.requested_by, self.pharmacist)
        self.assertEqual(request.current_stock, 0)

    # ---- permissions ------------------------------------------------------
    def test_only_pharmacist(self):
        self.client.force_authenticate(User.objects.create_user("other", password="x"))
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 403)