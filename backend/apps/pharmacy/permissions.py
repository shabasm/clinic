"""
apps/pharmacy/pharmacy_permissions.py

Only pharmacists (and the Admin superuser) may use the pharmacy API.
Same approach as apps/lab/lab_permissions.py.
"""
from rest_framework.permissions import BasePermission

from apps.admin_module.models import Staff


class IsPharmacist(BasePermission):
    message = "Only pharmacists can access this."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:  # the Admin account
            return True
        # Staff.user is a one-to-one link, so the reverse name is "staff".
        staff = getattr(user, "staff", None)
        return bool(staff and staff.is_active and staff.role == Staff.Role.PHARMACIST)