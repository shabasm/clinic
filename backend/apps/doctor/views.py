from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.admin_module.models import Consultation, ConsultationBill, RegistrationBill, Token
from rest_framework.permissions import BasePermission
from .models import Doctor
from ..doctor.serializers import DoctorSerializer


class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    serializer_class = DoctorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "specialization", "license_number"]
    ordering_fields = ["created_at", "first_name", "experience_years"]


class IsLinkedDoctor(BasePermission):
    def has_permission(self, request, view):
        staff = getattr(request.user, "staff", None)
        return bool(request.user.is_authenticated and staff and staff.is_active and staff.role == "Doctor" and hasattr(staff, "doctor_profile") and staff.doctor_profile.is_active)


class DoctorQueueView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        doctor = request.user.staff.doctor_profile
        tokens = Token.objects.filter(doctor=doctor, date=timezone.localdate()).select_related("patient", "consultation").order_by("token_number")
        return Response([{
            "id": token.id, "token_number": token.token_number,
            "patient_name": token.patient.full_name, "patient_id": token.patient_id,
            "status": token.status,
            "consultation_status": token.consultation.status if hasattr(token, "consultation") else None,
        } for token in tokens])


class StartConsultationView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    @transaction.atomic
    def post(self, request, token_id):
        doctor = request.user.staff.doctor_profile
        try:
            token = Token.objects.select_for_update().get(pk=token_id, doctor=doctor)
        except Token.DoesNotExist:
            return Response({"detail": "Token not found for this doctor."}, status=status.HTTP_404_NOT_FOUND)
        if token.status != Token.Status.ACTIVE or token.date != timezone.localdate():
            return Response({"detail": "Only an active token from today can start a consultation."}, status=status.HTTP_400_BAD_REQUEST)
        bill = RegistrationBill.objects.filter(patient=token.patient).first()
        if not bill or bill.payment_status != RegistrationBill.PaymentStatus.PAID:
            return Response({"detail": "The registration payment must be confirmed before consultation."}, status=status.HTTP_400_BAD_REQUEST)
        if hasattr(token, "consultation"):
            return Response({"detail": "A consultation already exists for this token."}, status=status.HTTP_400_BAD_REQUEST)
        consultation = Consultation.objects.create(token=token, patient=token.patient, doctor=doctor)
        return Response({"id": consultation.id, "status": consultation.status}, status=status.HTTP_201_CREATED)


class CompleteConsultationView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    @transaction.atomic
    def post(self, request, token_id):
        doctor = request.user.staff.doctor_profile
        try:
            token = Token.objects.select_for_update().select_related("patient").get(pk=token_id, doctor=doctor)
            consultation = Consultation.objects.select_for_update().get(token=token, doctor=doctor)
        except (Token.DoesNotExist, Consultation.DoesNotExist):
            return Response({"detail": "An in-progress consultation for this doctor was not found."}, status=status.HTTP_404_NOT_FOUND)
        if consultation.status != Consultation.Status.IN_PROGRESS:
            return Response({"detail": "Only in-progress consultations can be completed."}, status=status.HTTP_400_BAD_REQUEST)
        consultation.diagnosis = request.data.get("diagnosis", consultation.diagnosis)
        consultation.clinical_notes = request.data.get("clinical_notes", consultation.clinical_notes)
        consultation.status = Consultation.Status.COMPLETED
        consultation.completed_at = timezone.now()
        consultation.save(update_fields=["diagnosis", "clinical_notes", "status", "completed_at"])
        token.status = Token.Status.COMPLETED
        token.completed_at = timezone.now()
        token.save(update_fields=["status", "completed_at"])
        if token.source_booking_id:
            token.source_booking.status = token.source_booking.Status.COMPLETED
            token.source_booking.save(update_fields=["status"])
        fee = doctor.consultation_fee or 0
        bill, _ = ConsultationBill.objects.get_or_create(
            token=token,
            defaults={"patient": token.patient, "doctor": doctor, "consultation_fee": fee, "total": fee},
        )
        return Response({"consultation_id": consultation.id, "consultation_status": consultation.status, "bill_id": bill.id, "bill_status": bill.payment_status, "amount": str(bill.total)})
