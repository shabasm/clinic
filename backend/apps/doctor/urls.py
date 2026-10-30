from rest_framework.routers import DefaultRouter
from django.urls import path
from ..doctor.views import (CompleteConsultationView, DoctorQueueView, DoctorViewSet, StartConsultationView)

router = DefaultRouter()
router.register("doctors", DoctorViewSet, basename="doctor")

urlpatterns = [
    *router.urls,
    path("doctor/queue/", DoctorQueueView.as_view(), name="doctor-queue"),
    path("doctor/tokens/<int:token_id>/start/", StartConsultationView.as_view(), name="doctor-start-consultation"),
    path("doctor/tokens/<int:token_id>/complete/", CompleteConsultationView.as_view(), name="doctor-complete-consultation"),
]
