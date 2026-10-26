from datetime import date
import re

from django.utils import timezone
from rest_framework import serializers

from apps.admin_module.models import (
    Patient,
    Staff,
    DoctorProfile,
    Booking,
    Token,
    RegistrationBill,
    Consultation,
    ConsultationBill,
)


# =========================================================
# COMMON VALIDATION FUNCTIONS
# =========================================================

def validate_person_name(value):
    value = " ".join(value.split())

    if sum(character.isalpha() for character in value) < 3:
        raise serializers.ValidationError(
            "Name must contain at least 3 letters."
        )

    if not all(character.isalpha() or character == " " for character in value):
        raise serializers.ValidationError(
            "Name can contain letters and spaces only."
        )

    return value


def validate_phone_number(value):
    value = value.strip()

    if not re.fullmatch(r"[6-9][0-9]{9}", value):
        raise serializers.ValidationError(
            "Enter a valid 10-digit Indian mobile number starting with 6-9."
        )

    return value


def validate_date_of_birth(value):
    if value > timezone.localdate():
        raise serializers.ValidationError(
            "Date of birth cannot be in the future."
        )

    if value < date(1900, 1, 1):
        raise serializers.ValidationError(
            "Enter a valid date of birth."
        )

    return value


# =========================================================
# PATIENT SERIALIZER
# =========================================================

class PatientSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(
        max_length=100,
        validators=[validate_person_name],
    )

    phone = serializers.CharField(
        max_length=15,
        validators=[validate_phone_number],
    )

    emergency_contact_name = serializers.CharField(
        required=False,
        allow_blank=True,
        validators=[validate_person_name],
    )

    emergency_contact_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        validators=[validate_phone_number],
    )

    def validate_date_of_birth(self, value):
        return validate_date_of_birth(value)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        patient_phone = attrs.get(
            "phone",
            getattr(self.instance, "phone", None),
        )

        emergency_phone = attrs.get(
            "emergency_contact_phone",
            getattr(self.instance, "emergency_contact_phone", ""),
        )

        if (
            patient_phone
            and emergency_phone
            and patient_phone == emergency_phone
        ):
            raise serializers.ValidationError({
                "emergency_contact_phone": (
                    "Emergency contact number must differ "
                    "from the patient's phone number."
                )
            })

        return attrs

    class Meta:
        model = Patient
        fields = "__all__"
        read_only_fields = (
            "id",
            "registration_date",
        )


# =========================================================
# DOCTOR SERIALIZER
# =========================================================

class DoctorSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(
        source="staff.full_name",
        read_only=True,
    )

    department_name = serializers.CharField(
        source="department.name",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DoctorProfile
        fields = (
            "id",
            "full_name",
            "department",
            "department_name",
            "experience_years",
            "medical_license_number",
            "consultation_fee",
            "consultation_days",
            "consultation_start_time",
            "consultation_end_time",
            "is_active",
        )


# =========================================================
# BOOKING / APPOINTMENT SERIALIZER
# =========================================================

class BookingSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    doctor_name = serializers.CharField(
        source="doctor.staff.full_name",
        read_only=True,
    )

    def validate_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError(
                "Appointment date cannot be in the past."
            )

        return value

    def validate(self, attrs):
        patient = attrs.get(
            "patient",
            getattr(self.instance, "patient", None),
        )

        doctor = attrs.get(
            "doctor",
            getattr(self.instance, "doctor", None),
        )

        booking_date = attrs.get(
            "date",
            getattr(self.instance, "date", None),
        )

        if patient and not patient.is_active:
            raise serializers.ValidationError({
                "patient": "Select an active patient."
            })

        if doctor:
            if (
                not doctor.is_active
                or not doctor.staff.is_active
                or doctor.staff.role != Staff.Role.DOCTOR
            ):
                raise serializers.ValidationError({
                    "doctor": "Select an active doctor."
                })

        if doctor and booking_date and doctor.consultation_days:
            weekday = booking_date.strftime("%A")

            if weekday not in doctor.consultation_days:
                raise serializers.ValidationError({
                    "date": (
                        f"The doctor is not scheduled for {weekday}."
                    )
                })

        return attrs

    class Meta:
        model = Booking
        fields = (
            "id",
            "patient",
            "patient_name",
            "doctor",
            "doctor_name",
            "date",
            "reserved_token_number",
            "status",
            "created_at",
            "cancelled_date",
            "activated_date",
        )

        read_only_fields = (
            "id",
            "reserved_token_number",
            "status",
            "created_at",
            "cancelled_date",
            "activated_date",
        )


# =========================================================
# TOKEN SERIALIZER
# =========================================================

class TokenSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    doctor_name = serializers.CharField(
        source="doctor.staff.full_name",
        read_only=True,
    )

    class Meta:
        model = Token
        fields = (
            "id",
            "doctor",
            "doctor_name",
            "patient",
            "patient_name",
            "date",
            "token_number",
            "token_type",
            "source_booking",
            "status",
            "created_at",
            "activated_at",
            "completed_at",
        )

        read_only_fields = (
            "id",
            "token_number",
            "status",
            "created_at",
            "activated_at",
            "completed_at",
        )


# =========================================================
# REGISTRATION BILL SERIALIZER
# =========================================================

class RegistrationBillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    class Meta:
        model = RegistrationBill
        fields = (
            "id",
            "patient",
            "patient_name",
            "registration_fee",
            "total",
            "payment_status",
            "created_at",
            "paid_at",
        )

        read_only_fields = (
            "id",
            "total",
            "payment_status",
            "created_at",
            "paid_at",
        )


# =========================================================
# CONSULTATION SERIALIZER
# =========================================================

class ConsultationSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    doctor_name = serializers.CharField(
        source="doctor.staff.full_name",
        read_only=True,
    )

    token_number = serializers.IntegerField(
        source="token.token_number",
        read_only=True,
    )

    def validate(self, attrs):
        token = attrs.get(
            "token",
            getattr(self.instance, "token", None),
        )

        if token and token.status in (
            Token.Status.CANCELLED,
            Token.Status.SKIPPED,
            Token.Status.COMPLETED,
        ):
            raise serializers.ValidationError({
                "token": "This token cannot be used for a consultation."
            })

        return attrs

    class Meta:
        model = Consultation
        fields = (
            "id",
            "token",
            "token_number",
            "patient",
            "patient_name",
            "doctor",
            "doctor_name",
            "diagnosis",
            "clinical_notes",
            "status",
            "created_at",
            "completed_at",
        )

        read_only_fields = (
            "id",
            "patient",
            "doctor",
            "status",
            "created_at",
            "completed_at",
        )


# =========================================================
# CONSULTATION BILL SERIALIZER
# =========================================================

class ConsultationBillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    doctor_name = serializers.CharField(
        source="doctor.staff.full_name",
        read_only=True,
    )

    token_number = serializers.IntegerField(
        source="token.token_number",
        read_only=True,
    )

    class Meta:
        model = ConsultationBill
        fields = (
            "id",
            "patient",
            "patient_name",
            "doctor",
            "doctor_name",
            "token",
            "token_number",
            "consultation_fee",
            "total",
            "payment_status",
            "created_at",
            "paid_at",
        )

        read_only_fields = (
            "id",
            "patient",
            "doctor",
            "token",
            "consultation_fee",
            "total",
            "payment_status",
            "created_at",
            "paid_at",
        )
