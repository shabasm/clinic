from django.contrib import admin

from apps.admin_module.models import (
    MedicineRequest,
    PharmacyBill,
    PharmacyBillItem,
    Prescription,
    PrescriptionItem,
)


class PrescriptionItemInline(admin.TabularInline):
    model = PrescriptionItem
    extra = 1


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ("id", "patient", "doctor", "date", "status")
    inlines = [PrescriptionItemInline]


class PharmacyBillItemInline(admin.TabularInline):
    model = PharmacyBillItem
    extra = 0


@admin.register(PharmacyBill)
class PharmacyBillAdmin(admin.ModelAdmin):
    list_display = ("id", "patient", "total", "payment_status")
    inlines = [PharmacyBillItemInline]


admin.site.register(MedicineRequest)