"""
apps/lab/serializers.py

Serializers for the Lab module: tests, orders, order items, results, reports and bills.
All models live in apps.admin_module, so they are imported from there.
"""
import re

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.admin_module.models import (
    LabBill,
    LabBillItem,
    LabOrder,
    LabOrderItem,
    LabReport,
    LabResult,
    LabTest,
)


# ---------------------------------------------------------------------------
# Validation functions
# ---------------------------------------------------------------------------

# Validation for the name field in LabTestSerializer.
def test_name_validation(name):
    # Letters, digits, spaces, hyphens and brackets, so names like
    # "Vitamin B12" or "Blood Sugar (Fasting)" are allowed.
    if len(name.strip()) < 2 or not re.match(r"^[A-Za-z0-9 \-()]+$", name):
        raise serializers.ValidationError(
            "Test name must be at least 2 characters and contain only letters, "
            "numbers, spaces, hyphens or brackets."
        )
    return name.strip()


# Validation for the cost field in LabTestSerializer.
def cost_validation(cost):
    if cost <= 0:
        raise serializers.ValidationError("Cost must be greater than zero.")
    return cost


# Validation for the result field in LabResultSerializer.
def result_validation(result):
    if not result.strip():
        raise serializers.ValidationError("Result cannot be empty.")
    return result.strip()


# ---------------------------------------------------------------------------
# Lab tests (master list, managed by the Admin, read by the lab module)
# ---------------------------------------------------------------------------
class LabTestSerializer(serializers.ModelSerializer):
    name = serializers.CharField(validators=[test_name_validation])
    cost = serializers.DecimalField(
        max_digits=8, decimal_places=2, validators=[cost_validation]
    )

    class Meta:
        model = LabTest
        fields = ("id", "name", "normal_values", "cost", "is_active")


# ---------------------------------------------------------------------------
# Lab results
# ---------------------------------------------------------------------------
class LabResultSerializer(serializers.ModelSerializer):
    result = serializers.CharField(validators=[result_validation])
    # technician is never sent by the client. The view passes it in:
    # serializer.save(technician=request.user.staff)
    technician_name = serializers.CharField(source="technician.full_name", read_only=True)
    test_name = serializers.CharField(source="order_item.test_name", read_only=True)

    class Meta:
        model = LabResult
        fields = (
            "id",
            "report",
            "order_item",
            "test_name",
            "result",
            "reference_range",
            "remarks",
            "technician",
            "technician_name",
            "result_date",
        )
        read_only_fields = ("report", "technician", "result_date")

    # A result can only be entered for a test that has been paid and not yet finished.
    def validate_order_item(self, order_item):
        if self.instance is None and order_item.status not in (
            LabOrderItem.Status.PAID,
            LabOrderItem.Status.IN_PROGRESS,
        ):
            raise serializers.ValidationError(
                "Results can only be entered for tests that are Paid or In Progress."
            )
        return order_item

    # Saving a result also marks the test as Completed and associates with LabReport.
    @transaction.atomic
    def create(self, validated_data):
        order_item = validated_data["order_item"]

        # If no reference range was typed, use the test's normal values.
        if not validated_data.get("reference_range"):
            validated_data["reference_range"] = order_item.test.normal_values

        # Ensure order has a LabReport and link this result to it
        report, _ = LabReport.objects.get_or_create(lab_order=order_item.lab_order)
        validated_data["report"] = report

        result = super().create(validated_data)

        order_item.status = LabOrderItem.Status.COMPLETED
        order_item.completed_date = timezone.localdate()
        order_item.save(update_fields=["status", "completed_date"])

        # Update consolidated report status based on all accepted tests
        accepted_items = order_item.lab_order.items.exclude(
            status__in=[LabOrderItem.Status.DECLINED, LabOrderItem.Status.CANCELLED]
        )
        all_completed = (
            accepted_items.exists()
            and not accepted_items.exclude(status=LabOrderItem.Status.COMPLETED).exists()
        )
        if all_completed:
            report.status = LabReport.Status.COMPLETED
        else:
            report.status = LabReport.Status.PARTIALLY_COMPLETED
        report.save(update_fields=["status"])

        return result

    # The test a result belongs to cannot be changed once it is saved.
    def update(self, instance, validated_data):
        validated_data.pop("order_item", None)
        validated_data.pop("report", None)
        return super().update(instance, validated_data)


# ---------------------------------------------------------------------------
# Lab order items (one test inside an order)
# ---------------------------------------------------------------------------
class LabOrderItemSerializer(serializers.ModelSerializer):
    # result_details is None until the technician saves a result.
    result_details = LabResultSerializer(source="result", read_only=True)
    normal_values = serializers.CharField(source="test.normal_values", read_only=True)

    class Meta:
        model = LabOrderItem
        fields = (
            "id",
            "lab_order",
            "test",
            "test_name",
            "normal_values",
            "cost",
            "status",
            "selected_date",
            "declined_date",
            "paid_date",
            "completed_date",
            "result_details",
        )
        # test_name and cost are copied from the LabTest when the item is created,
        # and status changes through dedicated actions.
        read_only_fields = (
            "test_name",
            "normal_values",
            "cost",
            "status",
            "selected_date",
            "declined_date",
            "paid_date",
            "completed_date",
        )

    def create(self, validated_data):
        test = validated_data["test"]
        validated_data["test_name"] = test.name
        validated_data["cost"] = test.cost
        return super().create(validated_data)


