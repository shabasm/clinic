
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    DepartmentViewSet,
    StaffViewSet,
    DoctorProfileViewSet,
    MedicineViewSet,
    LabTestViewSet,
    MedicineRequestViewSet,
    SettingsViewSet,
)

router = DefaultRouter()
router.register('departments', DepartmentViewSet)
router.register('staff', StaffViewSet)
router.register('doctors', DoctorProfileViewSet)
router.register('medicines', MedicineViewSet)
router.register('labtests', LabTestViewSet)
router.register('stock-requests', MedicineRequestViewSet)
router.register('settings', SettingsViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
