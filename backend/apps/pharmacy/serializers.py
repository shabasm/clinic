"""
apps/pharmacy/serializers.py

Serializers for the Pharmacy module: medicines, medicine requests,
prescriptions (with items), dispensing and pharmacy bills.
All models live in apps.admin_module, so they are imported from there.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.admin_module.models import (
    Medicine,
    MedicineRequest,
    PharmacyBill,
    PharmacyBillItem,
    Prescription,
    PrescriptionItem,
)


# ---------------------------------------------------------------------------
# Validation functions
# ---------------------------------------------------------------------------

# Validation for any quantity field (requests and dispensing).
def quantity_validation(quantity):
    if quantity < 1:
        raise serializers.ValidationError("Quantity must be at least 1.")
    return quantity


# Validation for the reason field in MedicineRequestSerializer.
def reason_validation(reason):
    if len(reason.strip()) > 0 and len(reason.strip()) < 3:
        raise serializers.ValidationError("Reason is too short.")
    return reason.strip()


# ---------------------------------------------------------------------------
# Medicines (master list, managed by the Admin, read by the pharmacist)
# ---------------------------------------------------------------------------
class MedicineSerializer(serializers.ModelSerializer):
    # stock_state is a property on the model: Expired / Out of stock / Low stock / In stock
    stock_state = serializers.ReadOnlyField()

    class Meta:
        model = Medicine
        fields = (
            "id",
            "name",
            "manufacturer",
            "price",
            "stock_quantity",
            "expiry_date",
            "is_active",
            "stock_state",
        )
        read_only_fields = fields  # the pharmacist only views medicines


# ---------------------------------------------------------------------------
# Medicine requests (pharmacist asks the Admin for more stock)
# ---------------------------------------------------------------------------
class MedicineRequestSerializer(serializers.ModelSerializer):
    requested_quantity = serializers.IntegerField(validators=[quantity_validation])
    reason = serializers.CharField(
        required=False, allow_blank=True, validators=[reason_validation]
    )
    medicine_name = serializers.CharField(source="medicine.name", read_only=True)

    class Meta:
        model = MedicineRequest
        fields = (
            "id",
            "medicine",
            "medicine_name",
            "current_stock",
            "requested_quantity",
            "processed_quantity",
            "reason",
            "status",
            "created_at",
            "processed_at",
        )
        # requested_by and current_stock are filled by the view; the Admin
        # handles status, processed_quantity and processed_at.
        read_only_fields = (
            "current_stock",
            "processed_quantity",
            "status",
            "created_at",
            "processed_at",
        )

    def validate_medicine(self, medicine):
        if not medicine.is_active:
            raise serializers.ValidationError("This medicine is inactive.")
        # One pending request per medicine.
        if MedicineRequest.objects.filter(
            medicine=medicine, status=MedicineRequest.Status.PENDING
        ).exists():
            raise serializers.ValidationError("A request for this medicine is already pending.")
        return medicine


# ---------------------------------------------------------------------------
# Prescriptions
# ---------------------------------------------------------------------------
def billing_totals(prescription):
    """{prescription_item_id: (billed_quantity, paid_quantity)} over all bills of a prescription."""
    totals = {}
    for bill in prescription.bills.all():
        is_paid = bill.payment_status == PharmacyBill.PaymentStatus.PAID
        for line in bill.items.all():
            if line.prescription_item_id:
                billed, paid = totals.get(line.prescription_item_id, (0, 0))
                totals[line.prescription_item_id] = (
                    billed + line.quantity,
                    paid + (line.quantity if is_paid else 0),
                )
    return totals


class PrescriptionItemSerializer(serializers.ModelSerializer):
    remaining_quantity = serializers.ReadOnlyField()  # model property: prescribed - dispensed
    stock_quantity = serializers.IntegerField(source="medicine.stock_quantity", read_only=True)
    unit_price = serializers.DecimalField(
        source="medicine.price", max_digits=8, decimal_places=2, read_only=True
    )
    expiry_date = serializers.DateField(source="medicine.expiry_date", read_only=True)
    medicine_is_active = serializers.BooleanField(source="medicine.is_active", read_only=True)
    stock_state = serializers.CharField(source="medicine.stock_state", read_only=True)
    # Worked out from the bills; "totals" is passed in by PrescriptionSerializer.
    billed_quantity = serializers.SerializerMethodField()
    paid_quantity = serializers.SerializerMethodField()
    dispensable_quantity = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = (
            "id",
            "medicine",
            "medicine_name",
            "prescribed_quantity",
            "dispensed_quantity",
            "remaining_quantity",
            "billed_quantity",
            "paid_quantity",
            "dispensable_quantity",
            "instructions",
            "stock_quantity",
            "unit_price",
            "expiry_date",
            "medicine_is_active",
            "stock_state",
        )
        read_only_fields = fields

    def _totals(self, item):
        return self.context.get("totals", {}).get(item.id, (0, 0))

    def get_billed_quantity(self, item):
        return self._totals(item)[0]

    def get_paid_quantity(self, item):
        return self._totals(item)[1]

    # Paid for but not yet handed over: what the pharmacist can dispense now.
    def get_dispensable_quantity(self, item):
        return max(self._totals(item)[1] - item.dispensed_quantity, 0)


class PrescriptionSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.staff.full_name", read_only=True)
    bill_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = (
            "id",
            "consultation",
            "patient",
            "patient_name",
            "doctor",
            "doctor_name",
            "date",
            "status",
            "bill_count",
            "items",
        )
        read_only_fields = fields

    def get_bill_count(self, prescription):
        if hasattr(prescription, "_prefetched_objects_cache") and "bills" in prescription._prefetched_objects_cache:
            return len(prescription.bills.all())
        return prescription.bills.count()

    def get_items(self, prescription):
        serializer = PrescriptionItemSerializer(
            prescription.items.all(),
            many=True,
            context={"totals": billing_totals(prescription)},
        )
        return serializer.data


# ---------------------------------------------------------------------------
# Input for "create bill" and "dispense": which items, and how many of each.
# "items" is optional; leaving it out means "everything that is possible".
# ---------------------------------------------------------------------------
class ItemQuantitySerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(validators=[quantity_validation])


class ItemQuantitiesSerializer(serializers.Serializer):
    items = ItemQuantitySerializer(many=True, required=False, allow_empty=False)

    def validate_items(self, items):
        ids = [i["item_id"] for i in items]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Each item can appear only once.")
        return items


class DispenseItemQuantitySerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=0)


class DispenseAndPaySerializer(serializers.Serializer):
    items = DispenseItemQuantitySerializer(many=True, required=True, allow_empty=False)

    def validate_items(self, items):
        ids = [i["item_id"] for i in items]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Each item can appear only once.")
        if not any(i.get("quantity", 0) > 0 for i in items):
            raise serializers.ValidationError("At least one item must have a quantity greater than 0.")
        return items


# ---------------------------------------------------------------------------
# Pharmacy bills
# ---------------------------------------------------------------------------
class PharmacyBillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyBillItem
        fields = (
            "id",
            "bill",
            "prescription_item",
            "medicine",
            "medicine_name",
            "quantity",
            "unit_price",
            "line_total",
        )


class PharmacyBillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    items = PharmacyBillItemSerializer(many=True, read_only=True)

    class Meta:
        model = PharmacyBill
        fields = (
            "id",
            "prescription",
            "patient",
            "patient_name",
            "subtotal",
            "total",
            "payment_status",
            "created_at",
            "paid_at",
            "items",
        )
        # Amounts are calculated by the server. Only payment_status can be changed.
        read_only_fields = ("prescription", "patient", "subtotal", "total", "created_at", "paid_at")

    def validate_payment_status(self, new_status):
        # A bill that is already Paid cannot go back to Pending.
        if (
            self.instance is not None
            and self.instance.payment_status == PharmacyBill.PaymentStatus.PAID
            and new_status != PharmacyBill.PaymentStatus.PAID
        ):
            raise serializers.ValidationError("A paid bill cannot be set back to Pending.")
        return new_status

    @transaction.atomic
    def update(self, instance, validated_data):
        was_pending = instance.payment_status == PharmacyBill.PaymentStatus.PENDING
        bill = super().update(instance, validated_data)
        if was_pending and bill.payment_status == PharmacyBill.PaymentStatus.PAID:
            bill.paid_at = timezone.now()
            bill.save(update_fields=["paid_at"])
        return bill
