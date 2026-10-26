from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.admin_module.models import (
    Settings,
    Staff,
    Patient,
    DoctorProfile,
    Booking,
    Token,
    RegistrationBill,
    Consultation,
    ConsultationBill,
)

from .serializers import (
    PatientSerializer,
    DoctorSerializer,
    BookingSerializer,
    TokenSerializer,
    RegistrationBillSerializer,
    ConsultationSerializer,
    ConsultationBillSerializer,
)


# ---------------------------------------------------------
# PATIENTS: LIST, CREATE, RETRIEVE, UPDATE, DELETE
# ---------------------------------------------------------

@api_view(["GET", "POST"])
def patient_list_create(request):
    if request.method == "GET":
        patients = Patient.objects.filter(is_active=True).order_by("-id")
        serializer = PatientSerializer(patients, many=True)
        return Response(serializer.data)

    serializer = PatientSerializer(data=request.data)

    if serializer.is_valid():
        patient = serializer.save()
        return Response(
            PatientSerializer(patient).data,
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def patient_detail(request, pk):
    patient = get_object_or_404(Patient, pk=pk)

    if request.method == "GET":
        return Response(PatientSerializer(patient).data)

    if request.method in ["PUT", "PATCH"]:
        serializer = PatientSerializer(
            patient,
            data=request.data,
            partial=(request.method == "PATCH"),
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Use soft deletion so existing appointments and bills retain history.
    patient.is_active = False
    patient.save(update_fields=["is_active"])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------
# DOCTORS: LIST ACTIVE DOCTORS
# ---------------------------------------------------------

@api_view(["GET"])
def doctor_list(request):
    doctors = (
        DoctorProfile.objects
        .filter(is_active=True, staff__is_active=True,
                staff__role=Staff.Role.DOCTOR)
        .select_related("staff", "department")
        .order_by("staff__full_name")
    )

    serializer = DoctorSerializer(doctors, many=True)
    return Response(serializer.data)


# ---------------------------------------------------------
# BOOKINGS: CREATE AND LIST APPOINTMENTS
# ---------------------------------------------------------

@api_view(["GET", "POST"])
def booking_list_create(request):
    if request.method == "GET":
        bookings = (
            Booking.objects
            .select_related("patient", "doctor", "doctor__staff")
            .order_by("-date", "-id")
        )

        patient_id = request.query_params.get("patient")
        doctor_id = request.query_params.get("doctor")
        booking_date = request.query_params.get("date")

        if patient_id:
            bookings = bookings.filter(patient_id=patient_id)

        if doctor_id:
            bookings = bookings.filter(doctor_id=doctor_id)

        if booking_date:
            bookings = bookings.filter(date=booking_date)

        return Response(BookingSerializer(bookings, many=True).data)

    serializer = BookingSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )

    patient = serializer.validated_data["patient"]
    doctor = serializer.validated_data["doctor"]
    booking_date = serializer.validated_data["date"]

    if not patient.is_active:
        return Response(
            {"error": "Cannot book an appointment for an inactive patient."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not doctor.is_active or not doctor.staff.is_active:
        return Response(
            {"error": "The selected doctor is inactive."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if doctor.staff.role != Staff.Role.DOCTOR:
        return Response(
            {"error": "The selected staff member is not a doctor."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if booking_date < timezone.localdate():
        return Response(
            {"error": "Appointment date cannot be in the past."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate the doctor's scheduled consultation days if configured.
    if doctor.consultation_days:
        weekday = booking_date.strftime("%A")
        if weekday not in doctor.consultation_days:
            return Response(
                {
                    "error": (
                        f"This doctor does not have consultations scheduled "
                        f"for {weekday}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Require the patient's registration bill to be paid before booking.
    registration_bill = RegistrationBill.objects.filter(
        patient=patient,
        payment_status=RegistrationBill.PaymentStatus.PAID,
    ).first()

    if registration_bill is None:
        return Response(
            {
                "error": (
                    "The patient's registration bill must be paid "
                    "before an appointment can be booked."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            # Count only the doctor's non-cancelled reservations for that date.
            last_number = (
                Booking.objects
                .filter(doctor=doctor, date=booking_date)
                .exclude(status=Booking.Status.CANCELLED)
                .aggregate(max_number=Max("reserved_token_number"))
                ["max_number"]
            )

            next_number = (last_number or 0) + 1

            # Business rule: maximum 30 reservations per doctor per day.
            if next_number > 30:
                return Response(
                    {
                        "error": (
                            "This doctor has reached the limit of "
                            "30 appointments for this date."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            booking = Booking.objects.create(
                patient=patient,
                doctor=doctor,
                date=booking_date,
                reserved_token_number=next_number,
                status=Booking.Status.RESERVED,
            )

    except IntegrityError:
        return Response(
            {
                "error": (
                    "Could not reserve this appointment number. "
                    "Please try again."
                )
            },
            status=status.HTTP_409_CONFLICT,
        )

    return Response(
        BookingSerializer(booking).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------
# REGISTRATION BILL: CREATE OR GET
# ---------------------------------------------------------

@api_view(["GET", "POST"])
def registration_bill_list_create(request):
    if request.method == "GET":
        bills = (
            RegistrationBill.objects
            .select_related("patient")
            .order_by("-created_at")
        )

        patient_id = request.query_params.get("patient")
        if patient_id:
            bills = bills.filter(patient_id=patient_id)

        return Response(
            RegistrationBillSerializer(bills, many=True).data
        )

    patient_id = request.data.get("patient")

    if not patient_id:
        return Response(
            {"patient": "This field is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    patient = get_object_or_404(Patient, pk=patient_id, is_active=True)

    # The model allows one registration bill per patient.
    existing_bill = RegistrationBill.objects.filter(patient=patient).first()
    if existing_bill:
        return Response(
            RegistrationBillSerializer(existing_bill).data,
            status=status.HTTP_200_OK,
        )

    settings = Settings.load()
    fee = settings.registration_fee

    bill = RegistrationBill.objects.create(
        patient=patient,
        registration_fee=fee,
        total=fee,
        payment_status=RegistrationBill.PaymentStatus.PENDING,
    )

    return Response(
        RegistrationBillSerializer(bill).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------
# PAY REGISTRATION BILL
# Marking as paid creates tokens for eligible future bookings.
# ---------------------------------------------------------

@api_view(["POST"])
def registration_bill_pay(request, bill_id):
    with transaction.atomic():
        bill = get_object_or_404(
            RegistrationBill.objects.select_for_update(),
            pk=bill_id,
        )

        if bill.payment_status == RegistrationBill.PaymentStatus.PAID:
            return Response(
                {
                    "message": "Registration bill is already paid.",
                    "bill": RegistrationBillSerializer(bill).data,
                },
                status=status.HTTP_200_OK,
            )

        bill.payment_status = RegistrationBill.PaymentStatus.PAID
        bill.paid_at = timezone.now()
        bill.save(update_fields=["payment_status", "paid_at"])

        bookings = (
            Booking.objects
            .select_for_update()
            .filter(
                patient=bill.patient,
                status=Booking.Status.RESERVED,
            )
            .select_related("doctor")
            .order_by("date", "reserved_token_number")
        )

        created_tokens = []

        for booking in bookings:
            # Do not create a token for a past appointment or inactive doctor.
            if booking.date < timezone.localdate():
                continue

            if not booking.doctor.is_active or not booking.doctor.staff.is_active:
                continue

            # Avoid duplicate tokens for the same booking.
            if Token.objects.filter(source_booking=booking).exists():
                continue

            last_token = (
                Token.objects
                .filter(doctor=booking.doctor, date=booking.date)
                .aggregate(max_number=Max("token_number"))
                ["max_number"]
            )

            next_token_number = (last_token or 0) + 1

            if next_token_number > 30:
                continue

            token = Token.objects.create(
                doctor=booking.doctor,
                patient=booking.patient,
                date=booking.date,
                token_number=next_token_number,
                token_type=Token.Type.BOOKING,
                source_booking=booking,
                status=Token.Status.RESERVED,
            )

            booking.status = Booking.Status.ACTIVATED
            booking.activated_date = timezone.localdate()
            booking.save(update_fields=["status", "activated_date"])

            created_tokens.append(token)

    return Response(
        {
            "message": "Registration bill paid successfully.",
            "bill": RegistrationBillSerializer(bill).data,
            "tokens_created": TokenSerializer(
                created_tokens,
                many=True,
            ).data,
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------
# TOKENS: LIST
# ---------------------------------------------------------

@api_view(["GET"])
def token_list(request):
    tokens = (
        Token.objects
        .select_related("patient", "doctor", "doctor__staff")
        .order_by("date", "token_number")
    )

    patient_id = request.query_params.get("patient")
    doctor_id = request.query_params.get("doctor")
    token_date = request.query_params.get("date")

    if patient_id:
        tokens = tokens.filter(patient_id=patient_id)

    if doctor_id:
        tokens = tokens.filter(doctor_id=doctor_id)

    if token_date:
        tokens = tokens.filter(date=token_date)

    return Response(TokenSerializer(tokens, many=True).data)


# ---------------------------------------------------------
# CONSULTATIONS: LIST AND CREATE
# A consultation must belong to an existing token.
# ---------------------------------------------------------

@api_view(["GET", "POST"])
def consultation_list_create(request):
    if request.method == "GET":
        consultations = (
            Consultation.objects
            .select_related("token", "patient", "doctor", "doctor__staff")
            .order_by("-created_at")
        )

        token_id = request.query_params.get("token")
        if token_id:
            consultations = consultations.filter(token_id=token_id)

        return Response(
            ConsultationSerializer(consultations, many=True).data
        )

    token_id = request.data.get("token")
    if not token_id:
        return Response(
            {"token": "This field is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        token = get_object_or_404(
            Token.objects.select_for_update(),
            pk=token_id,
        )

        if token.status in [
            Token.Status.CANCELLED,
            Token.Status.SKIPPED,
            Token.Status.COMPLETED,
        ]:
            return Response(
                {"error": "This token cannot start a consultation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(token, "consultation"):
            return Response(
                ConsultationSerializer(token.consultation).data,
                status=status.HTTP_200_OK,
            )

        token.status = Token.Status.ACTIVE
        token.activated_at = timezone.now()
        token.save(update_fields=["status", "activated_at"])

        consultation = Consultation.objects.create(
            token=token,
            patient=token.patient,
            doctor=token.doctor,
            diagnosis=request.data.get("diagnosis", ""),
            clinical_notes=request.data.get("clinical_notes", ""),
            status=Consultation.Status.IN_PROGRESS,
        )

    return Response(
        ConsultationSerializer(consultation).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------
# COMPLETE CONSULTATION AND GENERATE CONSULTATION BILL
# ---------------------------------------------------------

@api_view(["POST"])
def consultation_complete(request, consultation_id):
    with transaction.atomic():
        consultation = get_object_or_404(
            Consultation.objects.select_for_update().select_related(
                "token", "doctor", "patient"
            ),
            pk=consultation_id,
        )

        if consultation.status == Consultation.Status.COMPLETED:
            existing_bill = ConsultationBill.objects.filter(
                token=consultation.token
            ).first()

            return Response(
                {
                    "message": "Consultation is already completed.",
                    "consultation": ConsultationSerializer(
                        consultation
                    ).data,
                    "bill": (
                        ConsultationBillSerializer(existing_bill).data
                        if existing_bill else None
                    ),
                },
                status=status.HTTP_200_OK,
            )

        consultation.diagnosis = request.data.get(
            "diagnosis",
            consultation.diagnosis,
        )
        consultation.clinical_notes = request.data.get(
            "clinical_notes",
            consultation.clinical_notes,
        )
        consultation.status = Consultation.Status.COMPLETED
        consultation.completed_at = timezone.now()
        consultation.save(
            update_fields=[
                "diagnosis",
                "clinical_notes",
                "status",
                "completed_at",
            ]
        )

        token = consultation.token
        token.status = Token.Status.COMPLETED
        token.completed_at = timezone.now()
        token.save(update_fields=["status", "completed_at"])

        if token.source_booking_id:
            booking = token.source_booking
            booking.status = Booking.Status.COMPLETED
            booking.save(update_fields=["status"])

        fee = consultation.doctor.consultation_fee or Decimal("0.00")

        bill, created = ConsultationBill.objects.get_or_create(
            token=token,
            defaults={
                "patient": consultation.patient,
                "doctor": consultation.doctor,
                "consultation_fee": fee,
                "total": fee,
                "payment_status": (
                    ConsultationBill.PaymentStatus.PENDING
                ),
            },
        )

    return Response(
        {
            "message": "Consultation completed and bill generated.",
            "consultation": ConsultationSerializer(consultation).data,
            "bill": ConsultationBillSerializer(bill).data,
        },
        status=(
            status.HTTP_201_CREATED
            if created
            else status.HTTP_200_OK
        ),
    )


# ---------------------------------------------------------
# PAY CONSULTATION BILL
# ---------------------------------------------------------

@api_view(["POST"])
def consultation_bill_pay(request, bill_id):
    with transaction.atomic():
        bill = get_object_or_404(
            ConsultationBill.objects.select_for_update(),
            pk=bill_id,
        )

        if bill.payment_status == ConsultationBill.PaymentStatus.PAID:
            return Response(
                {
                    "message": "Consultation bill is already paid.",
                    "bill": ConsultationBillSerializer(bill).data,
                },
                status=status.HTTP_200_OK,
            )

        if bill.token.status != Token.Status.COMPLETED:
            return Response(
                {
                    "error": (
                        "The consultation must be completed before "
                        "the bill can be paid."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        bill.payment_status = ConsultationBill.PaymentStatus.PAID
        bill.paid_at = timezone.now()
        bill.save(update_fields=["payment_status", "paid_at"])

    return Response(
        {
            "message": "Consultation bill paid successfully.",
            "bill": ConsultationBillSerializer(bill).data,
        },
        status=status.HTTP_200_OK,
    )