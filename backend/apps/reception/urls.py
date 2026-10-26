from django.urls import path

from . import views

urlpatterns = [
    # Patients
    path("patients/", views.patient_list_create, name="patient-list-create"),
    path("patients/<int:pk>/", views.patient_detail, name="patient-detail"),

    # Doctors
    path("doctors/", views.doctor_list, name="doctor-list"),

    # Appointments
    path("bookings/", views.booking_list_create, name="booking-list-create"),

    # Registration billing
    path(
        "registration-bills/",
        views.registration_bill_list_create,
        name="registration-bill-list-create",
    ),
    path(
        "registration-bills/<int:bill_id>/pay/",
        views.registration_bill_pay,
        name="registration-bill-pay",
    ),

    # Tokens
    path("tokens/", views.token_list, name="token-list"),

    # Consultations
    path(
        "consultations/",
        views.consultation_list_create,
        name="consultation-list-create",
    ),
    path(
        "consultations/<int:consultation_id>/complete/",
        views.consultation_complete,
        name="consultation-complete",
    ),

    # Consultation billing
    path(
        "consultation-bills/<int:bill_id>/pay/",
        views.consultation_bill_pay,
        name="consultation-bill-pay",
    ),
]