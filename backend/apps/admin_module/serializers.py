
from rest_framework import serializers
from .models import (
    Department,
    Staff,
    DoctorProfile,
    Medicine,
    LabTest,
    MedicineRequest,
    Settings,
)


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = "__all__"


class StaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = Staff
        fields = "__all__"


class DoctorProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorProfile
        fields = "__all__"


class MedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Medicine
        fields = "__all__"


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = "__all__"


class MedicineRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicineRequest
        fields = "__all__"


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Settings
        fields = "__all__"
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from .models import Staff


class StaffCredentialsSerializer(serializers.Serializer):

    staff_id = serializers.IntegerField(min_value=1)

    username = serializers.CharField(
        max_length=150,
        allow_blank=False,
        trim_whitespace=True
    )

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"}
    )

    # Username validation
    def validate_username(self, value):

        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Username is required."
            )

        if any(char.isspace() for char in value):
            raise serializers.ValidationError(
                "Username cannot contain spaces."
            )

        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                "Username already exists."
            )

        return value

    # Password validation
    def validate_password(self, value):

        if not value.strip():
            raise serializers.ValidationError(
                "Password is required."
            )

        try:
            validate_password(value)

        except DjangoValidationError as error:
            raise serializers.ValidationError(
                list(error.messages)
            )

        return value

    # Staff validation
    def validate_staff_id(self, value):

        try:
            staff = Staff.objects.get(id=value)

        except Staff.DoesNotExist:
            raise serializers.ValidationError(
                "Staff not found."
            )

        if not staff.is_active:
            raise serializers.ValidationError(
                "Cannot create credentials for inactive staff."
            )

        if staff.user_id is not None:
            raise serializers.ValidationError(
                "This staff already has login credentials."
            )

        return value

    # Create credentials
    @transaction.atomic
    def create(self, validated_data):

        staff = Staff.objects.select_for_update().get(
            id=validated_data["staff_id"]
        )

        if not staff.is_active:
            raise serializers.ValidationError({
                "staff_id": "Staff is inactive."
            })

        if staff.user_id is not None:
            raise serializers.ValidationError({
                "staff_id": "Staff already has credentials."
            })

        username = validated_data["username"]

        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError({
                "username": "Username already exists."
            })

        user = User.objects.create_user(
            username=username,
            password=validated_data["password"],
            is_staff=False,
            is_superuser=False
        )

        staff.user = user
        staff.save(update_fields=["user"])

        return user