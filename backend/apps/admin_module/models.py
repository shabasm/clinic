"""
apps/admin_module/models.py

All clinic models live in this app, organised by functional module:
  1. Admin / Core Module
  2. Reception Module
  3. Doctor Module
  4. Pharmacy Module
  5. Laboratory Module
  6. Billing Module

The other apps (reception, doctor, pharmacy, lab) import what they need, e.g.:
    from apps.admin_module.models import Patient, Token

Login: Django's built-in User holds username and (hashed) password.
The Admin is a Django superuser, so it has no Staff record.
"""
from django.contrib.auth.models import User
from django.db import models


# ===========================================================================
# 1. ADMIN / CORE MODULE
# ===========================================================================

class Settings(models.Model):
    registration_fee = models.DecimalField(max_digits=8, decimal_places=2, default=100)
    low_stock_threshold = models.PositiveIntegerField(default=10)

    class Meta:
        verbose_name_plural = "Settings"

    def save(self, *args, **kwargs):
        self.pk = 1  # always one row
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Clinic settings"


class Department(models.Model):
    """Managed by the Admin (add, edit, delete). Used by doctor profiles."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Staff(models.Model):
    class Role(models.TextChoices):
        RECEPTIONIST = "Receptionist", "Receptionist"
        DOCTOR = "Doctor", "Doctor"
        PHARMACIST = "Pharmacist", "Pharmacist"
        LAB_TECHNICIAN = "Lab Technician", "Lab Technician"

    class Gender(models.TextChoices):
        MALE = "Male", "Male"
        FEMALE = "Female", "Female"
        OTHER = "Other", "Other"

    # Login details (username, password) live on User; set in the Credentials tab.
    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True)
    full_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    date_of_birth = models.DateField()
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    joining_date = models.DateField()
    qualification = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "Staff"

    def __str__(self):
        return f"{self.full_name} ({self.role})"


# ===========================================================================
# 2. RECEPTION MODULE
# ===========================================================================

class Patient(models.Model):
    full_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=10, choices=Staff.Gender.choices)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    address = models.TextField()
    blood_group = models.CharField(max_length=5, blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)
    registration_date = models.DateField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.full_name


class Booking(models.Model):
    class Status(models.TextChoices):
        RESERVED = "Reserved", "Reserved"
        ACTIVATED = "Activated", "Activated"
        CANCELLED = "Cancelled", "Cancelled"
        NO_SHOW = "No-show", "No-show"
        COMPLETED = "Completed", "Completed"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="bookings")
    doctor = models.ForeignKey("DoctorProfile", on_delete=models.PROTECT, related_name="bookings")
    date = models.DateField()
    reserved_token_number = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RESERVED)
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_date = models.DateField(null=True, blank=True)
    activated_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "date", "reserved_token_number"],
                name="unique_reserved_token_per_doctor_day",
            )
        ]

    def __str__(self):
        return f"Booking {self.pk}: {self.patient} with {self.doctor} on {self.date}"


class Token(models.Model):
    class Type(models.TextChoices):
        BOOKING = "Booking", "Booking"
        WALK_IN = "Walk-in", "Walk-in"

    class Status(models.TextChoices):
        RESERVED = "Reserved", "Reserved"
        ACTIVE = "Active", "Active"
        COMPLETED = "Completed", "Completed"
        CANCELLED = "Cancelled", "Cancelled"
        SKIPPED = "Skipped", "Skipped"

    doctor = models.ForeignKey("DoctorProfile", on_delete=models.PROTECT, related_name="tokens")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="tokens")
    date = models.DateField()
    token_number = models.PositiveIntegerField()
    token_type = models.CharField(max_length=10, choices=Type.choices)
    source_booking = models.ForeignKey(
        Booking, on_delete=models.SET_NULL, null=True, blank=True, related_name="tokens"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RESERVED)
    created_at = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "date", "token_number"],
                name="unique_token_number_per_doctor_day",
            )
        ]
        ordering = ["date", "token_number"]

    def __str__(self):
        return f"Token {self.token_number} - {self.doctor} - {self.date}"


# ===========================================================================
# 3. DOCTOR MODULE
# ===========================================================================

class DoctorProfile(models.Model):
    """A doctor is a Staff record plus this profile. Doctor status and staff
    status are separate; a doctor is available only if both are active."""
    staff = models.OneToOneField(
        Staff, on_delete=models.CASCADE, related_name="doctor_profile",
        limit_choices_to={"role": Staff.Role.DOCTOR},
    )
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="doctors"
    )
    experience_years = models.PositiveIntegerField(null=True, blank=True)
    medical_license_number = models.CharField(max_length=50, unique=True, null=True, blank=True)
    consultation_fee = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    consultation_days = models.JSONField(default=list, blank=True)  # e.g. ["Monday", "Tuesday"]
    consultation_start_time = models.TimeField(null=True, blank=True)
    consultation_end_time = models.TimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    @property
    def is_available(self):
        return self.is_active and self.staff.is_active

    def __str__(self):
        return self.staff.full_name


class Consultation(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "In Progress", "In Progress"
        COMPLETED = "Completed", "Completed"

    token = models.OneToOneField(Token, on_delete=models.PROTECT, related_name="consultation")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="consultations")
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.PROTECT, related_name="consultations")
    diagnosis = models.TextField(blank=True)
    clinical_notes = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_PROGRESS)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Consultation {self.pk} - {self.patient}"


# ===========================================================================
# 4. PHARMACY MODULE
# ===========================================================================

class Medicine(models.Model):
    name = models.CharField(max_length=100)
    manufacturer = models.CharField(max_length=100, blank=True)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    stock_quantity = models.PositiveIntegerField(default=0)
    expiry_date = models.DateField()
    is_active = models.BooleanField(default=True)

    @property
    def stock_state(self):
        from django.utils import timezone
        if self.expiry_date < timezone.localdate():
            return "Expired"
        if self.stock_quantity <= 0:
            return "Out of stock"
        if self.stock_quantity <= Settings.load().low_stock_threshold:
            return "Low stock"
        return "In stock"

    def __str__(self):
        return self.name


class MedicineRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "Pending", "Pending"
        APPROVED = "Approved", "Approved"
        IGNORED = "Ignored", "Ignored"
        REPLENISHED = "Replenished", "Replenished"

    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name="requests")
    requested_by = models.ForeignKey(
        Staff, on_delete=models.PROTECT, limit_choices_to={"role": Staff.Role.PHARMACIST}
    )
    current_stock = models.PositiveIntegerField()
    requested_quantity = models.PositiveIntegerField()
    processed_quantity = models.PositiveIntegerField(null=True, blank=True)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Request {self.pk}: {self.medicine}"


class Prescription(models.Model):
    class Status(models.TextChoices):
        PENDING = "Pending", "Pending"
        PARTIAL = "Partially Dispensed", "Partially Dispensed"
        DISPENSED = "Dispensed", "Dispensed"
        DECLINED = "Declined", "Declined"

    consultation = models.OneToOneField(
        Consultation, on_delete=models.PROTECT, related_name="prescription"
    )
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="prescriptions")
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.PROTECT, related_name="prescriptions")
    date = models.DateField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    dispensed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Prescription {self.pk} - {self.patient}"


class PrescriptionItem(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="items")
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT)
    medicine_name = models.CharField(max_length=100)  # copied at prescribing time
    prescribed_quantity = models.PositiveIntegerField()
    dispensed_quantity = models.PositiveIntegerField(default=0)
    instructions = models.CharField(max_length=255, blank=True)

    @property
    def remaining_quantity(self):
        return self.prescribed_quantity - self.dispensed_quantity

    def __str__(self):
        return f"{self.medicine_name} x{self.prescribed_quantity}"


# ===========================================================================
# 5. LABORATORY MODULE
# ===========================================================================

class LabTest(models.Model):
    name = models.CharField(max_length=100)
    normal_values = models.CharField(max_length=255, blank=True)
    cost = models.DecimalField(max_digits=8, decimal_places=2)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class LabOrder(models.Model):
    consultation = models.ForeignKey(Consultation, on_delete=models.PROTECT, related_name="lab_orders")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="lab_orders")
    doctor = models.ForeignKey(DoctorProfile, on_delete=models.PROTECT, related_name="lab_orders")
    date = models.DateField(auto_now_add=True)

    @property
    def overall_status(self):
        """Calculated from the test items; never stored."""
        if not self.items.exists():
            return "Empty"
        active_items = self.items.exclude(
            status__in=[LabOrderItem.Status.DECLINED, LabOrderItem.Status.CANCELLED]
        )
        if not active_items.exists():
            if self.items.filter(status=LabOrderItem.Status.DECLINED).exists():
                return "Declined"
            return "Cancelled"
        statuses = set(active_items.values_list("status", flat=True))
        if statuses == {LabOrderItem.Status.COMPLETED}:
            return "Completed"
        if LabOrderItem.Status.IN_PROGRESS in statuses:
            return "In Progress"
        return "Open"

    def __str__(self):
        return f"Lab order {self.pk} - {self.patient}"


class LabOrderItem(models.Model):
    class Status(models.TextChoices):
        RECOMMENDED = "Recommended", "Recommended"
        SELECTED = "Selected", "Selected"
        DECLINED = "Declined", "Declined"
        PAID = "Paid", "Paid"
        IN_PROGRESS = "In Progress", "In Progress"
        COMPLETED = "Completed", "Completed"
        CANCELLED = "Cancelled", "Cancelled"

    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name="items")
    test = models.ForeignKey(LabTest, on_delete=models.PROTECT)
    test_name = models.CharField(max_length=100)  # copied at order time
    cost = models.DecimalField(max_digits=8, decimal_places=2)  # copied at order time
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RECOMMENDED)
    selected_date = models.DateField(null=True, blank=True)
    declined_date = models.DateField(null=True, blank=True)
    paid_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["lab_order", "test"],
                name="unique_test_per_lab_order",
            )
        ]

    def __str__(self):
        return f"{self.test_name} ({self.status})"


class LabReport(models.Model):
    class Status(models.TextChoices):
        PENDING = "Pending", "Pending"
        PARTIALLY_COMPLETED = "Partially Completed", "Partially Completed"
        COMPLETED = "Completed", "Completed"
        RELEASED = "Released", "Released"

    lab_order = models.OneToOneField(
        LabOrder, on_delete=models.CASCADE, related_name="report"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    released_at = models.DateTimeField(null=True, blank=True)
    released_by = models.ForeignKey(
        Staff,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="released_reports",
        limit_choices_to={"role__in": [Staff.Role.LAB_TECHNICIAN, Staff.Role.DOCTOR]},
    )
    summary_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Report for Order {self.lab_order_id} ({self.status})"


class LabResult(models.Model):
    report = models.ForeignKey(
        LabReport,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="results",
    )
    order_item = models.OneToOneField(LabOrderItem, on_delete=models.CASCADE, related_name="result")
    result = models.TextField()
    reference_range = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)
    technician = models.ForeignKey(
        Staff, on_delete=models.PROTECT, limit_choices_to={"role": Staff.Role.LAB_TECHNICIAN}
    )
    result_date = models.DateField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["report", "order_item"],
                name="unique_result_per_report_item",
            )
        ]

    def __str__(self):
        return f"Result for {self.order_item}"


# ===========================================================================
# 6. BILLING MODULE
# ===========================================================================

class BaseBill(models.Model):
    class PaymentStatus(models.TextChoices):
        PENDING = "Pending", "Pending"
        PAID = "Paid", "Paid"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class RegistrationBill(BaseBill):
    class PaymentMethod(models.TextChoices):
        CASH = "Cash", "Cash"
        CARD = "Card", "Card"
        UPI = "UPI", "UPI"

    # One registration bill per patient; charged once.
    patient = models.OneToOneField(Patient, on_delete=models.PROTECT)
    registration_fee = models.DecimalField(max_digits=8, decimal_places=2)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, blank=True)
    paid_by = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="registration_payments",
    )


class ConsultationBill(BaseBill):
    class PaymentMethod(models.TextChoices):
        CASH = "Cash", "Cash"
        CARD = "Card", "Card"
        UPI = "UPI", "UPI"

    doctor = models.ForeignKey(DoctorProfile, on_delete=models.PROTECT)
    token = models.OneToOneField(Token, on_delete=models.PROTECT, related_name="bill")
    consultation_fee = models.DecimalField(max_digits=8, decimal_places=2)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, blank=True)
    paid_by = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="consultation_payments",
    )


class PharmacyBill(BaseBill):
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="bills")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)


class PharmacyBillItem(models.Model):
    bill = models.ForeignKey(PharmacyBill, on_delete=models.CASCADE, related_name="items")
    prescription_item = models.ForeignKey(
        PrescriptionItem,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="bill_items",
    )
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT)
    medicine_name = models.CharField(max_length=100)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)


class LabBill(BaseBill):
    lab_order = models.OneToOneField(LabOrder, on_delete=models.PROTECT, related_name="bill")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)


class LabBillItem(models.Model):
    bill = models.ForeignKey(LabBill, on_delete=models.CASCADE, related_name="items")
    order_item = models.ForeignKey(
        LabOrderItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="bill_items",
    )
    test = models.ForeignKey(LabTest, on_delete=models.PROTECT)
    test_name = models.CharField(max_length=100)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
