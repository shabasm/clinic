from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import filters, status, viewsets
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.admin_module.models import (
    Consultation,
    ConsultationBill,
    DoctorProfile,
    LabOrder,
    LabOrderItem,
    LabReport,
    LabResult,
    LabTest,
    Medicine,
    Patient,
    Prescription,
    PrescriptionItem,
    RegistrationBill,
    Token,
)
from .models import Doctor
from .serializers import (
    CompleteConsultationPayloadSerializer,
    DoctorPatientBriefSerializer,
    DoctorProfileInfoSerializer,
    DoctorQueueTokenSerializer,
    DoctorSerializer,
    LabTestOptionSerializer,
    MedicineOptionSerializer,
    SaveDraftConsultationPayloadSerializer,
    calculate_age,
)


class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    serializer_class = DoctorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "specialization", "license_number"]
    ordering_fields = ["created_at", "first_name", "experience_years"]


class IsLinkedDoctor(BasePermission):
    """
    Permission check ensuring the requesting user is an active Doctor staff
    member with an active DoctorProfile.
    """
    def has_permission(self, request, view):
        staff = getattr(request.user, "staff", None)
        return bool(
            request.user.is_authenticated
            and staff
            and staff.is_active
            and staff.role == "Doctor"
            and hasattr(staff, "doctor_profile")
            and staff.doctor_profile.is_active
        )


def get_current_doctor(request):
    return request.user.staff.doctor_profile


class DoctorProfileView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        doctor = get_current_doctor(request)
        serializer = DoctorProfileInfoSerializer(doctor)
        return Response(serializer.data)


