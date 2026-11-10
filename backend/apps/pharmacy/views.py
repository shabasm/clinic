"""
apps/pharmacy/views.py

Views for the Pharmacy module. Pharmacists can:
  - see the active medicines and their stock (the Admin manages the list)
  - ask the Admin for more stock (medicine requests)
  - see prescriptions and work through them in this order (same idea as the lab):
        1. create a bill      (prices copied from the medicines)
        2. mark it as Paid
        3. dispense           (stock goes down; only paid-for quantities can be given)
    or decline a prescription that has no bill yet
  - see pharmacy bills, mark them as paid, or cancel unpaid ones
"""
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Sum
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.admin_module.models import (
    Medicine,
    MedicineRequest,
    PharmacyBill,
    PharmacyBillItem,
    Prescription,
    PrescriptionItem,
    Settings,
)

from .permissions import IsPharmacist
from .serializers import (
    DispenseAndPaySerializer,
    ItemQuantitiesSerializer,
    MedicineRequestSerializer,
    MedicineSerializer,
    PharmacyBillSerializer,
    PrescriptionSerializer,
    billing_totals,
)


def current_pharmacist(request):
    """The Staff record of the logged-in pharmacist."""
    staff = getattr(request.user, "staff", None)
    if staff is None:
        raise ValidationError("Your account is not linked to a staff record.")
    return staff


def filter_medicines_by_stock(queryset, stock_type, today=None, threshold=None):
    if today is None:
        today = timezone.localdate()
    if threshold is None:
        threshold = Settings.load().low_stock_threshold
    if stock_type == "low":
        return queryset.filter(
            stock_quantity__gt=0, stock_quantity__lte=threshold, expiry_date__gte=today
        )
    elif stock_type == "out":
        return queryset.filter(stock_quantity=0)
    elif stock_type == "expired":
        return queryset.filter(expiry_date__lt=today)
    return queryset


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
class PharmacyDashboardView(APIView):
    """GET /api/pharmacy/dashboard/"""
    permission_classes = [IsPharmacist]

    def get(self, request):
        today = timezone.localdate()
        active_meds = Medicine.objects.filter(is_active=True)
        threshold = Settings.load().low_stock_threshold

        low_stock = filter_medicines_by_stock(active_meds, "low", today=today, threshold=threshold).count()
        out_of_stock = filter_medicines_by_stock(active_meds, "out", today=today, threshold=threshold).count()
        expired = filter_medicines_by_stock(active_meds, "expired", today=today, threshold=threshold).count()

        stock_requests = MedicineRequest.objects.filter(status=MedicineRequest.Status.PENDING)
        staff = getattr(request.user, "staff", None)
        if staff is not None:
            stock_requests = stock_requests.filter(requested_by=staff)

        data = {
            "pending_prescriptions": Prescription.objects.filter(
                status=Prescription.Status.PENDING
            ).count(),
            "partially_dispensed_prescriptions": Prescription.objects.filter(
                status=Prescription.Status.PARTIAL
            ).count(),
            "dispensed_today": Prescription.objects.filter(
                status=Prescription.Status.DISPENSED, dispensed_at__date=today
            ).count(),
            "bills_today": PharmacyBill.objects.filter(created_at__date=today).count(),
            "revenue_today": str(PharmacyBill.objects.filter(created_at__date=today, payment_status=PharmacyBill.PaymentStatus.PAID).aggregate(t=Sum("total"))["t"] or 0),
            "low_stock_medicines": low_stock,
            "out_of_stock_medicines": out_of_stock,
            "expired_medicines": expired,
            "pending_stock_requests": stock_requests.count(),
        }
        return Response(data)


