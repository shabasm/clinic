from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.admin_module.models import Booking, ConsultationBill, Consultation, DoctorProfile, Patient, RegistrationBill, Settings, Token
from .permissions import IsReceptionist
from .serializers import BookingSerializer, PatientSerializer, ReceptionDoctorSerializer, WalkInSerializer


class PatientViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, IsReceptionist]
    search_fields = ["full_name", "phone"]

    def get_queryset(self):
        queryset = Patient.objects.filter(is_active=True).prefetch_related("bookings", "consultations").order_by("full_name")
        search = self.request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            criteria = Q(full_name__icontains=search) | Q(phone__icontains=search)
            if search.isdigit():
                criteria |= Q(pk=search)
            queryset = queryset.filter(criteria)
        return queryset

    @action(detail=True, methods=["post"], url_path="collect-registration-payment")
    @transaction.atomic
    def collect_registration_payment(self, request, pk=None):
        patient = self.get_object()
        method = request.data.get("payment_method")
        if method not in RegistrationBill.PaymentMethod.values:
            return Response({"payment_method": "Choose Cash, Card, or UPI."}, status=status.HTTP_400_BAD_REQUEST)
        bill, _ = RegistrationBill.objects.select_for_update().get_or_create(
            patient=patient,
            defaults={"registration_fee": Settings.load().registration_fee, "total": Settings.load().registration_fee},
        )
        if bill.payment_status == bill.PaymentStatus.PAID:
            return Response({"detail": "Registration fee has already been paid."}, status=status.HTTP_400_BAD_REQUEST)
        bill.payment_status = bill.PaymentStatus.PAID
        bill.payment_method = method
        bill.paid_by = request.user
        bill.paid_at = timezone.now()
        bill.save(update_fields=["payment_status", "payment_method", "paid_by", "paid_at"])
        return Response({
            "payment_status": bill.payment_status,
            "amount": str(bill.total),
            "payment_method": bill.payment_method,
            "registration_bill_id": bill.id,
            "registration_fee": str(bill.registration_fee),
            "registration_bill_created_at": bill.created_at,
            "registration_paid_at": bill.paid_at,
            "token_numbers": [],
        })

    def perform_destroy(self, patient):
        # Keep appointments, bills, and consultations attached to the patient.
        patient.is_active = False
        patient.save(update_fields=["is_active"])


class DoctorViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ReceptionDoctorSerializer
    permission_classes = [IsAuthenticated, IsReceptionist]

    def get_queryset(self):
        return DoctorProfile.objects.filter(
            is_active=True, staff__is_active=True
        ).select_related("staff", "department").order_by("staff__full_name")


class BookingViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                     mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated, IsReceptionist]

    def get_queryset(self):
        queryset = Booking.objects.select_related("patient", "doctor__staff").prefetch_related("tokens")
        date = self.request.query_params.get("date")
        if date:
            queryset = queryset.filter(date=date)
        doctor = self.request.query_params.get("doctor")
        if doctor:
            queryset = queryset.filter(doctor_id=doctor)
        return queryset.order_by("date", "doctor__staff__full_name", "reserved_token_number")

    @transaction.atomic
    def perform_create(self, serializer):
        doctor = serializer.validated_data["doctor"]
        date = serializer.validated_data["date"]
        booking = serializer.save(reserved_token_number=None)
        # Booking reserves a visit; the token is issued when the patient checks in,
        # so walk-ins who arrive first keep their place in the queue.

    @transaction.atomic
    def perform_update(self, serializer):
        booking = self.get_object()
        old_date, old_doctor = booking.date, booking.doctor
        booking = serializer.save()
        if booking.date != old_date or booking.doctor_id != old_doctor.id:
            booking.tokens.filter(status=Token.Status.RESERVED).update(status=Token.Status.CANCELLED)
            booking.reserved_token_number = None
            booking.save(update_fields=["reserved_token_number"])

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        booking = self.get_object()
        if booking.status in [Booking.Status.ACTIVATED, Booking.Status.COMPLETED, Booking.Status.CANCELLED]:
            return Response({"detail": "This appointment can no longer be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        booking.status = Booking.Status.CANCELLED
        booking.cancelled_date = timezone.localdate()
        booking.save(update_fields=["status", "cancelled_date"])
        booking.tokens.filter(status=Token.Status.RESERVED).update(status=Token.Status.CANCELLED)
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"], url_path="issue-token")
    @transaction.atomic
    def issue_token_action(self, request, pk=None):
        booking = self.get_object()
        if booking.status != Booking.Status.RESERVED or booking.date != timezone.localdate():
            return Response({"detail": "Only today's reserved appointments can receive a token."}, status=status.HTTP_400_BAD_REQUEST)
        bill = RegistrationBill.objects.filter(patient=booking.patient).first()
        if not bill or bill.payment_status != bill.PaymentStatus.PAID:
            return Response({"detail": "Collect the registration fee before issuing a token."}, status=status.HTTP_400_BAD_REQUEST)
        token = issue_token(booking.patient, booking.doctor, booking.date, Token.Type.BOOKING, booking)
        return Response({"token_number": token.token_number, "token_id": token.id}, status=status.HTTP_201_CREATED)


class ReceptionDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsReceptionist]

    def get(self, request):
        today = timezone.localdate()
        tokens = Token.objects.filter(date=today).select_related(
            "patient", "patient__registrationbill", "doctor__staff", "doctor", "source_booking", "bill"
        ).order_by("doctor__staff__full_name", "token_number")
        queue = [{
            "id": token.id,
            "token_number": token.token_number,
            "token_type": token.token_type,
            "status": token.status,
            "patient_id": token.patient_id,
            "patient_name": token.patient.full_name,
            "patient_phone": token.patient.phone,
            "doctor_id": token.doctor_id,
            "doctor_name": token.doctor.staff.full_name,
            "booking_id": token.source_booking_id,
            "consultation_fee": str(token.bill.total) if hasattr(token, "bill") else None,
            "consultation_payment_status": token.bill.payment_status if hasattr(token, "bill") else "Not billed",
            "registration_payment_status": token.patient.registrationbill.payment_status if hasattr(token.patient, "registrationbill") else "Pending",
        } for token in tokens]
        return Response({
            "date": today,
            "registration_fee": str(Settings.load().registration_fee),
            "patients": Patient.objects.filter(is_active=True).count(),
            "appointments_today": Booking.objects.filter(date=today).exclude(
                status=Booking.Status.CANCELLED
            ).count(),
            "waiting_tokens": Token.objects.filter(date=today, status=Token.Status.ACTIVE).count(),
            "completed_consultations": Consultation.objects.filter(status=Consultation.Status.COMPLETED, completed_at__date=today).count(),
            "pending_registration_payments": Patient.objects.filter(is_active=True).filter(
                Q(registrationbill__isnull=True) |
                Q(registrationbill__payment_status=RegistrationBill.PaymentStatus.PENDING)
            ).count(),
            "pending_consultation_payments": ConsultationBill.objects.filter(payment_status=ConsultationBill.PaymentStatus.PENDING).count(),
            "pending_consultation_bills": [{
                "id": bill.id,
                "token_id": bill.token_id,
                "token_number": bill.token.token_number,
                "patient_id": bill.patient_id,
                "patient_name": bill.patient.full_name,
                "patient_phone": bill.patient.phone,
                "doctor_name": bill.doctor.staff.full_name,
                "amount": str(bill.total),
                "completed_at": bill.token.consultation.completed_at,
            } for bill in ConsultationBill.objects.filter(
                payment_status=ConsultationBill.PaymentStatus.PENDING,
                token__consultation__status=Consultation.Status.COMPLETED,
            ).select_related("patient", "doctor__staff", "token", "token__consultation").order_by("-created_at")],
            "queue": queue,
        })


class WalkInView(APIView):
    permission_classes = [IsAuthenticated, IsReceptionist]

    @transaction.atomic
    def post(self, request):
        serializer = WalkInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient = serializer.validated_data["patient"]
        doctor = serializer.validated_data["doctor"]
        today = timezone.localdate()
        bill = RegistrationBill.objects.filter(patient=patient).first()
        if not bill or bill.payment_status != bill.PaymentStatus.PAID:
            return Response({"detail": "Collect the registration fee before adding a walk-in token."}, status=status.HTTP_400_BAD_REQUEST)
        token = issue_token(patient, doctor, today, Token.Type.WALK_IN)
        return Response({
            "id": token.id,
            "token_number": token.token_number,
            "patient_name": patient.full_name,
            "doctor_name": doctor.staff.full_name,
            "status": token.status,
        }, status=status.HTTP_201_CREATED)


class CollectConsultationPaymentView(APIView):
    permission_classes = [IsAuthenticated, IsReceptionist]

    @transaction.atomic
    def post(self, request, token_id):
        try:
            token = Token.objects.select_for_update().select_related("source_booking").get(pk=token_id)
        except Token.DoesNotExist:
            return Response({"detail": "Token not found."}, status=status.HTTP_404_NOT_FOUND)
        consultation = getattr(token, "consultation", None)
        if not consultation or consultation.status != Consultation.Status.COMPLETED:
            return Response({"detail": "Consultation payment is available only after the doctor completes the visit."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bill = ConsultationBill.objects.select_for_update().get(token=token)
        except ConsultationBill.DoesNotExist:
            return Response({"detail": "Consultation bill is created only after the doctor completes the visit."}, status=status.HTTP_404_NOT_FOUND)
        if bill.payment_status == bill.PaymentStatus.PAID:
            return Response({"detail": "This consultation fee has already been collected."}, status=status.HTTP_400_BAD_REQUEST)
        method = request.data.get("payment_method")
        if method not in ConsultationBill.PaymentMethod.values:
            return Response({"payment_method": "Choose Cash, Card, or UPI."}, status=status.HTTP_400_BAD_REQUEST)
        bill.payment_status = bill.PaymentStatus.PAID
        bill.payment_method = method
        bill.paid_by = request.user
        bill.paid_at = timezone.now()
        bill.save(update_fields=["payment_status", "payment_method", "paid_by", "paid_at"])
        return Response({
            "bill_id": bill.id,
            "token_id": token.id,
            "token_number": token.token_number,
            "payment_status": bill.payment_status,
            "status": token.status,
            "amount": str(bill.total),
            "created_at": bill.created_at,
            "paid_at": bill.paid_at,
            "payment_method": bill.payment_method,
        })


class ActivatePaidTokenView(APIView):
    permission_classes = [IsAuthenticated, IsReceptionist]

    @transaction.atomic
    def post(self, request, token_id):
        try:
            token = Token.objects.select_for_update().select_related("patient", "source_booking").get(pk=token_id)
        except Token.DoesNotExist:
            return Response({"detail": "Token not found."}, status=status.HTTP_404_NOT_FOUND)
        if token.date != timezone.localdate():
            return Response({"detail": "Only today's token can be activated."}, status=status.HTTP_400_BAD_REQUEST)
        bill = RegistrationBill.objects.filter(patient=token.patient).first()
        if not bill or bill.payment_status != RegistrationBill.PaymentStatus.PAID:
            return Response({"detail": "Confirm the registration payment before activating this token."}, status=status.HTTP_400_BAD_REQUEST)
        if token.status == Token.Status.ACTIVE:
            return Response({"token_number": token.token_number, "status": token.status})
        if token.status != Token.Status.RESERVED:
            return Response({"detail": "Only reserved tokens can be activated."}, status=status.HTTP_400_BAD_REQUEST)
        token.status = Token.Status.ACTIVE
        token.activated_at = timezone.now()
        token.save(update_fields=["status", "activated_at"])
        if token.source_booking_id and token.source_booking.status == Booking.Status.RESERVED:
            token.source_booking.status = Booking.Status.ACTIVATED
            token.source_booking.activated_date = timezone.localdate()
            token.source_booking.save(update_fields=["status", "activated_date"])
        return Response({"token_number": token.token_number, "status": token.status})


def issue_token(patient, doctor, date, token_type, booking=None):
    doctor = DoctorProfile.objects.select_for_update().get(pk=doctor.pk)
    if booking:
        existing = Token.objects.filter(source_booking=booking).exclude(status=Token.Status.CANCELLED).first()
        if existing:
            if existing.status == Token.Status.RESERVED:
                existing.status = Token.Status.ACTIVE
                existing.activated_at = timezone.now()
                existing.save(update_fields=["status", "activated_at"])
            if booking.status == Booking.Status.RESERVED:
                booking.status = Booking.Status.ACTIVATED
                booking.activated_date = timezone.localdate()
                booking.save(update_fields=["status", "activated_date"])
            return existing
    number = (Token.objects.filter(doctor=doctor, date=date).aggregate(value=Max("token_number"))["value"] or 0) + 1
    token = Token.objects.create(
        doctor=doctor, patient=patient, date=date, token_number=number,
        token_type=token_type, source_booking=booking,
        status=Token.Status.ACTIVE, activated_at=timezone.now(),
    )
    if booking:
        booking.reserved_token_number = number
        booking.status = Booking.Status.ACTIVATED
        booking.activated_date = timezone.localdate()
        booking.save(update_fields=["reserved_token_number", "status", "activated_date"])
    return token
