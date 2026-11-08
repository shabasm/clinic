
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
    CurrentUserView,
    StaffCredentialsView,
    StaffCredentialsUpdateView,
    StaffPasswordResetView,
    AdminDashboardView
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
    path('me/', CurrentUserView.as_view(), name='current-user'),
     path('staff-credentials/', StaffCredentialsView.as_view(), name='staff-credentials'),
    path('staff-credentials-update/', StaffCredentialsUpdateView.as_view(), name='staff-credentials-update'),

    path(
        'staff-password-reset/',StaffPasswordResetView.as_view(),name='staff-password-reset'
    ),
    path(
        'dashboard/',AdminDashboardView.as_view(),name='admin-dashboard'
    ),
]