# ---------------------------------------------------------------------------
# Medicines (read only; the Admin adds and edits them)
# ---------------------------------------------------------------------------
class MedicineViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /medicines/                 active medicines
       GET /medicines/?search=para     search by name
       GET /medicines/?stock=low|out|expired"""
    permission_classes = [IsPharmacist]
    serializer_class = MedicineSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_queryset(self):
        queryset = Medicine.objects.filter(is_active=True).order_by("name")
        stock = self.request.query_params.get("stock")
        if stock:
            queryset = filter_medicines_by_stock(queryset, stock)
        return queryset


# ---------------------------------------------------------------------------
# Medicine requests (create and view; the Admin approves or ignores them)
# ---------------------------------------------------------------------------
class MedicineRequestViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """POST /medicine-requests/               ask for more stock
       GET  /medicine-requests/?status=Pending"""
    permission_classes = [IsPharmacist]
    serializer_class = MedicineRequestSerializer

    def get_queryset(self):
        queryset = MedicineRequest.objects.select_related("medicine").order_by("-created_at")
        staff = getattr(self.request.user, "staff", None)
        if staff is not None:  # a pharmacist sees only their own requests
            queryset = queryset.filter(requested_by=staff)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def perform_create(self, serializer):
        medicine = serializer.validated_data["medicine"]
        serializer.save(
            requested_by=current_pharmacist(self.request),
            current_stock=medicine.stock_quantity,  # stock at the moment of the request
        )


# ---------------------------------------------------------------------------
# Prescriptions (read, dispense, decline; doctors create them)
# ---------------------------------------------------------------------------
class PrescriptionViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /prescriptions/?status=Pending
       POST /prescriptions/<id>/create-bill/       step 1: bill the medicines
       POST /prescriptions/<id>/dispense/          step 3: give what has been paid for
       POST /prescriptions/<id>/dispense-and-pay/  one-step collect payment & dispense
       POST /prescriptions/<id>/decline/           only while Pending and not billed"""
    permission_classes = [IsPharmacist]
    serializer_class = PrescriptionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["patient__full_name", "patient__phone"]

    def get_queryset(self):
        queryset = (
            Prescription.objects.select_related("patient", "doctor__staff")
            .prefetch_related("items__medicine", "bills__items")
            .order_by("-date", "-id")
        )
        status_filter = self.request.query_params.get("status")
        patient = self.request.query_params.get("patient")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if patient:
            queryset = queryset.filter(patient_id=patient)
        return queryset

    def _locked_items(self, prescription):
        return {
            item.id: item
            for item in PrescriptionItem.objects.select_for_update(of=("self",))
            .select_related("medicine")
            .filter(prescription=prescription)
        }

    # ---- Step 1: create the bill -------------------------------------------
    @action(detail=True, methods=["post"], url_path="create-bill")
    def create_bill(self, request, pk=None):
        """Body is optional: {"items": [{"item_id": 1, "quantity": 4}]}
        Without a body, everything not yet billed is billed."""
        input_serializer = ItemQuantitiesSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        requested = input_serializer.validated_data.get("items")
        today = timezone.localdate()

        with transaction.atomic():
            prescription = get_object_or_404(Prescription.objects.select_for_update(), pk=pk)
            if prescription.status in (Prescription.Status.DISPENSED, Prescription.Status.DECLINED):
                raise ValidationError(f"This prescription is already {prescription.status}.")
            if prescription.bills.filter(payment_status=PharmacyBill.PaymentStatus.PENDING).exists():
                raise ValidationError("This prescription has an unpaid bill. Mark it as Paid first.")

            items = self._locked_items(prescription)
            totals = billing_totals(prescription)
            # Quantity of each item that has not been put on any bill yet.
            unbilled = {
                item.id: item.prescribed_quantity - totals.get(item.id, (0, 0))[0]
                for item in items.values()
            }
            if requested is None:
                requested = [
                    {"item_id": item_id, "quantity": qty} for item_id, qty in unbilled.items() if qty > 0
                ]
            if not requested:
                raise ValidationError("Everything on this prescription is already billed.")

            # Check everything first. Nothing is saved until all checks pass.
            medicine_quantities = {}
            medicine_map = {}
            for row in requested:
                item = items.get(row["item_id"])
                if item is None:
                    raise ValidationError(f"Item {row['item_id']} is not in this prescription.")
                quantity = row["quantity"]
                if quantity > unbilled[item.id]:
                    raise ValidationError(f"{item.medicine_name}: only {unbilled[item.id]} left to bill.")
                medicine = item.medicine
                medicine_map[medicine.id] = medicine
                if not medicine.is_active:
                    raise ValidationError(f"{medicine.name} is inactive.")
                if medicine.expiry_date < today:
                    raise ValidationError(f"{medicine.name} is expired.")
                medicine_quantities[medicine.id] = medicine_quantities.get(medicine.id, 0) + quantity

            for med_id, total_qty in medicine_quantities.items():
                med = medicine_map[med_id]
                if total_qty > med.stock_quantity:
                    raise ValidationError(f"{med.name}: only {med.stock_quantity} in stock.")

            bill = PharmacyBill.objects.create(
                patient=prescription.patient,
                prescription=prescription,
                subtotal=Decimal("0"),
                total=Decimal("0"),
            )
            subtotal = Decimal("0")
            for row in requested:
                item = items[row["item_id"]]
                medicine = item.medicine
                line_total = medicine.price * row["quantity"]
                subtotal += line_total
                PharmacyBillItem.objects.create(
                    bill=bill,
                    prescription_item=item,
                    medicine=medicine,
                    medicine_name=medicine.name,  # copied, so later price changes do not affect old bills
                    quantity=row["quantity"],
                    unit_price=medicine.price,
                    line_total=line_total,
                )
            bill.subtotal = bill.total = subtotal
            bill.save(update_fields=["subtotal", "total"])

        return Response(PharmacyBillSerializer(bill).data, status=status.HTTP_201_CREATED)

    # ---- Step 3: dispense what has been paid for ---------------------------
    @action(detail=True, methods=["post"])
    def dispense(self, request, pk=None):
        """Body is optional: {"items": [{"item_id": 1, "quantity": 4}]}
        Without a body, everything that is paid for and not yet given is dispensed."""
        input_serializer = ItemQuantitiesSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        requested = input_serializer.validated_data.get("items")
        today = timezone.localdate()

        with transaction.atomic():
            prescription = get_object_or_404(Prescription.objects.select_for_update(), pk=pk)
            if prescription.status in (Prescription.Status.DISPENSED, Prescription.Status.DECLINED):
                raise ValidationError(f"This prescription is already {prescription.status}.")

            # 1. Lock items with select_for_update(of=("self",))
            items = {
                item.id: item
                for item in PrescriptionItem.objects.select_for_update(of=("self",))
                .filter(prescription=prescription)
            }
            # 2. Lock the needed Medicine rows separately (ordered by id for a consistent lock order)
            medicine_ids = sorted({item.medicine_id for item in items.values()})
            medicines = {
                med.id: med
                for med in Medicine.objects.select_for_update().filter(id__in=medicine_ids).order_by("id")
            }

            totals = billing_totals(prescription)
            # Paid for, but not yet handed over.
            ready = {
                item.id: max(totals.get(item.id, (0, 0))[1] - item.dispensed_quantity, 0)
                for item in items.values()
            }
            if requested is None:
                requested = [{"item_id": item_id, "quantity": qty} for item_id, qty in ready.items() if qty > 0]
            if not requested:
                raise ValidationError("Nothing to dispense. Create a bill and mark it as Paid first.")

            # 3. Validate
            medicine_dispense_quantities = {}
            for row in requested:
                item = items.get(row["item_id"])
                if item is None:
                    raise ValidationError(f"Item {row['item_id']} is not in this prescription.")
                quantity = row["quantity"]
                if quantity > ready[item.id]:
                    raise ValidationError(
                        f"{item.medicine_name}: only {ready[item.id]} paid for and ready to dispense."
                    )
                medicine_dispense_quantities[item.medicine_id] = (
                    medicine_dispense_quantities.get(item.medicine_id, 0) + quantity
                )

            for med_id, total_qty in medicine_dispense_quantities.items():
                medicine = medicines[med_id]
                if not medicine.is_active:
                    raise ValidationError(f"{medicine.name} is inactive.")
                if medicine.expiry_date < today:
                    raise ValidationError(f"{medicine.name} is expired.")
                if total_qty > medicine.stock_quantity:
                    raise ValidationError(f"{medicine.name}: only {medicine.stock_quantity} in stock.")

            # 4. Decrement each medicine ONCE with the summed quantity; update each item's dispensed_quantity
            for med_id, total_qty in medicine_dispense_quantities.items():
                medicine = medicines[med_id]
                medicine.stock_quantity -= total_qty
                medicine.save(update_fields=["stock_quantity"])

            for row in requested:
                item = items[row["item_id"]]
                item.dispensed_quantity += row["quantity"]
                item.save(update_fields=["dispensed_quantity"])

            # 5. Status: Dispensed when every item has remaining_quantity == 0, else Partially Dispensed.
            # When it becomes Dispensed, set dispensed_at = timezone.now().
            everything_done = all(i.remaining_quantity <= 0 for i in items.values())
            if everything_done:
                prescription.status = Prescription.Status.DISPENSED
                prescription.dispensed_at = timezone.now()
                prescription.save(update_fields=["status", "dispensed_at"])
            else:
                prescription.status = Prescription.Status.PARTIAL
                prescription.save(update_fields=["status"])

        return Response(PrescriptionSerializer(self.get_queryset().get(pk=prescription.pk)).data)

    # ---- One-step: collect payment and dispense ----------------------------
    @action(detail=True, methods=["post"], url_path="dispense-and-pay")
    def dispense_and_pay(self, request, pk=None):
        """Atomic one-step billing and dispensing.
        Body: {"items": [{"item_id": 1, "quantity": 4}, ...]}
        Creates a Paid PharmacyBill, deducts medicine stock, updates item dispensed_quantity,
        and sets prescription status to Dispensed or Partially Dispensed."""
        input_serializer = DispenseAndPaySerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        requested = input_serializer.validated_data["items"]
        today = timezone.localdate()

        with transaction.atomic():
            prescription = get_object_or_404(Prescription.objects.select_for_update(), pk=pk)
            if prescription.status in (Prescription.Status.DISPENSED, Prescription.Status.DECLINED):
                raise ValidationError(f"This prescription is already {prescription.status}.")
            if prescription.bills.filter(payment_status=PharmacyBill.PaymentStatus.PENDING).exists():
                raise ValidationError(
                    "This prescription has an unpaid bill. Please cancel it from the Bills page first."
                )

            # 1. Lock items with select_for_update(of=("self",))
            items = {
                item.id: item
                for item in PrescriptionItem.objects.select_for_update(of=("self",))
                .select_related("medicine")
                .filter(prescription=prescription)
            }
            # 2. Lock the needed Medicine rows separately (ordered by id for a consistent lock order)
            medicine_ids = sorted({item.medicine_id for item in items.values()})
            medicines = {
                med.id: med
                for med in Medicine.objects.select_for_update().filter(id__in=medicine_ids).order_by("id")
            }

            totals = billing_totals(prescription)

            # 3. Validate requested items and calculate quantities
            MAX_DISPENSE_LIMIT_PER_MEDICINE = 60
            medicine_dispense_quantities = {}
            items_to_process = []
            for row in requested:
                item_id = row["item_id"]
                quantity = row["quantity"]
                item = items.get(item_id)
                if item is None:
                    raise ValidationError(f"Item {item_id} is not in this prescription.")
                if quantity <= 0:
                    continue
                max_allowed = max(0, MAX_DISPENSE_LIMIT_PER_MEDICINE - item.dispensed_quantity)
                if quantity > max_allowed:
                    raise ValidationError(
                        f"{item.medicine_name}: quantity {quantity} exceeds the maximum limit of {MAX_DISPENSE_LIMIT_PER_MEDICINE} units (already dispensed: {item.dispensed_quantity})."
                    )
                medicine = medicines[item.medicine_id]
                if not medicine.is_active:
                    raise ValidationError(f"{medicine.name} is inactive.")
                if medicine.expiry_date < today:
                    raise ValidationError(f"{medicine.name} is expired.")

                medicine_dispense_quantities[medicine.id] = (
                    medicine_dispense_quantities.get(medicine.id, 0) + quantity
                )
                items_to_process.append((item, medicine, quantity))

            if not items_to_process:
                raise ValidationError("Please specify at least 1 unit of medicine to dispense.")

            # Stock check (summed per medicine)
            for med_id, total_qty in medicine_dispense_quantities.items():
                med = medicines[med_id]
                if total_qty > med.stock_quantity:
                    raise ValidationError(f"{med.name}: only {med.stock_quantity} in stock.")

            # 4. Create Paid PharmacyBill for any quantities not already covered by prior paid bills
            now = timezone.now()
            subtotal = Decimal("0")
            bill_items_to_create = []

            for item, medicine, quantity in items_to_process:
                paid_quantity = totals.get(item.id, (0, 0))[1]
                already_paid_not_dispensed = max(paid_quantity - item.dispensed_quantity, 0)
                newly_billed_qty = max(quantity - already_paid_not_dispensed, 0)
                if newly_billed_qty > 0:
                    line_total = medicine.price * newly_billed_qty
                    subtotal += line_total
                    bill_items_to_create.append({
                        "prescription_item": item,
                        "medicine": medicine,
                        "medicine_name": medicine.name,
                        "quantity": newly_billed_qty,
                        "unit_price": medicine.price,
                        "line_total": line_total,
                    })

            bill = None
            if bill_items_to_create:
                bill = PharmacyBill.objects.create(
                    patient=prescription.patient,
                    prescription=prescription,
                    subtotal=subtotal,
                    total=subtotal,
                    payment_status=PharmacyBill.PaymentStatus.PAID,
                    paid_at=now,
                )
                for b_item in bill_items_to_create:
                    PharmacyBillItem.objects.create(bill=bill, **b_item)

            # 5. Decrement each medicine stock ONCE with the summed quantity
            for med_id, total_qty in medicine_dispense_quantities.items():
                medicine = medicines[med_id]
                medicine.stock_quantity -= total_qty
                medicine.save(update_fields=["stock_quantity"])

            # 6. Update items' dispensed_quantity
            for item, medicine, quantity in items_to_process:
                item.dispensed_quantity += quantity
                item.save(update_fields=["dispensed_quantity"])

            # 7. Update prescription status
            everything_done = all(i.remaining_quantity <= 0 for i in items.values())
            if everything_done:
                prescription.status = Prescription.Status.DISPENSED
                prescription.dispensed_at = now
                prescription.save(update_fields=["status", "dispensed_at"])
            else:
                prescription.status = Prescription.Status.PARTIAL
                prescription.save(update_fields=["status"])

        updated_prescription = PrescriptionSerializer(
            self.get_queryset().get(pk=prescription.pk),
            context={"totals": billing_totals(prescription)},
        ).data
        bill_data = PharmacyBillSerializer(bill).data if bill else None
        return Response({"bill": bill_data, "prescription": updated_prescription}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        with transaction.atomic():
            prescription = get_object_or_404(Prescription.objects.select_for_update(), pk=pk)
            if prescription.status not in (Prescription.Status.PENDING, Prescription.Status.PARTIAL):
                raise ValidationError("Only a Pending or Partially Dispensed prescription can be declined.")
            if prescription.bills.filter(payment_status=PharmacyBill.PaymentStatus.PENDING).exists():
                raise ValidationError("Please cancel or pay any unpaid bills before declining this prescription.")
            prescription.status = Prescription.Status.DECLINED
            prescription.save(update_fields=["status"])
        return Response(PrescriptionSerializer(prescription).data)


# ---------------------------------------------------------------------------
# Pharmacy bills (read only, plus marking as paid or cancelling)
# ---------------------------------------------------------------------------
class PharmacyBillViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /bills/
       GET  /bills/?payment_status=Pending
       GET  /bills/?prescription=<id>
       POST /bills/<id>/pay/       mark the bill as Paid
       POST /bills/<id>/cancel/    delete a bill that is still unpaid"""
    permission_classes = [IsPharmacist]
    serializer_class = PharmacyBillSerializer

    def get_queryset(self):
        queryset = (
            PharmacyBill.objects.select_related("patient", "prescription")
            .prefetch_related("items")
            .order_by("-created_at")
        )
        payment_status = self.request.query_params.get("payment_status")
        prescription = self.request.query_params.get("prescription")
        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)
        if prescription:
            queryset = queryset.filter(prescription_id=prescription)
        return queryset

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        today = timezone.localdate()
        with transaction.atomic():
            bill = get_object_or_404(
                PharmacyBill.objects.select_for_update().prefetch_related("items__medicine"),
                pk=pk,
            )
            if bill.payment_status != PharmacyBill.PaymentStatus.PENDING:
                raise ValidationError("Only a Pending bill can be marked as Paid.")

            # Re-check, per medicine (sum of that bill's lines): medicine active, not expired, and stock sufficient.
            medicine_quantities = {}
            medicine_map = {}
            for line in bill.items.all():
                med = line.medicine
                medicine_map[med.id] = med
                medicine_quantities[med.id] = medicine_quantities.get(med.id, 0) + line.quantity

            for med_id, total_qty in medicine_quantities.items():
                med = medicine_map[med_id]
                if not med.is_active:
                    raise ValidationError(f"{med.name} is inactive.")
                if med.expiry_date < today:
                    raise ValidationError(f"{med.name} is expired.")
                if total_qty > med.stock_quantity:
                    raise ValidationError(
                        f"{med.name}: only {med.stock_quantity} in stock now. "
                        "Cancel this bill or request stock."
                    )

            serializer = PharmacyBillSerializer(
                bill, data={"payment_status": PharmacyBill.PaymentStatus.PAID}, partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel (delete) a bill that has not been paid yet."""
        with transaction.atomic():
            bill = get_object_or_404(PharmacyBill.objects.select_for_update(), pk=pk)
            if bill.payment_status != PharmacyBill.PaymentStatus.PENDING:
                raise ValidationError("Only an unpaid bill can be cancelled.")
            bill.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
