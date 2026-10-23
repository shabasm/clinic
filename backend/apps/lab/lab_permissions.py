"""
apps/lab/permissions.py

Only lab technicians (and the Admin superuser) may use the lab API.
If the team later builds one shared set of role permissions in admin_module,
replace this file with an import from there.
"""
from rest_framework.permissions import BasePermission

from apps.admin_module.models import Staff


class IsLabTechnician(BasePermission):
    message = "Only lab technicians can access this."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:  # the Admin account
            return True
        # Staff.user is a one-to-one link, so the reverse name is "staff".
        staff = getattr(user, "staff", None)
        return bool(staff and staff.is_active and staff.role == Staff.Role.LAB_TECHNICIAN)