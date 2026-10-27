from rest_framework.permissions import BasePermission


class IsReceptionist(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_staff:
            return True
        staff = getattr(request.user, "staff", None)
        return bool(staff and staff.is_active and staff.role == "Receptionist")
