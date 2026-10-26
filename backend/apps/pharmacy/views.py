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
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

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
        today = timezone.localdate()
        if stock == "low":
            limit = Settings.load().low_stock_threshold
            queryset = queryset.filter(
                stock_quantity__gt=0, stock_quantity__lte=limit, expiry_date__gte=today
            )
        elif stock == "out":
            queryset = queryset.filter(stock_quantity=0)
        elif stock == "expired":
            queryset = queryset.filter(expiry_date__lt=today)
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
       POST /prescriptions/<id>/create-bill/   step 1: bill the medicines
       POST /prescriptions/<id>/dispense/      step 3: give what has been paid for
       POST /prescriptions/<id>/decline/       only while Pending and not billed"""
    permission_classes = [IsPharmacist]
    serializer_class = PrescriptionSerializer

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
            for item in PrescriptionItem.objects.select_for_update()
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
                item.id: item.prescribed_quantity - totals.get(item.medicine_id, (0, 0))[0]
                for item in items.values()
            }
            if requested is None:
                requested = [
                    {"item_id": item_id, "quantity": qty} for item_id, qty in unbilled.items() if qty > 0
                ]
            if not requested:
                raise ValidationError("Everything on this prescription is already billed.")

            # Check everything first. Nothing is saved until all checks pass.
            for row in requested:
                item = items.get(row["item_id"])
                if item is None:
                    raise ValidationError(f"Item {row['item_id']} is not in this prescription.")
                medicine, quantity = item.medicine, row["quantity"]
                if quantity > unbilled[item.id]:
                    raise ValidationError(f"{item.medicine_name}: only {unbilled[item.id]} left to bill.")
                if not medicine.is_active:
                    raise ValidationError(f"{medicine.name} is inactive.")
                if medicine.expiry_date < today:
                    raise ValidationError(f"{medicine.name} is expired.")
                if quantity > medicine.stock_quantity:
                    raise ValidationError(f"{medicine.name}: only {medicine.stock_quantity} in stock.")

            bill = PharmacyBill.objects.create(
                patient=prescription.patient,
                prescription=prescription,
                subtotal=Decimal("0"),
                total=Decimal("0"),
            )
            subtotal = Decimal("0")
            for row in requested:
                medicine = items[row["item_id"]].medicine
                line_total = medicine.price * row["quantity"]
                subtotal += line_total
                PharmacyBillItem.objects.create(
                    bill=bill,
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
            # Lock the prescription, its items and their medicines so two
            # pharmacists cannot dispense the same stock at the same time.
            prescription = get_object_or_404(Prescription.objects.select_for_update(), pk=pk)
            if prescription.status in (Prescription.Status.DISPENSED, Prescription.Status.DECLINED):
                raise ValidationError(f"This prescription is already {prescription.status}.")

            items = self._locked_items(prescription)
            totals = billing_totals(prescription)
            # Paid for, but not yet handed over.
            ready = {
                item.id: max(totals.get(item.medicine_id, (0, 0))[1] - item.dispensed_quantity, 0)
                for item in items.values()
            }
            if requested is None:
                requested = [{"item_id": item_id, "quantity": qty} for item_id, qty in ready.items() if qty > 0]
            if not requested:
                raise ValidationError("Nothing to dispense. Create a bill and mark it as Paid first.")

            # Check everything first. Nothing is changed until all checks pass.
            for row in requested:
                item = items.get(row["item_id"])
                if item is None:
                    raise ValidationError(f"Item {row['item_id']} is not in this prescription.")
                medicine, quantity = item.medicine, row["quantity"]
                if quantity > ready[item.id]:
                    raise ValidationError(
                        f"{item.medicine_name}: only {ready[item.id]} paid for and ready to dispense."
                    )
                if not medicine.is_active:
                    raise ValidationError(f"{medicine.name} is inactive.")
                if medicine.expiry_date < today:
                    raise ValidationError(f"{medicine.name} is expired.")
                if quantity > medicine.stock_quantity:
                    raise ValidationError(f"{medicine.name}: only {medicine.stock_quantity} in stock.")

            # Reduce stock and record what was given.
            for row in requested:
                item, quantity = items[row["item_id"]], row["quantity"]
                medicine = item.medicine
                medicine.stock_quantity -= quantity
                medicine.save(update_fields=["stock_quantity"])
                item.dispensed_quantity += quantity
                item.save(update_fields=["dispensed_quantity"])

            everything_done = all(i.remaining_quantity == 0 for i in items.values())
            prescription.status = (
                Prescription.Status.DISPENSED if everything_done else Prescription.Status.PARTIAL
            )
            prescription.save(update_fields=["status"])

        return Response(PrescriptionSerializer(self.get_queryset().get(pk=prescription.pk)).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        with transaction.atomic():
            prescription = get_object_or_404(Prescription.objects.select_for_update(), pk=pk)
            if prescription.status != Prescription.Status.PENDING:
                raise ValidationError("Only a Pending prescription can be declined.")
            if prescription.bills.exists():
                raise ValidationError("A bill has already been created for this prescription.")
            prescription.status = Prescription.Status.DECLINED
            prescription.save(update_fields=["status"])
        return Response(PrescriptionSerializer(prescription).data)


# ---------------------------------------------------------------------------
# Pharmacy bills (read only, plus marking as paid or cancelling)
# ---------------------------------------------------------------------------
class PharmacyBillViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /bills/
       GET  /bills/?payment_status=Pending
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
        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)
        return queryset

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        bill = self.get_object()

        # Re-check stock at payment time, so nobody pays for medicine that is gone.
        if bill.payment_status == PharmacyBill.PaymentStatus.PENDING:
            for line in bill.items.select_related("medicine"):
                in_stock = line.medicine.stock_quantity
                if line.quantity > in_stock:
                    raise ValidationError(
                        f"{line.medicine_name}: only {in_stock} in stock now. "
                        "Cancel this bill or request stock."
                    )

        serializer = PharmacyBillSerializer(
            bill, data={"payment_status": PharmacyBill.PaymentStatus.PAID}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()  # also sets paid_at
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