
import re
import unicodedata
from decimal import Decimal

from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    Department,
    Staff,
    DoctorProfile,
    Medicine,
    LabTest,
    MedicineRequest,
    Settings,
)

def is_valid_person_name(value):
    value = unicodedata.normalize("NFC", value.strip())
    return (
        3 <= len(value) <= 60
        and unicodedata.category(value[0]).startswith("L")
        and all(
            unicodedata.category(char).startswith("L") or char in " .'-"
            for char in value
        )
    )


class CaseSensitiveTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if self.user.get_username() != attrs[self.username_field]:
            raise AuthenticationFailed("Invalid username or password.")
        return data


# Department
class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = "__all__"

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter 2+ characters.")
        departments = Department.objects.filter(name__iexact=value)
        if self.instance:
            departments = departments.exclude(pk=self.instance.pk)
        if departments.exists():
            raise serializers.ValidationError("Department already exists.")
        return value


# Staff
class StaffSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, allow_null=True)
    full_name = serializers.CharField(max_length=60, trim_whitespace=True)
    emergency_contact_name = serializers.CharField(max_length=60, trim_whitespace=True)
    email = serializers.EmailField(
        max_length=80,
        allow_blank=False,
        error_messages={
            "invalid": "Enter a valid email.",
            "max_length": "Maximum 80 characters.",
        },
    )
    address = serializers.CharField(min_length=5, max_length=200, trim_whitespace=True)

    class Meta:
        model = Staff
        fields = "__all__"

    def validate(self, attrs):
        instance = self.instance
        full_name = attrs.get("full_name", getattr(instance, "full_name", "")).strip()
        emergency_name = attrs.get(
            "emergency_contact_name",
            getattr(instance, "emergency_contact_name", ""),
        ).strip()
        qualification = attrs.get(
            "qualification",
            getattr(instance, "qualification", ""),
        ).strip()
        address = attrs.get("address", getattr(instance, "address", "")).strip()
        phone = attrs.get("phone", getattr(instance, "phone", ""))
        emergency_phone = attrs.get(
            "emergency_contact_phone",
            getattr(instance, "emergency_contact_phone", ""),
        )
        email = attrs.get("email", getattr(instance, "email", "")).strip()
        date_of_birth = attrs.get("date_of_birth", getattr(instance, "date_of_birth", None))
        joining_date = attrs.get("joining_date", getattr(instance, "joining_date", None))
        today = timezone.localdate()
        current_id = getattr(instance, "id", None)

        if not is_valid_person_name(full_name):
            raise serializers.ValidationError({
                "full_name": "Use 3-60 letters; spaces, . ' and - allowed."
            })
        if not is_valid_person_name(emergency_name):
            raise serializers.ValidationError({
                "emergency_contact_name": "Use 3-60 letters; spaces, . ' and - allowed."
            })
        if len(qualification) < 2:
            raise serializers.ValidationError({
                "qualification": "Enter 2+ characters."
            })
        if not re.fullmatch(r"[1-9]\d{9}", phone):
            raise serializers.ValidationError({
                "phone": "Enter 10 digits; cannot start with 0."
            })
        email_pattern = (
            r"(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
            r"(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
            r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
            r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*"
            r"\.[A-Za-z]{2,63}"
        )
        if len(email) > 80 or not re.fullmatch(email_pattern, email):
            raise serializers.ValidationError({"email": "Enter a valid email."})
        duplicate_identity = Staff.objects.filter(
            full_name__iexact=full_name,
            date_of_birth=date_of_birth,
            phone=phone,
        ).exclude(id=current_id)
        if duplicate_identity.exists():
            raise serializers.ValidationError({
                "full_name": "Staff record already exists."
            })
        if Staff.objects.filter(phone=phone).exclude(id=current_id).exists():
            raise serializers.ValidationError({
                "phone": "Phone already in use."
            })
        if not re.fullmatch(r"[1-9]\d{9}", emergency_phone):
            raise serializers.ValidationError({
                "emergency_contact_phone": "Enter 10 digits; cannot start with 0."
            })
        if phone == emergency_phone:
            raise serializers.ValidationError({
                "emergency_contact_phone": "Use a different phone."
            })
        if date_of_birth and date_of_birth >= today:
            raise serializers.ValidationError({
                "date_of_birth": "Date must be in the past."
            })
        if date_of_birth:
            try:
                adult_date = today.replace(year=today.year - 18)
            except ValueError:
                adult_date = today.replace(year=today.year - 18, day=28)
            if date_of_birth > adult_date:
                raise serializers.ValidationError({
                    "date_of_birth": "Staff must be 18+."
                })
        if joining_date and joining_date > today:
            raise serializers.ValidationError({
                "joining_date": "Cannot be in the future."
            })
        if date_of_birth and joining_date:
            try:
                adult_joining_date = date_of_birth.replace(year=date_of_birth.year + 18)
            except ValueError:
                adult_joining_date = date_of_birth.replace(
                    year=date_of_birth.year + 18,
                    day=28,
                )
            if joining_date < adult_joining_date:
                raise serializers.ValidationError({
                    "joining_date": "Staff must be 18 at joining."
                })
        if email and Staff.objects.filter(email__iexact=email).exclude(
            id=current_id
        ).exists():
            raise serializers.ValidationError({
                "email": "Email already in use."
            })

        attrs["full_name"] = full_name
        attrs["phone"] = phone
        attrs["emergency_contact_name"] = emergency_name
        attrs["qualification"] = qualification
        attrs["address"] = address
        attrs["email"] = email
        return attrs