# Used for transitions like Recommended -> Selected / Declined, and Paid -> In Progress.
class LabItemStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabOrderItem
        fields = ("id", "status")

    def validate_status(self, new_status):
        current = self.instance.status
        allowed = {
            LabOrderItem.Status.RECOMMENDED: {
                LabOrderItem.Status.SELECTED,
                LabOrderItem.Status.DECLINED,
            },
            LabOrderItem.Status.SELECTED: {
                LabOrderItem.Status.DECLINED,
            },
            LabOrderItem.Status.PAID: {
                LabOrderItem.Status.IN_PROGRESS,
            },
            # Completed is set by saving a result, not by this serializer.
        }
        if new_status not in allowed.get(current, set()):
            raise serializers.ValidationError(
                f"A test that is '{current}' cannot be changed to '{new_status}'."
            )
        return new_status


# ---------------------------------------------------------------------------
# Lab reports (one consolidated report per LabOrder)
# ---------------------------------------------------------------------------
class LabReportSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="lab_order.patient.full_name", read_only=True)
    doctor_name = serializers.CharField(source="lab_order.doctor.staff.full_name", read_only=True)
    released_by_name = serializers.CharField(source="released_by.full_name", read_only=True)
    order_date = serializers.DateField(source="lab_order.date", read_only=True)
    results = LabResultSerializer(many=True, read_only=True)

    class Meta:
        model = LabReport
        fields = (
            "id",
            "lab_order",
            "patient_name",
            "doctor_name",
            "order_date",
            "status",
            "released_at",
            "released_by",
            "released_by_name",
            "summary_notes",
            "created_at",
            "updated_at",
            "results",
        )
        read_only_fields = (
            "lab_order",
            "status",
            "released_at",
            "released_by",
            "created_at",
            "updated_at",
        )


# ---------------------------------------------------------------------------
# Lab orders
# ---------------------------------------------------------------------------
class LabOrderSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_phone = serializers.CharField(source="patient.phone", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    patient_date_of_birth = serializers.DateField(source="patient.date_of_birth", read_only=True)
    doctor_name = serializers.CharField(source="doctor.staff.full_name", read_only=True)
    # overall_status is calculated on the model from its tests, never stored.
    overall_status = serializers.ReadOnlyField()
    items = LabOrderItemSerializer(many=True, read_only=True)
    report_id = serializers.IntegerField(source="report.id", read_only=True)
    report_status = serializers.CharField(source="report.status", read_only=True)

    class Meta:
        model = LabOrder
        fields = (
            "id",
            "consultation",
            "patient",
            "patient_name",
            "patient_phone",
            "patient_gender",
            "patient_date_of_birth",
            "doctor",
            "doctor_name",
            "date",
            "overall_status",
            "report_id",
            "report_status",
            "items",
        )
        read_only_fields = ("date",)


# ---------------------------------------------------------------------------
# Lab bills
# ---------------------------------------------------------------------------
class LabBillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabBillItem
        fields = (
            "id",
            "bill",
            "order_item",
            "test",
            "test_name",
            "quantity",
            "unit_price",
            "line_total",
        )
        read_only_fields = ("bill",)


class LabBillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    items = LabBillItemSerializer(many=True, read_only=True)

    class Meta:
        model = LabBill
        fields = (
            "id",
            "lab_order",
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
        read_only_fields = ("lab_order", "patient", "subtotal", "total", "created_at", "paid_at")

    def validate_payment_status(self, new_status):
        # A bill that is already Paid cannot go back to Pending.
        if (
            self.instance is not None
            and self.instance.payment_status == LabBill.PaymentStatus.PAID
            and new_status != LabBill.PaymentStatus.PAID
        ):
            raise serializers.ValidationError("A paid bill cannot be set back to Pending.")
        return new_status

    # Marking a bill as Paid also marks its accepted tests as Paid.
    @transaction.atomic
    def update(self, instance, validated_data):
        was_pending = instance.payment_status == LabBill.PaymentStatus.PENDING
        bill = super().update(instance, validated_data)

        if was_pending and bill.payment_status == LabBill.PaymentStatus.PAID:
            bill.paid_at = timezone.now()
            bill.save(update_fields=["paid_at"])

            # Use direct order_item FK if populated, falling back to test_id
            billed_order_item_ids = [
                item.order_item_id
                for item in bill.items.all()
                if item.order_item_id is not None
            ]
            if billed_order_item_ids:
                bill.lab_order.items.filter(
                    id__in=billed_order_item_ids,
                    status=LabOrderItem.Status.SELECTED,
                ).update(status=LabOrderItem.Status.PAID, paid_date=timezone.localdate())
            else:
                billed_test_ids = bill.items.values_list("test_id", flat=True)
                bill.lab_order.items.filter(
                    test_id__in=billed_test_ids,
                    status=LabOrderItem.Status.SELECTED,
                ).update(status=LabOrderItem.Status.PAID, paid_date=timezone.localdate())
        return bill
