from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ActivatePaidTokenView, BookingViewSet, CollectConsultationPaymentView, DoctorViewSet, PatientViewSet, ReceptionDashboardView, WalkInView

router = DefaultRouter()
router.register("patients", PatientViewSet, basename="reception-patient")
router.register("doctors", DoctorViewSet, basename="reception-doctor")
router.register("bookings", BookingViewSet, basename="reception-booking")

urlpatterns = [
    path("dashboard/", ReceptionDashboardView.as_view(), name="reception-dashboard"),
    path("walk-ins/", WalkInView.as_view(), name="reception-walk-in"),
    path("tokens/<int:token_id>/collect-payment/", CollectConsultationPaymentView.as_view(), name="reception-collect-consultation-payment"),
    path("tokens/<int:token_id>/activate/", ActivatePaidTokenView.as_view(), name="reception-activate-paid-token"),
    path("", include(router.urls)),
]