# Doctor
class DoctorProfileSerializer(serializers.ModelSerializer):
    consultation_fee = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = DoctorProfile
        fields = "__all__"

    def validate(self, attrs):
        instance = self.instance
        staff = attrs.get("staff", getattr(instance, "staff", None))
        department = attrs.get("department", getattr(instance, "department", None))
        experience = attrs.get(
            "experience_years",
            getattr(instance, "experience_years", None),
        )
        license_number = attrs.get(
            "medical_license_number",
            getattr(instance, "medical_license_number", ""),
        ) or ""
        fee = attrs.get("consultation_fee", getattr(instance, "consultation_fee", None))
        days = attrs.get(
            "consultation_days",
            getattr(instance, "consultation_days", []),
        ) or []
        start = attrs.get(
            "consultation_start_time",
            getattr(instance, "consultation_start_time", None),
        )
        end = attrs.get(
            "consultation_end_time",
            getattr(instance, "consultation_end_time", None),
        )
        is_active = attrs.get("is_active", getattr(instance, "is_active", False))
        current_id = getattr(instance, "pk", None)

        if staff and staff.role != Staff.Role.DOCTOR:
            raise serializers.ValidationError({"staff": "Select Doctor staff."})
        if staff and is_active and not staff.is_active:
            raise serializers.ValidationError({"is_active": "Activate staff first."})
        if experience is not None and experience > 60:
            raise serializers.ValidationError({"experience_years": "Maximum is 60 years."})
        if staff and experience is not None:
            today = timezone.localdate()
            age = today.year - staff.date_of_birth.year - (
                (today.month, today.day)
                < (staff.date_of_birth.month, staff.date_of_birth.day)
            )
            if experience > max(0, age - 18):
                raise serializers.ValidationError({
                    "experience_years": f"Maximum is {max(0, age - 18)} years."
                })
        if license_number and not re.fullmatch(r"[A-Za-z0-9/-]{5,20}", license_number):
            raise serializers.ValidationError({
                "medical_license_number": "Use 5-20 letters, numbers, / or -."
            })
        duplicate_license = DoctorProfile.objects.filter(
            medical_license_number__iexact=license_number
        ).exclude(pk=current_id)
        if license_number and duplicate_license.exists():
            raise serializers.ValidationError({
                "medical_license_number": "License already in use."
            })
        valid_days = {
            "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday",
        }
        if not days and is_active:
            raise serializers.ValidationError({
                "consultation_days": "Select a consultation day."
            })
        if any(day not in valid_days for day in days):
            raise serializers.ValidationError({"consultation_days": "Select valid days."})
        if start and end and end <= start:
            raise serializers.ValidationError({"consultation_end_time": "End time must be later."})
        if is_active and not all(
            (department, experience is not None, license_number, fee, days, start, end)
        ):
            raise serializers.ValidationError({
                "is_active": "Complete the doctor profile first."
            })
        return attrs


# Medicine
class MedicineSerializer(serializers.ModelSerializer):
    name = serializers.CharField(min_length=2, max_length=80, trim_whitespace=True)
    manufacturer = serializers.CharField(
        min_length=2,
        max_length=80,
        trim_whitespace=True,
        allow_blank=True,
        required=False,
    )
    price = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    stock_quantity = serializers.IntegerField(min_value=0)

    class Meta:
        model = Medicine
        fields = "__all__"

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", "")).strip()
        manufacturer = attrs.get(
            "manufacturer",
            getattr(self.instance, "manufacturer", ""),
        ).strip()
        expiry_date = attrs.get(
            "expiry_date",
            getattr(self.instance, "expiry_date", None),
        )
        duplicate = Medicine.objects.filter(
            name__iexact=name,
            manufacturer__iexact=manufacturer,
        ).exclude(pk=getattr(self.instance, "pk", None))
        if duplicate.exists():
            raise serializers.ValidationError({"name": "Medicine already exists."})
        if expiry_date and expiry_date < timezone.localdate() and (
            not self.instance or expiry_date != self.instance.expiry_date
        ):
            raise serializers.ValidationError({"expiry_date": "Date cannot be in the past."})
        if "name" in attrs:
            attrs["name"] = name
        if "manufacturer" in attrs:
            attrs["manufacturer"] = manufacturer
        return attrs

