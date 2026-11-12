from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.admin_module.models import (
    Consultation,
    Department,
    DoctorProfile,
    Medicine,
    MedicineRequest,
    Patient,
    PharmacyBill,
    PharmacyBillItem,
    Prescription,
    PrescriptionItem,
    Settings,
    Staff,
    Token,
)

BASE = "/api/pharmacy"


class PharmacyFlowTests(APITestCase):
    def setUp(self):
        dept = Department.objects.create(name="General")
        self.doc_staff = Staff.objects.create(
            user=User.objects.create_user("doc", password="x"),
            full_name="Dr A",
            gender="Male",
            date_of_birth="1980-01-01",
            phone="1",
            role="Doctor",
            joining_date="2020-01-01",
        )
        self.doctor = DoctorProfile.objects.create(staff=self.doc_staff, department=dept)

        self.user = User.objects.create_user("pharm", password="x")
        self.pharmacist = Staff.objects.create(
            user=self.user,
            full_name="Pharm",
            gender="Male",
            date_of_birth="1990-01-01",
            phone="2",
            role="Pharmacist",
            joining_date="2021-01-01",
        )
        self.client.force_authenticate(self.user)

        self.patient1 = Patient.objects.create(
            full_name="P1", date_of_birth="2000-01-01", gender="Male", phone="3", address="x"
        )
        self.patient2 = Patient.objects.create(
            full_name="P2", date_of_birth="2000-01-01", gender="Male", phone="4", address="x"
        )

        expiry = date.today() + timedelta(days=300)
        self.para = Medicine.objects.create(name="Para", price=5, stock_quantity=10, expiry_date=expiry)
        self.amox = Medicine.objects.create(name="Amox", price=20, stock_quantity=0, expiry_date=expiry)
        self.token_no = 0

    def make_prescription(self, patient, items):
        self.token_no += 1
        token = Token.objects.create(
            doctor=self.doctor,
            patient=patient,
            date=date.today(),
            token_number=self.token_no,
            token_type="Walk-in",
        )
        consultation = Consultation.objects.create(token=token, patient=patient, doctor=self.doctor)
        prescription = Prescription.objects.create(
            consultation=consultation, patient=patient, doctor=self.doctor
        )
        for medicine, qty in items:
            PrescriptionItem.objects.create(
                prescription=prescription,
                medicine=medicine,
                medicine_name=medicine.name,
                prescribed_quantity=qty,
            )
        return prescription

    def create_bill(self, prescription, **body):
        return self.client.post(
            f"{BASE}/prescriptions/{prescription.id}/create-bill/", body, format="json"
        )

    # ---- original passing tests (kept intact) ------------------------------
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

    def test_decline_partially_dispensed_prescription(self):
        pres = self.make_prescription(self.patient1, [(self.para, 6)])
        item = pres.items.first()
        res = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 3}])
        bill_id = res.data["id"]
        self.client.post(f"{BASE}/bills/{bill_id}/pay/")
        self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/")
        pres.refresh_from_db()
        self.assertEqual(pres.status, Prescription.Status.PARTIAL)
        dec_res = self.client.post(f"{BASE}/prescriptions/{pres.id}/decline/")
        self.assertEqual(dec_res.status_code, 200)
        pres.refresh_from_db()
        self.assertEqual(pres.status, Prescription.Status.DECLINED)
        item.refresh_from_db()
        self.assertEqual(item.dispensed_quantity, 3)

    def test_out_of_stock_item_blocks_default_bill(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2), (self.amox, 3)])
        self.assertEqual(self.create_bill(pres).status_code, 400)
        # Billing only the available item works.
        para_item = pres.items.get(medicine=self.para)
        response = self.create_bill(pres, items=[{"item_id": para_item.id, "quantity": 2}])
        self.assertEqual(response.status_code, 201)

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

    def test_request_allowed_when_in_stock(self):
        self.para.stock_quantity = 50
        self.para.save()
        response = self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.para.id, "requested_quantity": 5}
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["current_stock"], 50)

    def test_request_inactive_medicine_rejected(self):
        self.para.is_active = False
        self.para.save()
        res = self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.para.id, "requested_quantity": 5}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("inactive", str(res.data).lower())
        self.para.is_active = True
        self.para.save()

    def test_request_for_out_of_stock_and_no_duplicate(self):
        data = {"medicine": self.amox.id, "requested_quantity": 20}
        self.assertEqual(self.client.post(f"{BASE}/medicine-requests/", data).status_code, 201)
        self.assertEqual(self.client.post(f"{BASE}/medicine-requests/", data).status_code, 400)
        request = MedicineRequest.objects.get()
        self.assertEqual(request.requested_by, self.pharmacist)
        self.assertEqual(request.current_stock, 0)

    def test_only_pharmacist(self):
        self.client.force_authenticate(User.objects.create_user("other", password="x"))
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 403)

    # ---- 1. Auth/permissions ----------------------------------------------
    def test_auth_and_permissions(self):
        # Unauthenticated -> 401
        self.client.logout()
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 401)

        # Doctor -> 403
        self.client.force_authenticate(self.doc_staff.user)
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 403)

        # Receptionist -> 403
        rec_user = User.objects.create_user("rec", password="x")
        Staff.objects.create(
            user=rec_user, full_name="Rec", gender="Female", date_of_birth="1992-02-02",
            phone="10", role=Staff.Role.RECEPTIONIST, joining_date="2021-01-01"
        )
        self.client.force_authenticate(rec_user)
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 403)

        # Lab Technician -> 403
        lab_user = User.objects.create_user("lab", password="x")
        Staff.objects.create(
            user=lab_user, full_name="Lab", gender="Male", date_of_birth="1993-03-03",
            phone="11", role=Staff.Role.LAB_TECHNICIAN, joining_date="2021-01-01"
        )
        self.client.force_authenticate(lab_user)
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 403)

        # Inactive pharmacist -> 403
        self.pharmacist.is_active = False
        self.pharmacist.save()
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 403)
        self.pharmacist.is_active = True
        self.pharmacist.save()

        # Superuser allowed
        admin = User.objects.create_superuser("admin_user", "admin@test.com", "x")
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get(f"{BASE}/medicines/").status_code, 200)

    # ---- 2. Prescriptions and medicines filtering -------------------------
    def test_filters_and_search(self):
        pres1 = self.make_prescription(self.patient1, [(self.para, 2)])
        pres2 = self.make_prescription(self.patient2, [(self.para, 2)])

        # Prescription ?status=
        res = self.client.get(f"{BASE}/prescriptions/?status=Pending")
        self.assertEqual(res.status_code, 200)
        ids = [p["id"] for p in res.data]
        self.assertIn(pres1.id, ids)

        # Prescription ?patient=
        res = self.client.get(f"{BASE}/prescriptions/?patient={self.patient1.id}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(all(p["patient"] == self.patient1.id for p in res.data))

        # Prescription ?search=<patient name>
        res = self.client.get(f"{BASE}/prescriptions/?search=P1")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(p["id"] == pres1.id for p in res.data))

        # Prescription ?search=<patient phone>
        res = self.client.get(f"{BASE}/prescriptions/?search=3")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(p["id"] == pres1.id for p in res.data))

        # Medicines ?search=
        res = self.client.get(f"{BASE}/medicines/?search=Para")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["name"], "Para")

        # Medicines ?stock=low|out|expired
        # Para has stock 10 (low stock threshold default is 10)
        res_low = self.client.get(f"{BASE}/medicines/?stock=low")
        self.assertEqual(res_low.status_code, 200)
        self.assertTrue(any(m["name"] == "Para" for m in res_low.data))

        res_out = self.client.get(f"{BASE}/medicines/?stock=out")
        self.assertEqual(res_out.status_code, 200)
        self.assertTrue(any(m["name"] == "Amox" for m in res_out.data))

        expired_med = Medicine.objects.create(
            name="ExpMed", price=10, stock_quantity=5, expiry_date=date.today() - timedelta(days=2)
        )
        res_exp = self.client.get(f"{BASE}/medicines/?stock=expired")
        self.assertEqual(res_exp.status_code, 200)
        self.assertTrue(any(m["name"] == "ExpMed" for m in res_exp.data))

    # ---- 3. Stock request validation --------------------------------------
    def test_stock_request_validation(self):
        # Invalid quantity: 0 or negative
        res = self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.amox.id, "requested_quantity": 0}
        )
        self.assertEqual(res.status_code, 400)
        res = self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.amox.id, "requested_quantity": -3}
        )
        self.assertEqual(res.status_code, 400)

        # Missing medicine
        res = self.client.post(f"{BASE}/medicine-requests/", {"requested_quantity": 5})
        self.assertEqual(res.status_code, 400)

        # Reason too short (< 3 chars when provided)
        res = self.client.post(
            f"{BASE}/medicine-requests/",
            {"medicine": self.amox.id, "requested_quantity": 5, "reason": "hi"},
        )
        self.assertEqual(res.status_code, 400)

        # Valid -> 201 with requested_by and current_stock filled
        res = self.client.post(
            f"{BASE}/medicine-requests/",
            {"medicine": self.amox.id, "requested_quantity": 10, "reason": "Urgent restock needed"},
        )
        self.assertEqual(res.status_code, 201)
        req = MedicineRequest.objects.get(pk=res.data["id"])
        self.assertEqual(req.requested_by, self.pharmacist)
        self.assertEqual(req.current_stock, 0)

    # ---- 4. Duplicate request and pharmacist isolation ---------------------
    def test_duplicate_pending_and_isolation(self):
        # Create a pending request
        self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.amox.id, "requested_quantity": 5}
        )
        # Duplicate pending request -> 400 with clear message
        res = self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.amox.id, "requested_quantity": 10}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("already pending", str(res.data))

        # Second pharmacist cannot see first pharmacist's requests
        user2 = User.objects.create_user("pharm2", password="x")
        Staff.objects.create(
            user=user2, full_name="Pharm 2", gender="Female", date_of_birth="1991-01-01",
            phone="22", role=Staff.Role.PHARMACIST, joining_date="2021-01-01",
        )
        self.client.force_authenticate(user2)
        res = self.client.get(f"{BASE}/medicine-requests/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)

    # ---- 5. Bill totals and frontend-sent totals ignored -------------------
    def test_bill_totals_calculated_by_server(self):
        pres = self.make_prescription(self.patient1, [(self.para, 4)])
        # Send fake frontend totals
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/create-bill/",
            {"subtotal": 999.00, "total": 999.00},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        # 4 * 5 = 20.00, not 999.00
        self.assertEqual(Decimal(str(res.data["subtotal"])), Decimal("20.00"))
        self.assertEqual(Decimal(str(res.data["total"])), Decimal("20.00"))
        line = res.data["items"][0]
        self.assertEqual(line["quantity"], 4)
        self.assertEqual(Decimal(str(line["unit_price"])), Decimal("5.00"))
        self.assertEqual(Decimal(str(line["line_total"])), Decimal("20.00"))

    # ---- 6. Create bill rejects expired, inactive, insufficient stock ------
    def test_create_bill_rejections(self):
        # Expired medicine
        exp_med = Medicine.objects.create(
            name="Exp", price=5, stock_quantity=10, expiry_date=date.today() - timedelta(days=1)
        )
        pres_exp = self.make_prescription(self.patient1, [(exp_med, 2)])
        self.assertEqual(self.create_bill(pres_exp).status_code, 400)

        # Inactive medicine
        inact_med = Medicine.objects.create(
            name="Inact", price=5, stock_quantity=10, expiry_date=date.today() + timedelta(days=50),
            is_active=False
        )
        pres_inact = self.make_prescription(self.patient1, [(inact_med, 2)])
        self.assertEqual(self.create_bill(pres_inact).status_code, 400)

        # Insufficient stock
        pres_over = self.make_prescription(self.patient1, [(self.para, 20)])  # stock is 10
        self.assertEqual(self.create_bill(pres_over).status_code, 400)

    # ---- 7. Cannot bill more than unbilled quantity ------------------------
    def test_cannot_bill_more_than_unbilled_quantity(self):
        pres = self.make_prescription(self.patient1, [(self.para, 6)])
        item = pres.items.first()
        # Bill 4 of 6 -> OK
        res = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 4}])
        self.assertEqual(res.status_code, 201)
        bill1_id = res.data["id"]
        self.client.post(f"{BASE}/bills/{bill1_id}/pay/")

        # Try billing 3 more (only 2 left unbilled) -> 400
        res = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 3}])
        self.assertEqual(res.status_code, 400)
        self.assertIn("left to bill", str(res.data))

        # Bill 2 -> OK
        res = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 2}])
        self.assertEqual(res.status_code, 201)
        bill2_id = res.data["id"]
        self.client.post(f"{BASE}/bills/{bill2_id}/pay/")

        # Try billing again -> 400
        res = self.create_bill(pres)
        self.assertEqual(res.status_code, 400)
        self.assertIn("already billed", str(res.data))

    # ---- 8, 9, 10, 11. Dispense validations, stock deduction, status, dispensed_at
    def test_dispense_flow_and_dispensed_at(self):
        pres = self.make_prescription(self.patient1, [(self.para, 6)])
        item = pres.items.first()

        # Bill 2
        bill_id = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 2}]).data["id"]

        # 8. Dispense before payment -> 400
        self.assertEqual(self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/").status_code, 400)

        # Pay the bill
        self.client.post(f"{BASE}/bills/{bill_id}/pay/")

        # 9. Dispense more than paid quantity -> 400
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense/",
            {"items": [{"item_id": item.id, "quantity": 3}]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("paid for and ready", str(res.data))

        # Dispense 2 -> Partially Dispensed, dispensed_at is None
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense/",
            {"items": [{"item_id": item.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "Partially Dispensed")
        pres.refresh_from_db()
        self.assertIsNone(pres.dispensed_at)
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 8)

        # 10. Dispense again -> 400 (nothing ready) and stock unchanged
        res = self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/")
        self.assertEqual(res.status_code, 400)
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 8)

        # Bill remaining 4, pay, dispense -> status Dispensed and dispensed_at is set
        bill2_id = self.create_bill(pres).data["id"]
        self.client.post(f"{BASE}/bills/{bill2_id}/pay/")
        res = self.client.post(f"{BASE}/prescriptions/{pres.id}/dispense/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "Dispensed")
        pres.refresh_from_db()
        self.assertIsNotNone(pres.dispensed_at)
        self.assertEqual(pres.dispensed_at.date(), timezone.localdate())
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 4)

    # ---- 12. Pay lifecycle and bill cancel ---------------------------------
    def test_pay_lifecycle(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        bill_id = self.create_bill(pres).data["id"]

        # Pay sets paid_at
        res = self.client.post(f"{BASE}/bills/{bill_id}/pay/")
        self.assertEqual(res.status_code, 200)
        bill = PharmacyBill.objects.get(pk=bill_id)
        self.assertEqual(bill.payment_status, PharmacyBill.PaymentStatus.PAID)
        self.assertIsNotNone(bill.paid_at)

        # Paying a Paid bill -> 400
        res = self.client.post(f"{BASE}/bills/{bill_id}/pay/")
        self.assertEqual(res.status_code, 400)

        # Paid bill cannot go back to Pending
        from apps.pharmacy.serializers import PharmacyBillSerializer
        serializer = PharmacyBillSerializer(
            bill, data={"payment_status": PharmacyBill.PaymentStatus.PENDING}, partial=True
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("cannot be set back to Pending", str(serializer.errors))

        # Cancel paid bill -> 400
        self.assertEqual(self.client.post(f"{BASE}/bills/{bill_id}/cancel/").status_code, 400)

    # ---- 13. Same medicine in two prescription items ----------------------
    def test_same_medicine_in_two_items(self):
        # Item A: 3, Item B: 4 (Total prescribed: 7, Stock: 10)
        self.token_no += 1
        token = Token.objects.create(
            doctor=self.doctor, patient=self.patient1, date=date.today(),
            token_number=self.token_no, token_type="Walk-in"
        )
        consultation = Consultation.objects.create(
            token=token, patient=self.patient1, doctor=self.doctor
        )
        pres = Prescription.objects.create(
            consultation=consultation, patient=self.patient1, doctor=self.doctor
        )
        item_a = PrescriptionItem.objects.create(
            prescription=pres, medicine=self.para, medicine_name=self.para.name, prescribed_quantity=3
        )
        item_b = PrescriptionItem.objects.create(
            prescription=pres, medicine=self.para, medicine_name=self.para.name, prescribed_quantity=4
        )

        # Bill only Item A for 2
        res = self.create_bill(pres, items=[{"item_id": item_a.id, "quantity": 2}])
        self.assertEqual(res.status_code, 201)
        bill_id = res.data["id"]
        # Check bill item has prescription_item
        bill_item = res.data["items"][0]
        self.assertEqual(bill_item["prescription_item"], item_a.id)

        # Verify prescription item numbers: Item A has billed 2, Item B has billed 0
        pres_res = self.client.get(f"{BASE}/prescriptions/{pres.id}/")
        items_data = {i["id"]: i for i in pres_res.data["items"]}
        self.assertEqual(items_data[item_a.id]["billed_quantity"], 2)
        self.assertEqual(items_data[item_b.id]["billed_quantity"], 0)

        # Pay bill
        self.client.post(f"{BASE}/bills/{bill_id}/pay/")
        pres_res = self.client.get(f"{BASE}/prescriptions/{pres.id}/")
        items_data = {i["id"]: i for i in pres_res.data["items"]}
        self.assertEqual(items_data[item_a.id]["paid_quantity"], 2)
        self.assertEqual(items_data[item_a.id]["dispensable_quantity"], 2)
        self.assertEqual(items_data[item_b.id]["paid_quantity"], 0)
        self.assertEqual(items_data[item_b.id]["dispensable_quantity"], 0)

        # If a request contains two rows for the same medicine exceeding stock -> rejected
        self.para.stock_quantity = 3
        self.para.save()
        # item A has 1 left unbilled, item B has 4 unbilled. Requesting 1 + 3 = 4 > stock (3)
        res_exceed = self.create_bill(
            pres, items=[{"item_id": item_a.id, "quantity": 1}, {"item_id": item_b.id, "quantity": 3}]
        )
        self.assertEqual(res_exceed.status_code, 400)
        self.assertIn("in stock", str(res_exceed.data))

        # Reset stock to 10
        self.para.stock_quantity = 10
        self.para.save()

        # Dispense item A (2 units) -> stock decrements from 10 to 8
        disp_res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense/",
            {"items": [{"item_id": item_a.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(disp_res.status_code, 200)
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 8)
        item_a.refresh_from_db()
        item_b.refresh_from_db()
        self.assertEqual(item_a.dispensed_quantity, 2)
        self.assertEqual(item_b.dispensed_quantity, 0)

    # ---- 14. Inventory is read-only for pharmacist -------------------------
    def test_inventory_read_only(self):
        # POST/PUT/PATCH/DELETE on /api/pharmacy/medicines/... -> 405 Method Not Allowed
        self.assertEqual(
            self.client.post(f"{BASE}/medicines/", {"name": "Test", "price": 10}).status_code, 405
        )
        self.assertEqual(
            self.client.put(f"{BASE}/medicines/{self.para.id}/", {"name": "Test"}).status_code, 405
        )
        self.assertEqual(
            self.client.patch(f"{BASE}/medicines/{self.para.id}/", {"price": 10}).status_code, 405
        )
        self.assertEqual(self.client.delete(f"{BASE}/medicines/{self.para.id}/").status_code, 405)

        # PATCH/DELETE on admin route /api/medicines/<id>/ -> 403 Forbidden
        self.assertEqual(self.client.patch(f"/api/medicines/{self.para.id}/", {"price": 10}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/medicines/{self.para.id}/").status_code, 403)

    # ---- 15. Admin integration: approve and replenish ---------------------
    def test_admin_replenish_integration(self):
        # Pharmacist creates a request for out-of-stock medicine
        req_res = self.client.post(
            f"{BASE}/medicine-requests/",
            {"medicine": self.amox.id, "requested_quantity": 25, "reason": "Restock needed"},
        )
        self.assertEqual(req_res.status_code, 201)
        req_id = req_res.data["id"]

        # Superuser approves and replenishes via /api/stock-requests/<id>/
        admin = User.objects.create_superuser("admin2", "admin2@test.com", "x")
        self.client.force_authenticate(admin)

        appr_res = self.client.post(f"/api/stock-requests/{req_id}/approve/")
        self.assertEqual(appr_res.status_code, 200)

        repl_res = self.client.post(f"/api/stock-requests/{req_id}/replenish/", {"quantity": 25})
        self.assertEqual(repl_res.status_code, 200)

        # Back to pharmacist
        self.client.force_authenticate(self.user)
        req_view = self.client.get(f"{BASE}/medicine-requests/{req_id}/")
        self.assertEqual(req_view.status_code, 200)
        self.assertEqual(req_view.data["status"], "Replenished")
        self.assertEqual(req_view.data["processed_quantity"], 25)

        # Medicines list shows increased stock
        med_res = self.client.get(f"{BASE}/medicines/{self.amox.id}/")
        self.assertEqual(med_res.status_code, 200)
        self.assertEqual(med_res.data["stock_quantity"], 25)

    # ---- 16. Dashboard endpoint -------------------------------------------
    def test_dashboard_endpoint(self):
        # Seed prescription in different states
        pres_pending = self.make_prescription(self.patient1, [(self.para, 2)])
        pres_partial = self.make_prescription(self.patient2, [(self.para, 4)])
        # Make pres_partial partially dispensed
        b_id = self.create_bill(pres_partial, items=[{"item_id": pres_partial.items.first().id, "quantity": 2}]).data["id"]
        self.client.post(f"{BASE}/bills/{b_id}/pay/")
        self.client.post(f"{BASE}/prescriptions/{pres_partial.id}/dispense/")

        # Make one fully dispensed today
        pres_disp = self.make_prescription(self.patient1, [(self.para, 1)])
        b_disp = self.create_bill(pres_disp).data["id"]
        self.client.post(f"{BASE}/bills/{b_disp}/pay/")
        self.client.post(f"{BASE}/prescriptions/{pres_disp.id}/dispense/")

        # Medicine request
        self.client.post(
            f"{BASE}/medicine-requests/", {"medicine": self.amox.id, "requested_quantity": 10}
        )

        res = self.client.get(f"{BASE}/dashboard/")
        self.assertEqual(res.status_code, 200)
        data = res.data

        expected_keys = {
            "pending_prescriptions",
            "partially_dispensed_prescriptions",
            "dispensed_today",
            "bills_today",
            "revenue_today",
            "low_stock_medicines",
            "out_of_stock_medicines",
            "expired_medicines",
            "pending_stock_requests",
        }
        self.assertEqual(set(data.keys()), expected_keys)
        self.assertGreaterEqual(data["pending_prescriptions"], 1)
        self.assertGreaterEqual(data["partially_dispensed_prescriptions"], 1)
        self.assertGreaterEqual(data["dispensed_today"], 1)
        self.assertGreaterEqual(data["bills_today"], 2)
        self.assertEqual(data["pending_stock_requests"], 1)

        # Non-pharmacist gets 403
        self.client.force_authenticate(self.doc_staff.user)
        self.assertEqual(self.client.get(f"{BASE}/dashboard/").status_code, 403)

    # ---- 17. Atomic dispense-and-pay endpoint -----------------------------
    def test_dispense_and_pay_full(self):
        pres = self.make_prescription(self.patient1, [(self.para, 4)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 4}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("bill", res.data)
        self.assertIn("prescription", res.data)
        self.assertEqual(res.data["prescription"]["status"], "Dispensed")
        pres.refresh_from_db()
        self.assertIsNotNone(pres.dispensed_at)
        self.assertEqual(res.data["bill"]["payment_status"], "Paid")
        self.assertEqual(float(res.data["bill"]["total"]), 20.0)

        # Check stock decremented
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 6)
        item.refresh_from_db()
        self.assertEqual(item.dispensed_quantity, 4)

    def test_dispense_and_pay_partial(self):
        pres = self.make_prescription(self.patient1, [(self.para, 6)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["prescription"]["status"], "Partially Dispensed")
        self.assertEqual(float(res.data["bill"]["total"]), 10.0)

        pres.refresh_from_db()
        self.assertEqual(pres.status, Prescription.Status.PARTIAL)
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 8)
        item.refresh_from_db()
        self.assertEqual(item.dispensed_quantity, 2)

    def test_dispense_and_pay_insufficient_stock(self):
        pres = self.make_prescription(self.patient1, [(self.amox, 2)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("stock", str(res.data).lower())

    def test_dispense_and_pay_more_than_prescribed_allowed(self):
        # Prescribed is 2, stock is 10. Pharmacist dispenses 5 (more than prescribed, within 60 limit).
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 5}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(float(res.data["bill"]["total"]), 25.0)
        self.para.refresh_from_db()
        self.assertEqual(self.para.stock_quantity, 5)
        item.refresh_from_db()
        self.assertEqual(item.dispensed_quantity, 5)
        pres.refresh_from_db()
        self.assertEqual(pres.status, Prescription.Status.DISPENSED)

    def test_dispense_and_pay_over_quantity(self):
        # Exceeding the maximum limit of 60 units is rejected.
        self.para.stock_quantity = 100
        self.para.save()
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 65}]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceeds the maximum limit", str(res.data).lower())

    def test_dispense_and_pay_zero_or_empty_quantity(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        item = pres.items.first()
        # All zeros -> 400
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 0}]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

        # Empty items list -> 400
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": []},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_dispense_and_pay_inactive_or_expired_medicine(self):
        inactive_med = Medicine.objects.create(
            name="InactiveMed", price=10, stock_quantity=10, expiry_date=date.today() + timedelta(days=30), is_active=False
        )
        pres = self.make_prescription(self.patient1, [(inactive_med, 1)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("inactive", str(res.data).lower())

        expired_med = Medicine.objects.create(
            name="ExpiredMed", price=10, stock_quantity=10, expiry_date=date.today() - timedelta(days=1), is_active=True
        )
        pres2 = self.make_prescription(self.patient1, [(expired_med, 1)])
        item2 = pres2.items.first()
        res2 = self.client.post(
            f"{BASE}/prescriptions/{pres2.id}/dispense-and-pay/",
            {"items": [{"item_id": item2.id, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(res2.status_code, 400)
        self.assertIn("expired", str(res2.data).lower())

    def test_dispense_and_pay_with_pending_bill(self):
        pres = self.make_prescription(self.patient1, [(self.para, 4)])
        # Create an unpaid bill via old flow
        self.create_bill(pres)
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("unpaid bill", str(res.data).lower())

    def test_dispense_and_pay_already_dispensed_or_declined(self):
        pres = self.make_prescription(self.patient1, [(self.para, 2)])
        item = pres.items.first()
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        # Trying again when already Dispensed -> 400
        res2 = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(res2.status_code, 400)
        self.assertIn("already", str(res2.data).lower())

    def test_dispense_and_pay_legacy_paid_items_not_charged_twice(self):
        pres = self.make_prescription(self.patient1, [(self.para, 4)])
        item = pres.items.first()
        # Old flow: bill 2, mark Paid
        b_res = self.create_bill(pres, items=[{"item_id": item.id, "quantity": 2}])
        self.client.post(f"{BASE}/bills/{b_res.data['id']}/pay/")

        # Now pharmacist uses dispense-and-pay for 3 units (2 already paid, 1 new)
        res = self.client.post(
            f"{BASE}/prescriptions/{pres.id}/dispense-and-pay/",
            {"items": [{"item_id": item.id, "quantity": 3}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        # Bill should only charge for 1 unit (5.0), not 3 (15.0)
        self.assertIsNotNone(res.data["bill"])
        self.assertEqual(float(res.data["bill"]["total"]), 5.0)
        item.refresh_from_db()
        self.assertEqual(item.dispensed_quantity, 3)
