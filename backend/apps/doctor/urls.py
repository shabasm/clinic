from rest_framework.routers import DefaultRouter
from ..doctor.views import DoctorViewSet

router = DefaultRouter()
router.register("doctors", DoctorViewSet, basename="doctor")

urlpatterns = router.urls