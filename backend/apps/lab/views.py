"""
apps/lab/views.py

Views for the Lab module. Lab technicians can:
  - see the active lab tests (the Admin manages the master list)
  - see orders and tests that have been paid for
  - start a test and enter its result
  - see lab bills and mark them as paid
"""
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.admin_module.models import (
    LabBill,
    LabOrder,
    LabOrderItem,
    LabResult,
    LabTest,
)

from .lab_permissions import IsLabTechnician
from .serializers import (
    LabBillSerializer,
    LabItemStatusSerializer,
    LabOrderItemSerializer,
    LabOrderSerializer,
    LabResultSerializer,
    LabTestSerializer,
)

# Tests the lab can see: unpaid (Recommended / Selected) and cancelled ones are hidden.
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
    """GET /orders/            all orders with at least one paid test
       GET /orders/?date=YYYY-MM-DD   orders from one day
       GET /orders/?patient=<id>      orders for one patient"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabOrderSerializer

    def get_queryset(self):
        queryset = (
            LabOrder.objects.filter(items__status__in=LAB_VISIBLE_STATUSES)
            .select_related("patient", "doctor__staff")
            .prefetch_related("items__result")
            .distinct()
            .order_by("-date", "-id")
        )
        date = self.request.query_params.get("date")
        patient = self.request.query_params.get("patient")
        if date:
            queryset = queryset.filter(date=date)
        if patient:
            queryset = queryset.filter(patient_id=patient)
        return queryset


# ---------------------------------------------------------------------------
# Lab order items (the individual tests the technician works on)
# ---------------------------------------------------------------------------
class LabOrderItemViewSet(viewsets.ReadOnlyModelViewSet):
    """GET  /items/                    paid, in-progress and completed tests
       GET  /items/?status=Paid        only tests waiting to be started
       POST /items/<id>/start/         Paid -> In Progress"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabOrderItemSerializer

    def get_queryset(self):
        queryset = (
            LabOrderItem.objects.filter(status__in=LAB_VISIBLE_STATUSES)
            .select_related("lab_order__patient", "test", "result")
            .order_by("-lab_order__date", "id")
        )
        status = self.request.query_params.get("status")
        order = self.request.query_params.get("order")
        if status:
            queryset = queryset.filter(status=status)
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
    """POST  /results/        enter a result (also marks the test Completed)
       GET   /results/        all results, newest first
       PATCH /results/<id>/   correct a result"""
    permission_classes = [IsLabTechnician]
    serializer_class = LabResultSerializer
    queryset = (
        LabResult.objects.select_related("order_item", "technician")
        .order_by("-result_date", "-id")
    )

    def perform_create(self, serializer):
        # The technician comes from the login, never from the request body.
        serializer.save(technician=current_technician(self.request))


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