from django.shortcuts import render
from .permissions import IsAdminUserRole
# Create your views here.

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

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


class MedicineRequestViewSet(viewsets.ModelViewSet):
    queryset = MedicineRequest.objects.all()
    serializer_class = MedicineRequestSerializer
    permission_classes = [IsAdminUserRole]


class SettingsViewSet(viewsets.ModelViewSet):
    queryset = Settings.objects.all()
    serializer_class = SettingsSerializer
    permission_classes = [IsAdminUserRole]
