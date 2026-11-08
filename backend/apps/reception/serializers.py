from datetime import date

from django.utils import timezone
from django.db import transaction
from rest_framework import serializers
import re

from apps.admin_module.models import Booking, Consultation, DoctorProfile, Patient, RegistrationBill, Settings, Staff, Token


class PatientSerializer(serializers.ModelSerializer):
    payment_method = serializers.ChoiceField(choices=RegistrationBill.PaymentMethod.choices, write_only=True, required=False)
    registration_fee = serializers.SerializerMethodField()
    registration_payment_status = serializers.SerializerMethodField()
    registration_bill_id = serializers.SerializerMethodField()
    registration_bill_created_at = serializers.SerializerMethodField()
    registration_payment_method = serializers.SerializerMethodField()
    registration_paid_at = serializers.SerializerMethodField()
    appointment_history = serializers.SerializerMethodField()
    consultation_history = serializers.SerializerMethodField()
    class Meta:
        model = Patient
        fields = [
            "id", "full_name", "date_of_birth", "gender", "phone", "payment_method",
            "address", "registration_fee", "registration_payment_status", "registration_bill_id", "registration_bill_created_at", "registration_payment_method", "registration_paid_at", "appointment_history", "consultation_history", "blood_group", "emergency_contact_name",
            "emergency_contact_phone", "registration_date", "is_active",
        ]
        read_only_fields = ["id", "registration_date", "is_active"]

    def get_registration_fee(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return str(bill.registration_fee) if bill else None

    def get_registration_payment_status(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return bill.payment_status if bill else None

    def get_registration_bill_id(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return bill.id if bill else None

    def get_registration_bill_created_at(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return bill.created_at if bill else None

    def get_registration_payment_method(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return bill.payment_method if bill else None

    def get_registration_paid_at(self, patient):
        bill = getattr(patient, "registrationbill", None)
        return bill.paid_at if bill else None

    @transaction.atomic
    def create(self, validated_data):
        payment_method = validated_data.pop("payment_method", None)
        patient = super().create(validated_data)
        fee = Settings.load().registration_fee
        bill = RegistrationBill.objects.create(patient=patient, registration_fee=fee, total=fee)
        if payment_method:
            bill.payment_status = RegistrationBill.PaymentStatus.PAID
            bill.payment_method = payment_method
            bill.paid_by = self.context["request"].user
            bill.paid_at = timezone.now()
            bill.save(update_fields=["payment_status", "payment_method", "paid_by", "paid_at"])
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
        if not re.fullmatch(r"[^\W\d_]+(?:[ '.-][^\W\d_]+)*", value, flags=re.UNICODE):
            raise serializers.ValidationError("Use letters, spaces, apostrophes, periods, or hyphens only.")
        return value

    def validate_date_of_birth(self, value):
        if value < date(1900, 1, 1):
            raise serializers.ValidationError("Enter a valid date of birth after January 1, 1900.")
        if value >= timezone.localdate():
            raise serializers.ValidationError("Date of birth must be in the past.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not re.fullmatch(r"[0-9]{10,15}", value):
            raise serializers.ValidationError("Enter a valid phone number (10–15 digits).")
        matches = Patient.objects.filter(phone=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("A patient with this phone number already exists. Search and select that record.")
        return value

    def validate_emergency_contact_phone(self, value):
        value = value.strip()
        if value and not re.fullmatch(r"[0-9]{10,15}", value):
            raise serializers.ValidationError("Enter 10–15 digits, or leave this field blank.")
        return value

    def validate_address(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Enter an address with at least 3 characters.")
        return value

    def validate(self, attrs):
        emergency_name = attrs.get("emergency_contact_name", getattr(self.instance, "emergency_contact_name", "")).strip()
        emergency_phone = attrs.get("emergency_contact_phone", getattr(self.instance, "emergency_contact_phone", "")).strip()
        if bool(emergency_name) != bool(emergency_phone):
            raise serializers.ValidationError({"emergency_contact_name": "Enter both emergency contact name and phone, or leave both blank."})
        attrs["emergency_contact_name"] = emergency_name
        attrs["emergency_contact_phone"] = emergency_phone
        return attrs


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
