from rest_framework import serializers
from ..doctors.models import Doctor


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