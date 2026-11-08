import re
from datetime import date

from django.utils import timezone
from rest_framework import serializers


def validate_person_name(value):
    value = value.strip()

    if len(value) < 2:
        raise serializers.ValidationError(
            "Name must contain at least 2 characters."
        )

    if len(value) > 100:
        raise serializers.ValidationError(
            "Name cannot exceed 100 characters."
        )

    if not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ .'-]+", value):
        raise serializers.ValidationError(
            "Name can contain letters, spaces, dots, apostrophes and hyphens only."
        )

    return value


def validate_phone_number(value):
    value = value.strip()

    # Accept 10-digit Indian numbers or international numbers with a + prefix.
    if not re.fullmatch(r"(?:\+?[0-9][0-9 ]{7,14})", value):
        raise serializers.ValidationError(
            "Enter a valid phone number."
        )

    digits = re.sub(r"\D", "", value)

    if not 10 <= len(digits) <= 15:
        raise serializers.ValidationError(
            "Phone number must contain between 10 and 15 digits."
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


def validate_appointment_date(value):
    if value < timezone.localdate():
        raise serializers.ValidationError(
            "Appointment date cannot be in the past."
        )

    return value
