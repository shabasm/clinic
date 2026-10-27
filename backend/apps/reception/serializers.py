from django.utils import timezone
from django.db import transaction
from rest_framework import serializers

from apps.admin_module.models import Booking, Consultation, DoctorProfile, Patient, RegistrationBill, Settings, Staff, Token


class PatientSerializer(serializers.ModelSerializer):
    registration_fee = serializers.SerializerMethodField()
    registration_payment_status = serializers.SerializerMethodField()
    appointment_history = serializers.SerializerMethodField()
    consultation_history = serializers.SerializerMethodField()
    class Meta:
        model = Patient
        fields = [
            "id", "full_name", "date_of_birth", "gender", "phone", "email",
            "address", "registration_fee", "registration_payment_status", "appointment_history", "consultation_history", "blood_group", "emergency_contact_name",
            "emergency_contact_phone", "registration_date", "is_active",
        ]
        read_only_fields = ["id", "registration_date", "is_active"]

    def get_registration_fee(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return str(bill.registration_fee) if bill else None

    def get_registration_payment_status(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return bill.payment_status if bill else None

    @transaction.atomic
    def create(self, validated_data):
        patient = super().create(validated_data)
        fee = Settings.load().registration_fee
        RegistrationBill.objects.create(patient=patient, registration_fee=fee, total=fee)
        return patient

    def get_appointment_history(self, patient):
        return [{"id": booking.id, "date": booking.date, "doctor": booking.doctor.staff.full_name, "status": booking.status}
                for booking in patient.bookings.select_related("doctor__staff").order_by("-date")[:20]]

    def get_consultation_history(self, patient):
        return [{"id": item.id, "date": item.created_at.date(), "doctor": item.doctor.staff.full_name, "status": item.status}
                for item in patient.consultations.select_related("doctor__staff").order_by("-created_at")[:20]]

    def validate_full_name(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Enter at least 3 characters.")
        return value

    def validate_date_of_birth(self, value):
        if value >= timezone.localdate():
            raise serializers.ValidationError("Date of birth must be in the past.")
        return value

    def validate_phone(self, value):
        if not value.isdigit() or not 10 <= len(value) <= 15:
            raise serializers.ValidationError("Enter a valid phone number (10–15 digits).")
        matches = Patient.objects.filter(phone=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("A patient with this phone number already exists. Search and select that record.")
        return value


class ReceptionDoctorSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="staff.full_name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default="")

    class Meta:
        model = DoctorProfile
        fields = ["id", "name", "department_name", "consultation_fee", "consultation_days", "consultation_start_time", "consultation_end_time", "is_active"]


class BookingSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.staff.full_name", read_only=True)
    token_number = serializers.IntegerField(source="reserved_token_number", read_only=True)
    consultation_fee = serializers.DecimalField(source="doctor.consultation_fee", max_digits=8, decimal_places=2, read_only=True, allow_null=True)
    registration_payment_status = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["id", "patient", "patient_name", "registration_payment_status", "doctor", "doctor_name", "consultation_fee", "date", "reserved_token_number", "token_number", "status"]
        read_only_fields = ["id", "reserved_token_number", "token_number", "status"]

    def get_registration_payment_status(self, booking):
        bill = getattr(booking.patient, "registrationbill", None)
        return bill.payment_status if bill else "Pending"

    def validate(self, attrs):
        date = attrs.get("date", getattr(self.instance, "date", None))
        doctor = attrs.get("doctor", getattr(self.instance, "doctor", None))
        patient = attrs.get("patient", getattr(self.instance, "patient", None))
        today = timezone.localdate()
        if self.instance:
            if self.instance.status != Booking.Status.RESERVED:
                raise serializers.ValidationError("Only reserved appointments can be rescheduled.")
            if patient.pk != self.instance.patient_id:
                raise serializers.ValidationError({"patient": "The patient on an appointment cannot be changed."})
        if date < today:
            raise serializers.ValidationError({"date": "Choose today or a future date."})
        if not patient.is_active:
            raise serializers.ValidationError({"patient": "This patient is inactive."})
        if not doctor.is_active or not doctor.staff.is_active:
            raise serializers.ValidationError({"doctor": "This doctor is unavailable."})
        if doctor.consultation_days:
            day_name = date.strftime("%A")
            if day_name not in doctor.consultation_days:
                raise serializers.ValidationError({"date": f"This doctor does not consult on {day_name}."})
        conflicts = Booking.objects.filter(patient=patient, doctor=doctor, date=date).exclude(status=Booking.Status.CANCELLED)
        if self.instance:
            conflicts = conflicts.exclude(pk=self.instance.pk)
        if conflicts.exists():
            raise serializers.ValidationError("This patient already has an appointment with this doctor on that date.")
        return attrs


class WalkInSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.filter(is_active=True))
    doctor = serializers.PrimaryKeyRelatedField(queryset=DoctorProfile.objects.filter(is_active=True, staff__is_active=True))
