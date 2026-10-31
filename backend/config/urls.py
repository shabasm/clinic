from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from apps.admin_module.serializers import CaseSensitiveTokenObtainPairSerializer

urlpatterns = [
    # Django Admin
    path('admin/', admin.site.urls),

    # JWT Authentication
    path(
        'api/login/',
        TokenObtainPairView.as_view(
            serializer_class=CaseSensitiveTokenObtainPairSerializer
        ),
        name='token_obtain_pair',
    ),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Reception APIs
    path('api/reception/', include('apps.reception.urls')),

    # Admin Module APIs
    path('api/', include('apps.admin_module.urls')),

    # Lab Module APIs
    path('api/lab/', include('apps.lab.urls')),

    # Pharmacy Module APIs
    path('api/pharmacy/', include('apps.pharmacy.urls')),

    path("api/", include("apps.doctor.urls")),
]
