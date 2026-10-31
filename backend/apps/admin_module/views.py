
from django.utils import timezone
from django.db import transaction
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404

from rest_framework import mixins, viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from .permissions import IsAdminUserRole

from .models import (
    Department,
    Staff,
    DoctorProfile,
    Medicine,
    LabTest,
    MedicineRequest,
    Settings,
)

from .serializers import (
    DepartmentSerializer,
    StaffSerializer,
    DoctorProfileSerializer,
    MedicineSerializer,
    LabTestSerializer,
    MedicineRequestSerializer,
    SettingsSerializer,
    StaffCredentialsSerializer,
    StaffCredentialsUpdateSerializer,
    StockRequestReplenishSerializer,
)


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminUserRole]


class StaffViewSet(viewsets.ModelViewSet):
    queryset = Staff.objects.all()
    serializer_class = StaffSerializer
    permission_classes = [IsAdminUserRole]


class DoctorProfileViewSet(viewsets.ModelViewSet):
    queryset = DoctorProfile.objects.all()
    serializer_class = DoctorProfileSerializer
    permission_classes = [IsAdminUserRole]


class MedicineViewSet(viewsets.ModelViewSet):
    queryset = Medicine.objects.all()
    serializer_class = MedicineSerializer
    permission_classes = [IsAdminUserRole]


class LabTestViewSet(viewsets.ModelViewSet):
    queryset = LabTest.objects.all()
    serializer_class = LabTestSerializer
    permission_classes = [IsAdminUserRole]


class MedicineRequestViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = MedicineRequest.objects.all()
    serializer_class = MedicineRequestSerializer
    permission_classes = [IsAdminUserRole]

    # Approve request
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        with transaction.atomic():
            stock_request = get_object_or_404(
                self.get_queryset().select_for_update(),
                pk=pk,
            )

            if stock_request.status != MedicineRequest.Status.PENDING:
                return Response(
                    {"error": "Only pending requests can be approved."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            stock_request.status = MedicineRequest.Status.APPROVED
            stock_request.processed_at = timezone.now()
            stock_request.save(
                update_fields=["status", "processed_at"]
            )

        return Response({
            "message": "Stock request approved successfully."
        })

    # Ignore request
    @action(detail=True, methods=["post"])
    def ignore(self, request, pk=None):
        with transaction.atomic():
            stock_request = get_object_or_404(
                self.get_queryset().select_for_update(),
                pk=pk,
            )

            if stock_request.status != MedicineRequest.Status.PENDING:
                return Response(
                    {"error": "Only pending requests can be ignored."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            stock_request.status = MedicineRequest.Status.IGNORED
            stock_request.processed_at = timezone.now()
            stock_request.save(
                update_fields=["status", "processed_at"]
            )

        return Response({
            "message": "Stock request ignored successfully."
        })

    # Replenish medicine stock
    @action(detail=True, methods=["post"])
    def replenish(self, request, pk=None):
        with transaction.atomic():
            stock_request = get_object_or_404(
                self.get_queryset().select_for_update(),
                pk=pk,
            )

            if stock_request.status != MedicineRequest.Status.APPROVED:
                return Response(
                    {"error": "Only approved requests can be replenished."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            data = request.data
            if "quantity" not in data:
                data = {**data, "quantity": stock_request.requested_quantity}
            quantity_serializer = StockRequestReplenishSerializer(
                data=data,
                context={"requested_quantity": stock_request.requested_quantity},
            )
            quantity_serializer.is_valid(raise_exception=True)
            quantity = quantity_serializer.validated_data["quantity"]

            medicine = Medicine.objects.select_for_update().get(
                pk=stock_request.medicine_id
            )
            if medicine.stock_quantity + quantity > 2_147_483_647:
                return Response(
                    {"error": "The resulting stock exceeds the supported maximum."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            medicine.stock_quantity += quantity
            medicine.save(update_fields=["stock_quantity"])

            stock_request.processed_quantity = quantity
            stock_request.status = MedicineRequest.Status.REPLENISHED
            stock_request.processed_at = timezone.now()

            stock_request.save(
                update_fields=[
                    "processed_quantity",
                    "status",
                    "processed_at"
                ]
            )

        return Response({
            "message": "Medicine stock replenished successfully.",
            "medicine_id": medicine.id,
            "added_quantity": quantity,
            "current_stock": medicine.stock_quantity
        })


class SettingsViewSet(viewsets.ModelViewSet):
    queryset = Settings.objects.all()
    serializer_class = SettingsSerializer
    permission_classes = [IsAdminUserRole]


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.is_staff:
            return Response({
                "username": user.username,
                "role": "Admin",
                "display_name": "Administrator",
            })

        staff = getattr(user, "staff", None)
        if staff is None or not staff.is_active:
            return Response(
                {"detail": "This account is not linked to active staff."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response({
            "username": user.username,
            "role": staff.role,
            "display_name": staff.full_name,
        })


class StaffCredentialsView(APIView):
    permission_classes = [IsAdminUserRole]

    def post(self, request):
        serializer = StaffCredentialsSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()

            return Response(
                {
                    "message": "Staff login credentials created successfully.",
                    "user_id": user.id,
                    "username": user.username,
                },
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class StaffCredentialsUpdateView(APIView):
    permission_classes = [IsAdminUserRole]

    def post(self, request):
        serializer = StaffCredentialsUpdateSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(
                {
                    "message": "Staff login credentials updated successfully.",
                    "username": user.username,
                },
                status=status.HTTP_200_OK,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class StaffPasswordResetView(APIView):
    permission_classes = [IsAdminUserRole]

    def post(self, request):
        staff_id = request.data.get("staff_id")
        new_password = request.data.get("new_password")

        if not staff_id or not new_password:
            return Response(
                {"error": "Staff ID and new password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            staff = Staff.objects.get(id=staff_id)
        except (Staff.DoesNotExist, ValueError, TypeError):
            return Response(
                {"error": "Staff not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        if staff.user is None:
            return Response(
                {"error": "This staff has no login credentials."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_password(new_password, user=staff.user)
        except ValidationError as error:
            return Response(
                {"new_password": error.messages},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff.user.set_password(new_password)
        staff.user.save(update_fields=["password"])

        return Response(
            {"message": "Staff password reset successfully."},
            status=status.HTTP_200_OK
        )


class AdminDashboardView(APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        today = timezone.localdate()
        threshold = Settings.load().low_stock_threshold

        data = {
            "total_staff": Staff.objects.count(),

            "active_staff": Staff.objects.filter(
                is_active=True
            ).count(),

            "active_doctors": DoctorProfile.objects.filter(
                is_active=True,
                staff__is_active=True
            ).count(),

            "total_medicines": Medicine.objects.filter(
                is_active=True
            ).count(),

            "low_stock_medicines": Medicine.objects.filter(
                is_active=True,
                stock_quantity__gt=0,
                stock_quantity__lte=threshold,
                expiry_date__gte=today
            ).count(),

            "pending_stock_requests": MedicineRequest.objects.filter(
                status=MedicineRequest.Status.PENDING
            ).count(),
        }

        return Response(
            data,
            status=status.HTTP_200_OK
        )
