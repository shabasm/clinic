"""
apps/lab/urls.py

Included in config/urls.py as:  path("api/lab/", include("apps.lab.urls"))
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    LabBillViewSet,
    LabOrderItemViewSet,
    LabOrderViewSet,
    LabReportViewSet,
    LabResultViewSet,
    LabTestViewSet,
)

router = DefaultRouter()
router.register("tests", LabTestViewSet, basename="lab-test")
router.register("orders", LabOrderViewSet, basename="lab-order")
router.register("items", LabOrderItemViewSet, basename="lab-item")
router.register("results", LabResultViewSet, basename="lab-result")
router.register("reports", LabReportViewSet, basename="lab-report")
router.register("bills", LabBillViewSet, basename="lab-bill")

urlpatterns = [
    path("", include(router.urls)),
]
