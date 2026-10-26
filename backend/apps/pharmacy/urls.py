"""
apps/pharmacy/urls.py

Included in config/urls.py as:  path("api/pharmacy/", include("apps.pharmacy.urls"))
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MedicineRequestViewSet,
    MedicineViewSet,
    PharmacyBillViewSet,
    PharmacyDashboardView,
    PrescriptionViewSet,
)

router = DefaultRouter()
router.register("medicines", MedicineViewSet, basename="pharmacy-medicine")
router.register("medicine-requests", MedicineRequestViewSet, basename="pharmacy-medicine-request")
router.register("prescriptions", PrescriptionViewSet, basename="pharmacy-prescription")
router.register("bills", PharmacyBillViewSet, basename="pharmacy-bill")

urlpatterns = [
    path("dashboard/", PharmacyDashboardView.as_view(), name="pharmacy-dashboard"),
    path("", include(router.urls)),
]
