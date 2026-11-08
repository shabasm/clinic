from rest_framework import serializers
from django.utils import timezone
from apps.admin_module.models import (
    DoctorProfile,
    Token,
    Patient,
    Consultation,
    Prescription,
    PrescriptionItem,
    LabOrder,
    LabOrderItem,
    LabTest,
    Medicine,
)
from .models import Doctor


def calculate_age(date_of_birth):
    if not date_of_birth:
        return None
    today = timezone.localdate()
    return (
        today.year
        - date_of_birth.year
        - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
    )


class DoctorSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "specialization",
            "phone",
            "email",
            "license_number",
            "experience_years",
            "consultation_fee",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_full_name(self, obj):
        return f"Dr. {obj.first_name} {obj.last_name}"


class DoctorProfileInfoSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="staff.full_name", read_only=True)
    specialization = serializers.SerializerMethodField()
    license_number = serializers.CharField(source="medical_license_number", read_only=True)
    start_time = serializers.TimeField(source="consultation_start_time", read_only=True)
    end_time = serializers.TimeField(source="consultation_end_time", read_only=True)

    class Meta:
        model = DoctorProfile
        fields = [
            "id",
            "name",
            "specialization",
            "license_number",
            "experience_years",
            "consultation_fee",
            "start_time",
            "end_time",
            "consultation_days",
            "is_active",
            "is_available",
        ]

    def get_specialization(self, obj):
        if obj.department:
            return obj.department.name
        return "General Medicine"


class DoctorPatientBriefSerializer(serializers.ModelSerializer):
    age = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "full_name",
            "gender",
            "date_of_birth",
            "age",
            "phone",
            "email",
            "address",
            "blood_group",
            "emergency_contact_name",
            "emergency_contact_phone",
            "registration_date",
            "is_active",
        ]

    def get_age(self, obj):
        return calculate_age(obj.date_of_birth)


class DoctorQueueTokenSerializer(serializers.ModelSerializer):
    patient = DoctorPatientBriefSerializer(read_only=True)
    consultation_id = serializers.SerializerMethodField()
    consultation_status = serializers.SerializerMethodField()

    class Meta:
        model = Token
        fields = [
            "id",
            "token_number",
            "token_type",
            "date",
            "status",
            "created_at",
            "activated_at",
            "completed_at",
            "patient",
            "consultation_id",
            "consultation_status",
        ]

    def get_consultation_id(self, obj):
        if hasattr(obj, "consultation"):
            return obj.consultation.id
        return None

    def get_consultation_status(self, obj):
        if hasattr(obj, "consultation"):
            return obj.consultation.status
        return None


class MedicineOptionSerializer(serializers.ModelSerializer):
    stock_state = serializers.ReadOnlyField()

    class Meta:
        model = Medicine
        fields = [
            "id",
            "name",
            "manufacturer",
            "price",
            "stock_quantity",
            "expiry_date",
            "stock_state",
            "is_active",
        ]


class LabTestOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = [
            "id",
            "name",
            "cost",
            "normal_values",
            "is_active",
        ]


class PrescriptionItemPayloadSerializer(serializers.Serializer):
    medicine_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    instructions = serializers.CharField(max_length=255, allow_blank=True)


class CompleteConsultationPayloadSerializer(serializers.Serializer):
    diagnosis = serializers.CharField(min_length=3, max_length=500)
    clinical_notes = serializers.CharField(min_length=3, max_length=2000)
    prescription_items = PrescriptionItemPayloadSerializer(many=True, required=False, default=list)
    lab_test_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )


class SaveDraftConsultationPayloadSerializer(serializers.Serializer):
    diagnosis = serializers.CharField(allow_blank=True, required=False, default="")
    clinical_notes = serializers.CharField(allow_blank=True, required=False, default="")
    prescription_items = PrescriptionItemPayloadSerializer(many=True, required=False, default=list)
    lab_test_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
