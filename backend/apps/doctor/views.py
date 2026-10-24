from rest_framework import viewsets, filters
from .models import Doctor
from ..doctor.serializers import DoctorSerializer


class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    serializer_class = DoctorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "specialization", "license_number"]
    ordering_fields = ["created_at", "first_name", "experience_years"]