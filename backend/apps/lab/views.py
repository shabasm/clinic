"""
apps/lab/views.py

Views for the Lab module. Lab technicians can:
  - see the active lab tests (the Admin manages the master list)
  - see orders and tests that have been paid for
  - start a test and enter its result
  - see consolidated lab reports and release them when all accepted tests are complete
  - see lab bills and mark them as paid
"""
from django.db import transaction
from django.utils import timezone
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.admin_module.models import (
    LabBill,
    LabBillItem,
    LabOrder,
    LabOrderItem,
    LabReport,
    LabResult,
    LabTest,
)

from .lab_permissions import IsLabTechnician
from .serializers import (
    LabBillSerializer,
    LabItemStatusSerializer,
    LabOrderItemSerializer,
    LabOrderSerializer,
    LabReportSerializer,
    LabResultSerializer,
    LabTestSerializer,
)

# Tests the lab can see in the active processing queue: unpaid/declined/cancelled ones are hidden.
LAB_VISIBLE_STATUSES = [
    LabOrderItem.Status.PAID,
    LabOrderItem.Status.IN_PROGRESS,
    LabOrderItem.Status.COMPLETED,
]


def current_technician(request):
    """The Staff record of the logged-in lab technician."""
    staff = getattr(request.user, "staff", None)
    if staff is None:
        raise ValidationError("Your account is not linked to a staff record.")
    return staff


# ---------------------------------------------------------------------------
# Lab tests (read only; the Admin adds and edits them)
# ---------------------------------------------------------------------------
class LabTestViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsLabTechnician]
    serializer_class = LabTestSerializer
    queryset = LabTest.objects.filter(is_active=True).order_by("name")
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]


# ---------------------------------------------------------------------------
# Lab orders (read only; doctors create them)
# ---------------------------------------------------------------------------
class LabOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /orders/                   all orders (or filtered by status/date/patient)
       GET /orders/?date=YYYY-MM-DD   orders from one day
       GET /orders/?patient=<id>      orders for one patient
       POST /orders/<id>/bill/         bill selected tests and mark them paid"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabOrderSerializer

    def get_queryset(self):
        queryset = (
            LabOrder.objects.select_related("patient", "doctor__staff", "report")
            .prefetch_related("items__result", "items__test")
            .order_by("-date", "-id")
        )
        date = self.request.query_params.get("date")
        patient = self.request.query_params.get("patient")
        status = self.request.query_params.get("status")
        if date:
            queryset = queryset.filter(date=date)
        if patient:
            queryset = queryset.filter(patient_id=patient)
        if status:
            queryset = queryset.filter(items__status=status).distinct()
        return queryset

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def bill(self, request, pk=None):
        order = self.get_object()
        item_ids = request.data.get("item_ids", [])
        if not item_ids:
            raise ValidationError("Please select at least one test to bill.")

        items_to_bill = order.items.filter(id__in=item_ids)
        if items_to_bill.count() != len(item_ids):
            raise ValidationError("One or more selected tests do not belong to this order.")

        invalid_items = items_to_bill.filter(
            status__in=[
                LabOrderItem.Status.PAID,
                LabOrderItem.Status.IN_PROGRESS,
                LabOrderItem.Status.COMPLETED,
                LabOrderItem.Status.CANCELLED,
            ]
        )
        if invalid_items.exists():
            names = ", ".join(invalid_items.values_list("test_name", flat=True))
            raise ValidationError(f"The following tests cannot be billed ({names}).")

        bill, _ = LabBill.objects.get_or_create(
            lab_order=order,
            defaults={
                "patient": order.patient,
                "subtotal": 0,
                "total": 0,
                "payment_status": LabBill.PaymentStatus.PAID,
                "paid_at": timezone.now(),
            },
        )

        for item in items_to_bill:
            LabBillItem.objects.create(
                bill=bill,
                order_item=item,
                test=item.test,
                test_name=item.test_name,
                quantity=1,
                unit_price=item.cost,
                line_total=item.cost,
            )
            item.status = LabOrderItem.Status.PAID
            item.paid_date = timezone.localdate()
            item.save(update_fields=["status", "paid_date"])

        bill.subtotal = sum(i.line_total for i in bill.items.all())
        bill.total = bill.subtotal
        bill.payment_status = LabBill.PaymentStatus.PAID
        if not bill.paid_at:
            bill.paid_at = timezone.now()
        bill.save(update_fields=["subtotal", "total", "payment_status", "paid_at"])

        return Response(LabOrderSerializer(order).data)


