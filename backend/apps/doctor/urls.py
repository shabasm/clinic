from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CompleteConsultationView,
    ConsultationDetailView,
    DoctorLabTestListView,
    DoctorMedicineListView,
    DoctorPastConsultationsView,
    DoctorPatientHistoryView,
    DoctorPatientSearchView,
    DoctorProfileView,
    DoctorQueueView,
    DoctorViewSet,
    SaveDraftConsultationView,
    StartConsultationView,
)

router = DefaultRouter()
router.register("doctors", DoctorViewSet, basename="doctor")

urlpatterns = [
    *router.urls,
    path("doctor/profile/", DoctorProfileView.as_view(), name="doctor-profile"),
    path("doctor/queue/", DoctorQueueView.as_view(), name="doctor-queue"),
    path("doctor/tokens/<int:token_id>/start/", StartConsultationView.as_view(), name="doctor-start-consultation"),
    path("doctor/consultations/<int:pk>/", ConsultationDetailView.as_view(), name="doctor-consultation-detail"),
    path("doctor/consultations/<int:pk>/draft/", SaveDraftConsultationView.as_view(), name="doctor-consultation-draft"),
    path("doctor/consultations/<int:pk>/complete/", CompleteConsultationView.as_view(), name="doctor-consultation-complete"),
    path("doctor/tokens/<int:token_id>/complete/", CompleteConsultationView.as_view(), name="doctor-token-complete"),
    path("doctor/medicines/", DoctorMedicineListView.as_view(), name="doctor-medicines"),
    path("doctor/lab-tests/", DoctorLabTestListView.as_view(), name="doctor-lab-tests"),
    path("doctor/past-consultations/", DoctorPastConsultationsView.as_view(), name="doctor-past-consultations"),
    path("doctor/patients/", DoctorPatientSearchView.as_view(), name="doctor-patients-search"),
    path("doctor/patients/<int:patient_id>/history/", DoctorPatientHistoryView.as_view(), name="doctor-patient-history"),
]