# Lab Test
class LabTestSerializer(serializers.ModelSerializer):
    name = serializers.CharField(min_length=2, max_length=80, trim_whitespace=True)
    normal_values = serializers.CharField(max_length=200, trim_whitespace=True)
    cost = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    class Meta:
        model = LabTest
        fields = "__all__"

    def validate_name(self, value):
        value = value.strip()
        tests = LabTest.objects.filter(name__iexact=value)
        if self.instance:
            tests = tests.exclude(pk=self.instance.pk)
        if tests.exists():
            raise serializers.ValidationError("Test already exists.")
        return value


# Stock Request
class MedicineRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicineRequest
        fields = "__all__"

        read_only_fields = [
            "requested_by",
            "current_stock",
            "processed_quantity",
            "status",
            "created_at",
            "processed_at",
        ]

    def validate_requested_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter a positive quantity.")
        return value


class StockRequestReplenishSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)

    def validate_quantity(self, value):
        requested_quantity = self.context["requested_quantity"]
        if value > requested_quantity:
            raise serializers.ValidationError("Cannot exceed requested quantity.")
        return value


# Settings
class SettingsSerializer(serializers.ModelSerializer):
    registration_fee = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0"),
    )
    low_stock_threshold = serializers.IntegerField(min_value=0, max_value=10000)

    class Meta:
        model = Settings
        fields = "__all__"


# Staff Login Credentials
class StaffCredentialsSerializer(serializers.Serializer):

    staff_id = serializers.IntegerField(min_value=1)

    username = serializers.CharField(
        max_length=20,
        min_length=4,
        allow_blank=False,
        trim_whitespace=True
    )

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"}
    )

    def validate_username(self, value):
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9._]{4,20}", value):
            raise serializers.ValidationError("Use 4-20 letters, numbers, . or _.")
        if value.casefold() == "admin":
            raise serializers.ValidationError("Username is reserved.")

        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already in use.")

        return value

    def validate_password(self, value):

        if (
            len(value) < 8
            or not re.search(r"[A-Za-z]", value)
            or not re.search(r"\d", value)
        ):
            raise serializers.ValidationError("Use 8+ characters with a letter and number.")

        try:
            validate_password(value)

        except DjangoValidationError:
            raise serializers.ValidationError("Choose a stronger password.")

        return value

    def validate_staff_id(self, value):

        try:
            staff = Staff.objects.get(id=value)

        except Staff.DoesNotExist:
            raise serializers.ValidationError(
                "Staff not found."
            )

        if not staff.is_active:
            raise serializers.ValidationError("Staff is inactive.")

        if staff.user_id is not None:
            raise serializers.ValidationError("Login already exists.")

        return value

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

        if User.objects.filter(
            username__iexact=username
        ).exists():
            raise serializers.ValidationError({
                "username": "Username already in use."
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


class StaffCredentialsUpdateSerializer(serializers.Serializer):
    staff_id = serializers.IntegerField(min_value=1)
    username = serializers.CharField(
        max_length=20,
        min_length=4,
        allow_blank=False,
        trim_whitespace=True,
    )
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_staff_id(self, value):
        try:
            self.staff = Staff.objects.select_related("user").get(id=value)
        except Staff.DoesNotExist:
            raise serializers.ValidationError("Staff not found.")

        if self.staff.user_id is None:
            raise serializers.ValidationError(
                "This staff has no login credentials."
            )

        return value

    def validate_new_password(self, value):
        if (
            len(value) < 8
            or not re.search(r"[A-Za-z]", value)
            or not re.search(r"\d", value)
        ):
            raise serializers.ValidationError("Use 8+ characters with a letter and number.")
        try:
            validate_password(value, user=self.staff.user)
        except DjangoValidationError as error:
            raise serializers.ValidationError("Choose a stronger password.")
        return value

    def validate_username(self, value):
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9._]{4,20}", value):
            raise serializers.ValidationError("Use 4-20 letters, numbers, . or _.")
        if value.casefold() == "admin":
            raise serializers.ValidationError("Username is reserved.")

        staff = getattr(self, "staff", None)
        users = User.objects.filter(username__iexact=value)
        if staff and staff.user_id:
            users = users.exclude(id=staff.user_id)
        if users.exists():
            raise serializers.ValidationError("Username already in use.")

        return value

    def save(self):
        user = self.staff.user
        user.username = self.validated_data["username"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["username", "password"])
        return user