class DoctorQueueView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        doctor = get_current_doctor(request)
        date_param = request.query_params.get("date")
        if date_param:
            try:
                filter_date = timezone.datetime.strptime(date_param, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"detail": "Invalid date format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            filter_date = timezone.localdate()

        tokens = (
            Token.objects.filter(doctor=doctor, date=filter_date)
            .select_related("patient", "consultation")
            .order_by("token_number")
        )
        serializer = DoctorQueueTokenSerializer(tokens, many=True)
        return Response(serializer.data)


class StartConsultationView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    @transaction.atomic
    def post(self, request, token_id):
        doctor = get_current_doctor(request)
        try:
            token = (
                Token.objects.select_for_update()
                .select_related("patient")
                .get(pk=token_id, doctor=doctor)
            )
        except Token.DoesNotExist:
            return Response(
                {"detail": "Token not found for this doctor."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if token.status != Token.Status.ACTIVE or token.date != timezone.localdate():
            return Response(
                {"detail": "Only an active token from today can start a consultation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check pending registration payment if bill exists
        pending_reg_bill = RegistrationBill.objects.filter(
            patient=token.patient,
            payment_status=RegistrationBill.PaymentStatus.PENDING,
        ).first()
        if pending_reg_bill:
            return Response(
                {"detail": "The registration payment must be confirmed before consultation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resume if already started
        if hasattr(token, "consultation"):
            consultation = token.consultation
            return Response(
                {"id": consultation.id, "status": consultation.status, "token_id": token.id},
                status=status.HTTP_200_OK,
            )

        consultation = Consultation.objects.create(
            token=token,
            patient=token.patient,
            doctor=doctor,
            status=Consultation.Status.IN_PROGRESS,
        )
        return Response(
            {"id": consultation.id, "status": consultation.status, "token_id": token.id},
            status=status.HTTP_201_CREATED,
        )


class ConsultationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request, pk):
        doctor = get_current_doctor(request)
        try:
            consultation = (
                Consultation.objects.select_related(
                    "token",
                    "patient",
                    "doctor__staff",
                    "doctor__department",
                )
                .prefetch_related(
                    "prescription__items__medicine",
                    "lab_orders__items__test",
                    "lab_orders__items__result",
                )
                .get(pk=pk, doctor=doctor)
            )
        except Consultation.DoesNotExist:
            return Response(
                {"detail": "Consultation record not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Existing prescription items
        rx_items = []
        if hasattr(consultation, "prescription"):
            rx = consultation.prescription
            for it in rx.items.all():
                rx_items.append({
                    "id": it.id,
                    "medicine_id": it.medicine_id,
                    "medicine_name": it.medicine_name,
                    "prescribed_quantity": it.prescribed_quantity,
                    "dispensed_quantity": it.dispensed_quantity,
                    "instructions": it.instructions,
                    "unit_price": str(it.medicine.price),
                })

        # Existing lab test IDs
        ordered_test_ids = []
        for lo in consultation.lab_orders.all():
            for item in lo.items.all():
                ordered_test_ids.append(item.test_id)

        # Patient recent consultations (up to 5 past completed consultations)
        past_consultations = (
            Consultation.objects.filter(
                patient=consultation.patient,
                status=Consultation.Status.COMPLETED,
            )
            .exclude(pk=consultation.pk)
            .select_related("doctor__staff", "doctor__department")
            .order_by("-completed_at", "-created_at")[:5]
        )
        recent_consultations_data = []
        for pc in past_consultations:
            dr_name = pc.doctor.staff.full_name if pc.doctor and pc.doctor.staff else "Doctor"
            dept_name = pc.doctor.department.name if pc.doctor and pc.doctor.department else "General Medicine"
            recent_consultations_data.append({
                "id": pc.id,
                "doctor_name": f"Dr. {dr_name}",
                "department": dept_name,
                "diagnosis": pc.diagnosis,
                "clinical_notes": pc.clinical_notes,
                "created_at": pc.created_at,
                "completed_at": pc.completed_at,
            })

        # Patient recent lab results (from lab order items for this patient)
        recent_items = (
            LabOrderItem.objects.filter(lab_order__patient=consultation.patient)
            .select_related("test", "lab_order", "result")
            .order_by("-lab_order__date", "-id")[:8]
        )
        recent_lab_results_data = []
        for item in recent_items:
            res_val = None
            ref_range = item.test.normal_values or ""
            remarks = ""
            if hasattr(item, "result"):
                res_val = item.result.result
                ref_range = item.result.reference_range or ref_range
                remarks = item.result.remarks or ""

            recent_lab_results_data.append({
                "test_name": item.test_name,
                "date": item.lab_order.date,
                "completed_date": item.completed_date,
                "status": item.status,
                "result": res_val,
                "reference_range": ref_range,
                "remarks": remarks,
            })

        patient_serializer = DoctorPatientBriefSerializer(consultation.patient)
        doc = consultation.doctor
        doc_data = {
            "id": doc.id,
            "name": doc.staff.full_name if doc.staff else "",
            "specialization": doc.department.name if doc.department else "General Medicine",
            "license_number": doc.medical_license_number or "",
        }

        return Response({
            "id": consultation.id,
            "status": consultation.status,
            "diagnosis": consultation.diagnosis,
            "clinical_notes": consultation.clinical_notes,
            "created_at": consultation.created_at,
            "completed_at": consultation.completed_at,
            "token": {
                "id": consultation.token.id,
                "token_number": consultation.token.token_number,
                "token_type": consultation.token.token_type,
                "date": consultation.token.date,
                "status": consultation.token.status,
            },
            "patient": patient_serializer.data,
            "doctor": doc_data,
            "prescription_items": rx_items,
            "lab_test_ids": ordered_test_ids,
            "recent_consultations": recent_consultations_data,
            "recent_lab_results": recent_lab_results_data,
        })


class SaveDraftConsultationView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    @transaction.atomic
    def post(self, request, pk):
        doctor = get_current_doctor(request)
        try:
            consultation = Consultation.objects.select_for_update().get(pk=pk, doctor=doctor)
        except Consultation.DoesNotExist:
            return Response(
                {"detail": "Consultation record not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if consultation.status != Consultation.Status.IN_PROGRESS:
            return Response(
                {"detail": "Only in-progress consultations can be edited as draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SaveDraftConsultationPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        consultation.diagnosis = data.get("diagnosis", consultation.diagnosis)
        consultation.clinical_notes = data.get("clinical_notes", consultation.clinical_notes)
        consultation.save(update_fields=["diagnosis", "clinical_notes"])

        # Update draft prescription items if provided
        rx_items_data = data.get("prescription_items", [])
        if rx_items_data:
            prescription, _ = Prescription.objects.get_or_create(
                consultation=consultation,
                defaults={
                    "patient": consultation.patient,
                    "doctor": doctor,
                    "status": Prescription.Status.PENDING,
                },
            )
            prescription.items.all().delete()
            for it in rx_items_data:
                med = Medicine.objects.get(pk=it["medicine_id"])
                PrescriptionItem.objects.create(
                    prescription=prescription,
                    medicine=med,
                    medicine_name=med.name,
                    prescribed_quantity=it["quantity"],
                    dispensed_quantity=0,
                    instructions=it.get("instructions", ""),
                )

        # Update draft lab tests if provided
        lab_test_ids = data.get("lab_test_ids", [])
        if lab_test_ids:
            lab_order = LabOrder.objects.filter(consultation=consultation).first()
            if not lab_order:
                lab_order = LabOrder.objects.create(
                    consultation=consultation,
                    patient=consultation.patient,
                    doctor=doctor,
                )
            for test_id in lab_test_ids:
                test = LabTest.objects.get(pk=test_id)
                LabOrderItem.objects.get_or_create(
                    lab_order=lab_order,
                    test=test,
                    defaults={
                        "test_name": test.name,
                        "cost": test.cost,
                        "status": LabOrderItem.Status.RECOMMENDED,
                    },
                )
            LabReport.objects.get_or_create(
                lab_order=lab_order,
                defaults={"status": LabReport.Status.PENDING},
            )

        return Response({"detail": "Draft consultation saved successfully."})


class CompleteConsultationView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    @transaction.atomic
    def post(self, request, pk=None, token_id=None):
        doctor = get_current_doctor(request)

        # Support calling with pk (consultation ID) or token_id
        if pk is not None:
            try:
                consultation = (
                    Consultation.objects.select_for_update()
                    .select_related("token", "patient")
                    .get(pk=pk, doctor=doctor)
                )
                token = consultation.token
            except Consultation.DoesNotExist:
                return Response(
                    {"detail": "Consultation record not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        elif token_id is not None:
            try:
                token = (
                    Token.objects.select_for_update()
                    .select_related("patient")
                    .get(pk=token_id, doctor=doctor)
                )
                consultation = Consultation.objects.select_for_update().get(token=token, doctor=doctor)
            except (Token.DoesNotExist, Consultation.DoesNotExist):
                return Response(
                    {"detail": "An in-progress consultation for this doctor was not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            return Response(
                {"detail": "Identifier required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if consultation.status != Consultation.Status.IN_PROGRESS:
            return Response(
                {"detail": "Only in-progress consultations can be completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CompleteConsultationPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        now = timezone.now()
        consultation.diagnosis = data["diagnosis"]
        consultation.clinical_notes = data["clinical_notes"]
        consultation.status = Consultation.Status.COMPLETED
        consultation.completed_at = now
        consultation.save(update_fields=["diagnosis", "clinical_notes", "status", "completed_at"])

        token.status = Token.Status.COMPLETED
        token.completed_at = now
        token.save(update_fields=["status", "completed_at"])

        if token.source_booking_id:
            token.source_booking.status = token.source_booking.Status.COMPLETED
            token.source_booking.save(update_fields=["status"])

        # 1. Create / Update Prescription and PrescriptionItem
        rx_items_data = data.get("prescription_items", [])
        prescription = None
        if rx_items_data:
            prescription, _ = Prescription.objects.get_or_create(
                consultation=consultation,
                defaults={
                    "patient": consultation.patient,
                    "doctor": doctor,
                    "status": Prescription.Status.PENDING,
                },
            )
            # Remove existing draft items and repopulate cleanly
            prescription.items.all().delete()
            for it in rx_items_data:
                med = Medicine.objects.get(pk=it["medicine_id"])
                PrescriptionItem.objects.create(
                    prescription=prescription,
                    medicine=med,
                    medicine_name=med.name,
                    prescribed_quantity=it["quantity"],
                    dispensed_quantity=0,
                    instructions=it.get("instructions", ""),
                )

        # 2. Create / Update LabOrder, LabOrderItem, and LabReport
        lab_test_ids = data.get("lab_test_ids", [])
        lab_order = None
        if lab_test_ids:
            lab_order = LabOrder.objects.filter(consultation=consultation).first()
            if not lab_order:
                lab_order = LabOrder.objects.create(
                    consultation=consultation,
                    patient=consultation.patient,
                    doctor=doctor,
                )
            for test_id in lab_test_ids:
                test = LabTest.objects.get(pk=test_id)
                LabOrderItem.objects.get_or_create(
                    lab_order=lab_order,
                    test=test,
                    defaults={
                        "test_name": test.name,
                        "cost": test.cost,
                        "status": LabOrderItem.Status.RECOMMENDED,
                    },
                )
            LabReport.objects.get_or_create(
                lab_order=lab_order,
                defaults={"status": LabReport.Status.PENDING},
            )

        # 3. Consultation Bill
        fee = doctor.consultation_fee or Decimal("0.00")
        bill, _ = ConsultationBill.objects.get_or_create(
            token=token,
            defaults={
                "patient": token.patient,
                "doctor": doctor,
                "consultation_fee": fee,
                "total": fee,
            },
        )

        return Response({
            "detail": "Consultation completed successfully.",
            "consultation_id": consultation.id,
            "consultation_status": consultation.status,
            "token_id": token.id,
            "bill_id": bill.id,
            "bill_status": bill.payment_status,
            "amount": str(bill.total),
            "prescription_id": prescription.id if prescription else None,
            "lab_order_id": lab_order.id if lab_order else None,
        }, status=status.HTTP_200_OK)


class DoctorMedicineListView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        query = request.query_params.get("search", "").strip()
        medicines = Medicine.objects.filter(is_active=True).exclude(
            expiry_date__lt=timezone.localdate()
        )
        if query:
            medicines = medicines.filter(
                Q(name__icontains=query) | Q(manufacturer__icontains=query)
            )
        serializer = MedicineOptionSerializer(medicines.order_by("name"), many=True)
        return Response(serializer.data)


class DoctorLabTestListView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        query = request.query_params.get("search", "").strip()
        tests = LabTest.objects.filter(is_active=True)
        if query:
            tests = tests.filter(name__icontains=query)
        serializer = LabTestOptionSerializer(tests.order_by("name"), many=True)
        return Response(serializer.data)


class DoctorPastConsultationsView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        doctor = get_current_doctor(request)
        consultations = (
            Consultation.objects.filter(doctor=doctor)
            .select_related("token", "patient")
            .prefetch_related("prescription__items", "lab_orders__items")
            .order_by("-created_at")
        )

        date_param = request.query_params.get("date")
        if date_param:
            try:
                filter_date = timezone.datetime.strptime(date_param, "%Y-%m-%d").date()
                consultations = consultations.filter(created_at__date=filter_date)
            except ValueError:
                pass

        search_param = request.query_params.get("search", "").strip()
        if search_param:
            consultations = consultations.filter(
                Q(patient__full_name__icontains=search_param)
                | Q(patient__phone__icontains=search_param)
                | Q(diagnosis__icontains=search_param)
            )

        data = []
        for c in consultations:
            rx_count = 0
            if hasattr(c, "prescription"):
                rx_count = c.prescription.items.count()

            lab_count = 0
            for lo in c.lab_orders.all():
                lab_count += lo.items.count()

            data.append({
                "id": c.id,
                "token_id": c.token.id,
                "token_number": c.token.token_number,
                "patient_id": c.patient.id,
                "patient_name": c.patient.full_name,
                "patient_phone": c.patient.phone,
                "patient_age": calculate_age(c.patient.date_of_birth),
                "patient_gender": c.patient.gender,
                "diagnosis": c.diagnosis,
                "clinical_notes": c.clinical_notes,
                "status": c.status,
                "created_at": c.created_at,
                "completed_at": c.completed_at,
                "prescription_items_count": rx_count,
                "lab_tests_count": lab_count,
            })

        return Response(data)


class DoctorPatientSearchView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request):
        query = request.query_params.get("search", "").strip()
        patients = Patient.objects.filter(is_active=True)
        if query:
            patients = patients.filter(
                Q(full_name__icontains=query) | Q(phone__icontains=query)
            )
        serializer = DoctorPatientBriefSerializer(patients.order_by("full_name")[:20], many=True)
        return Response(serializer.data)


class DoctorPatientHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsLinkedDoctor]

    def get(self, request, patient_id):
        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response(
                {"detail": "Patient not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 1. Consultations
        consultations = (
            Consultation.objects.filter(patient=patient)
            .select_related("doctor__staff", "doctor__department")
            .order_by("-created_at")
        )
        consultation_list = []
        for c in consultations:
            dr_name = c.doctor.staff.full_name if c.doctor and c.doctor.staff else "Doctor"
            dept_name = c.doctor.department.name if c.doctor and c.doctor.department else "General Medicine"
            consultation_list.append({
                "id": c.id,
                "doctor_name": f"Dr. {dr_name}",
                "department": dept_name,
                "diagnosis": c.diagnosis,
                "clinical_notes": c.clinical_notes,
                "status": c.status,
                "created_at": c.created_at,
                "completed_at": c.completed_at,
            })

        # 2. Prescriptions
        prescriptions = (
            Prescription.objects.filter(patient=patient)
            .select_related("doctor__staff")
            .prefetch_related("items__medicine")
            .order_by("-date", "-id")
        )
        prescription_list = []
        for rx in prescriptions:
            dr_name = rx.doctor.staff.full_name if rx.doctor and rx.doctor.staff else "Doctor"
            items_list = []
            for it in rx.items.all():
                items_list.append({
                    "medicine_name": it.medicine_name,
                    "prescribed_quantity": it.prescribed_quantity,
                    "dispensed_quantity": it.dispensed_quantity,
                    "instructions": it.instructions,
                })
            prescription_list.append({
                "id": rx.id,
                "date": rx.date,
                "doctor_name": f"Dr. {dr_name}",
                "status": rx.status,
                "dispensed_at": rx.dispensed_at,
                "items": items_list,
            })

        # 3. Laboratory Orders and Test Results
        lab_items = (
            LabOrderItem.objects.filter(lab_order__patient=patient)
            .select_related("lab_order__doctor__staff", "test", "result")
            .order_by("-lab_order__date", "-id")
        )
        lab_records_list = []
        for item in lab_items:
            dr_staff = item.lab_order.doctor.staff if item.lab_order.doctor else None
            dr_name = f"Dr. {dr_staff.full_name}" if dr_staff else "Doctor"

            result_value = None
            reference_range = item.test.normal_values or ""
            remarks = ""
            if hasattr(item, "result"):
                result_value = item.result.result
                reference_range = item.result.reference_range or reference_range
                remarks = item.result.remarks or ""

            lab_records_list.append({
                "id": item.id,
                "order_id": item.lab_order.id,
                "order_date": item.lab_order.date,
                "doctor_name": dr_name,
                "test_name": item.test_name,
                "cost": str(item.cost),
                "status": item.status,
                "completed_date": item.completed_date,
                "result": result_value,
                "reference_range": reference_range,
                "remarks": remarks,
            })

        patient_data = DoctorPatientBriefSerializer(patient).data

        return Response({
            "patient": patient_data,
            "consultations": consultation_list,
            "prescriptions": prescription_list,
            "lab_records": lab_records_list,
        })