# ---------------------------------------------------------------------------
# Lab order items (the individual tests the technician works on)
# ---------------------------------------------------------------------------
class LabOrderItemViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /items/                    paid, in-progress and completed tests
       GET  /items/?status=Paid        only tests waiting to be started
       POST /items/<id>/start/         Paid -> In Progress
       POST /items/<id>/select/        Recommended -> Selected
       POST /items/<id>/decline/       Recommended/Selected -> Declined
       POST /items/<id>/cancel/        Cancel/Decline test"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabOrderItemSerializer

    def get_queryset(self):
        queryset = (
            LabOrderItem.objects.all()
            .select_related("lab_order__patient", "test", "result")
            .order_by("-lab_order__date", "id")
        )
        if self.action == "list":
            status = self.request.query_params.get("status")
            order = self.request.query_params.get("order")
            if status:
                queryset = queryset.filter(status=status)
            elif not order:
                queryset = queryset.filter(status__in=LAB_VISIBLE_STATUSES)
            if order:
                queryset = queryset.filter(lab_order_id=order)
        return queryset

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        item = self.get_object()
        serializer = LabItemStatusSerializer(
            item, data={"status": LabOrderItem.Status.IN_PROGRESS}, partial=True
        )
        serializer.is_valid(raise_exception=True)  # rejects anything but Paid -> In Progress
        serializer.save()
        return Response(LabOrderItemSerializer(item).data)

    @action(detail=True, methods=["post"])
    def select(self, request, pk=None):
        item = self.get_object()
        serializer = LabItemStatusSerializer(
            item, data={"status": LabOrderItem.Status.SELECTED}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        item.status = LabOrderItem.Status.SELECTED
        item.selected_date = timezone.localdate()
        item.save(update_fields=["status", "selected_date"])
        return Response(LabOrderItemSerializer(item).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        item = self.get_object()
        serializer = LabItemStatusSerializer(
            item, data={"status": LabOrderItem.Status.DECLINED}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        item.status = LabOrderItem.Status.DECLINED
        item.declined_date = timezone.localdate()
        item.save(update_fields=["status", "declined_date"])
        return Response(LabOrderItemSerializer(item).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        item = self.get_object()
        if item.status == LabOrderItem.Status.COMPLETED:
            raise ValidationError("Cannot cancel a completed test.")
        if item.status in [LabOrderItem.Status.RECOMMENDED, LabOrderItem.Status.SELECTED]:
            item.status = LabOrderItem.Status.DECLINED
            item.declined_date = timezone.localdate()
            item.save(update_fields=["status", "declined_date"])
        else:
            item.status = LabOrderItem.Status.CANCELLED
            item.save(update_fields=["status"])
        return Response(LabOrderItemSerializer(item).data)


# ---------------------------------------------------------------------------
# Lab results (create, view and correct; never deleted)
# ---------------------------------------------------------------------------
class LabResultViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """POST  /results/        enter a result (also marks test Completed and updates LabReport)
       GET   /results/        all results, newest first
       PATCH /results/<id>/   correct a result"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabResultSerializer
    queryset = (
        LabResult.objects.select_related("order_item", "technician", "report")
        .order_by("-result_date", "-id")
    )

    def perform_create(self, serializer):
        # The technician comes from the login, never from the request body.
        serializer.save(technician=current_technician(self.request))


# ---------------------------------------------------------------------------
# Lab reports (consolidated order report; release when all accepted tests done)
# ---------------------------------------------------------------------------
class LabReportViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /reports/                all consolidated reports
       GET  /reports/?status=Completed
       POST /reports/<id>/release/   release report to doctor/patient"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabReportSerializer

    def get_queryset(self):
        queryset = (
            LabReport.objects.select_related(
                "lab_order__patient",
                "lab_order__doctor__staff",
                "released_by",
            )
            .prefetch_related("results__order_item", "results__technician")
            .order_by("-created_at")
        )
        status = self.request.query_params.get("status")
        patient = self.request.query_params.get("patient")
        order = self.request.query_params.get("order")
        if status:
            queryset = queryset.filter(status=status)
        if patient:
            queryset = queryset.filter(lab_order__patient_id=patient)
        if order:
            queryset = queryset.filter(lab_order_id=order)
        return queryset

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def release(self, request, pk=None):
        report = self.get_object()

        if report.status == LabReport.Status.RELEASED:
            raise ValidationError("Report has already been released.")

        # Mandatory Rule: every accepted test in the LabOrder must be completed with a result
        accepted_items = report.lab_order.items.exclude(
            status__in=[LabOrderItem.Status.DECLINED, LabOrderItem.Status.CANCELLED]
        )

        if not accepted_items.exists():
            raise ValidationError("Cannot release a report with no accepted tests.")

        incomplete_items = accepted_items.exclude(status=LabOrderItem.Status.COMPLETED)
        if incomplete_items.exists():
            names = ", ".join(incomplete_items.values_list("test_name", flat=True))
            raise ValidationError(
                f"Cannot release report: Not all accepted tests are completed ({names})."
            )

        items_without_result = accepted_items.filter(result__isnull=True)
        if items_without_result.exists():
            names = ", ".join(items_without_result.values_list("test_name", flat=True))
            raise ValidationError(
                f"Cannot release report: Missing recorded results for ({names})."
            )

        report.status = LabReport.Status.RELEASED
        report.released_at = timezone.now()
        report.released_by = current_technician(request)
        notes = request.data.get("summary_notes")
        if notes:
            report.summary_notes = notes.strip()
        report.save(update_fields=["status", "released_at", "released_by", "summary_notes", "updated_at"])

        return Response(LabReportSerializer(report).data)


# ---------------------------------------------------------------------------
# Lab bills (read only, plus marking as paid)
# ---------------------------------------------------------------------------
class LabBillViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /bills/                all lab bills
       GET  /bills/?payment_status=Pending
       POST /bills/<id>/pay/       mark the bill as Paid"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabBillSerializer

    def get_queryset(self):
        queryset = (
            LabBill.objects.select_related("patient", "lab_order")
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
        serializer = LabBillSerializer(
            bill, data={"payment_status": LabBill.PaymentStatus.PAID}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()  # also sets paid_at and marks the billed tests as Paid
        return Response(serializer.data)
