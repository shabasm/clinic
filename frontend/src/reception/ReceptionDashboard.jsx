import { useCallback, useEffect, useState } from "react";
import api, { collection, errorMessage, formatDate, formatId } from "../admin/services/api";
import AdminModal from "../admin/components/AdminModal";
import RoleNavbar from "../shared/RoleNavbar";
import "./ReceptionDashboard.css";

const money = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function ReceptionDashboard() {
  const [activeSection, setActiveSection] = useState("Overview");
  const [dashboard, setDashboard] = useState(null);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registrationBill, setRegistrationBill] = useState(null);
  const [consultationBill, setConsultationBill] = useState(null);
  const [saving, setSaving] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [editingPatient, setEditingPatient] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [appointmentDate, setAppointmentDate] = useState(today());
  const [appointmentDoctor, setAppointmentDoctor] = useState("");
  const [rescheduling, setRescheduling] = useState(null);
  const [patientForm, setPatientForm] = useState({
    full_name: "", date_of_birth: "", gender: "", phone: "", address: "",
    blood_group: "", emergency_contact_name: "", emergency_contact_phone: "",
  });
  const [bookingForm, setBookingForm] = useState({ patient: "", doctor: "", date: today() });
  const [walkInForm, setWalkInForm] = useState({ patient: "", doctor: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const [dashboardResponse, patientsResponse, doctorsResponse, bookingsResponse] = await Promise.all([
        api.get("reception/dashboard/"),
        api.get("reception/patients/"),
        api.get("reception/doctors/"),
        api.get(`reception/bookings/?date=${appointmentDate}${appointmentDoctor ? `&doctor=${appointmentDoctor}` : ""}`),
      ]);
      setDashboard(dashboardResponse.data);
      setPatients(collection(patientsResponse.data));
      setDoctors(collection(doctorsResponse.data));
      setBookings(collection(bookingsResponse.data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [appointmentDate, appointmentDoctor]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = async (event, path, data, success, reset, method = "post") => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api[method](path, data);
      setNotice(success(response.data));
      reset?.(response.data);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const choose = (setter, key) => (event) => setter((current) => ({ ...current, [key]: event.target.value }));

  const collectConsultationFee = async (token) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const tokenId = token.token_id || token.id;
      const { data } = await api.post(`reception/tokens/${tokenId}/collect-payment/`, { payment_method: paymentMethod });
      setConsultationBill({ ...token, ...data, consultation_bill_id: data.bill_id });
      setNotice(`${token.patient_name} paid ${money(data.amount)} by ${paymentMethod}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const activatePaidToken = async (token) => {
    setSaving(true);
    setError("");
    try {
      await api.post(`reception/tokens/${token.id}/activate/`);
      setNotice(`Token ${formatId("TK", token.token_number)} is active and waiting for the doctor.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const collectRegistrationFee = async (patient) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`reception/patients/${patient.id}/collect-registration-payment/`, { payment_method: paymentMethod });
      setRegistrationBill({ ...patient, ...data });
      setNotice(`${patient.full_name} paid ${money(data.amount)} registration fee by ${data.payment_method}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const issueBookingToken = async (booking) => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(`reception/bookings/${booking.id}/issue-token/`);
      setNotice(`Token ${formatId("TK", data.token_number)} issued for ${booking.patient_name}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const deactivatePatient = async (patient) => {
    if (!window.confirm(`Deactivate ${patient.full_name}? Their medical history will be preserved.`)) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`reception/patients/${patient.id}/`);
      setNotice(`${patient.full_name} was deactivated. Their records remain available in the database.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const saveReschedule = async (booking) => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`reception/bookings/${booking.id}/`, { date: rescheduling.date, doctor: rescheduling.doctor });
      setNotice(`Appointment for ${booking.patient_name} rescheduled.`);
      setRescheduling(null);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const filteredPatients = patients.filter((patient) =>
    `${formatId("PT", patient.id)} ${patient.id} ${patient.full_name} ${patient.phone}`.toLowerCase().includes(patientSearch.trim().toLowerCase())
  );
  const walkInPatient = patients.find((patient) => String(patient.id) === walkInForm.patient);
  const sections = ["Overview", "Register & schedule", "Patients", "Doctors", "Today\u2019s queue", "Payments", "Appointments"];

  return (
    <>
      <RoleNavbar title="Reception workspace" navItems={sections} activeItem={activeSection} onNavigate={setActiveSection} />
      <main className="container admin-main reception-layout">
<div className="reception-content">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <h1 className="mb-1">Reception desk</h1>
            <p className="mb-0">Register patients, schedule visits, and manage today’s queue.</p>
          </div>
          <div className="text-muted">{formatDate(today())}</div>
        </header>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {registrationBill && <AdminModal title="Registration bill" size="modal-lg" onClose={() => setRegistrationBill(null)}>
          <div className="modal-body p-4">
            <div className="print-area border rounded-3 p-4">
              <div className="d-flex flex-wrap justify-content-between gap-3 border-bottom pb-3 mb-3">
                <div><div className="text-primary fw-bold fs-4">CareFlow Clinic</div><div className="small text-secondary">Patient registration invoice</div></div>
                <div className="text-sm-end"><div className="fw-semibold">REGISTRATION BILL</div><div className="text-secondary">{formatId("RB", registrationBill.registration_bill_id)}</div><div className="small text-secondary">Date: {formatDate(registrationBill.registration_bill_created_at)}</div></div>
              </div>
              <div className="row g-3 mb-4">
                <div className="col-sm-7"><div className="small text-secondary">BILLED TO</div><div className="fw-semibold">{registrationBill.full_name}</div><div className="small">Patient {formatId("PT", registrationBill.id)}</div><div className="small">{registrationBill.phone}</div></div>
                <div className="col-sm-5 text-sm-end"><div className="small text-secondary">PAYMENT STATUS</div><span className={`badge text-bg-${registrationBill.registration_payment_status === "Paid" ? "success" : "warning"}`}>{registrationBill.registration_payment_status || "Pending"}</span>{registrationBill.registration_payment_method && <div className="small mt-2">Paid by {registrationBill.registration_payment_method}</div>}{registrationBill.registration_paid_at && <div className="small text-secondary">{formatDate(registrationBill.registration_paid_at)}</div>}</div>
              </div>
              <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Description</th><th className="text-end">Amount</th></tr></thead><tbody><tr><td>One-time patient registration</td><td className="text-end">{money(registrationBill.registration_fee ?? dashboard?.registration_fee)}</td></tr></tbody><tfoot><tr><th className="text-end">Total</th><th className="text-end fs-5">{money(registrationBill.registration_fee ?? dashboard?.registration_fee)}</th></tr></tfoot></table></div>
              <div className="border-top mt-3 pt-3 text-center small text-secondary">Thank you. Please keep this bill for your records.</div>
            </div>
          </div>
          <div className="modal-footer d-print-none"><button className="btn btn-outline-secondary" type="button" onClick={() => setRegistrationBill(null)}>Close</button><button className="btn btn-primary" type="button" onClick={() => window.print()}>Print bill</button></div>
        </AdminModal>}
        {consultationBill && <AdminModal title="Consultation bill" size="modal-lg" onClose={() => setConsultationBill(null)}>
          <div className="modal-body p-4">
            <div className="print-area border rounded-3 p-4">
              <div className="d-flex flex-wrap justify-content-between gap-3 border-bottom pb-3 mb-3">
                <div><div className="text-primary fw-bold fs-4">CareFlow Clinic</div><div className="small text-secondary">Consultation payment receipt</div></div>
                <div className="text-sm-end"><div className="fw-semibold">CONSULTATION BILL</div><div className="text-secondary">{formatId("CB", consultationBill.consultation_bill_id)}</div><div className="small text-secondary">Date: {formatDate(consultationBill.created_at)}</div></div>
              </div>
              <div className="row g-3 mb-4">
                <div className="col-sm-7"><div className="small text-secondary">BILLED TO</div><div className="fw-semibold">{consultationBill.patient_name}</div><div className="small">Patient {formatId("PT", consultationBill.patient_id)}</div><div className="small">{consultationBill.patient_phone}</div><div className="small">Doctor: {consultationBill.doctor_name}</div><div className="small">Token: {formatId("TK", consultationBill.token_number)}</div></div>
                <div className="col-sm-5 text-sm-end"><div className="small text-secondary">PAYMENT STATUS</div><span className="badge text-bg-success">{consultationBill.payment_status}</span><div className="small mt-2">Paid by {consultationBill.payment_method}</div><div className="small text-secondary">{formatDate(consultationBill.paid_at)}</div></div>
              </div>
              <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Description</th><th className="text-end">Amount</th></tr></thead><tbody><tr><td>Doctor consultation</td><td className="text-end">{money(consultationBill.amount)}</td></tr></tbody><tfoot><tr><th className="text-end">Total paid</th><th className="text-end fs-5">{money(consultationBill.amount)}</th></tr></tfoot></table></div>
              <div className="border-top mt-3 pt-3 text-center small text-secondary">Thank you. Please keep this bill for your records.</div>
            </div>
          </div>
          <div className="modal-footer d-print-none"><button className="btn btn-outline-secondary" type="button" onClick={() => setConsultationBill(null)}>Close</button><button className="btn btn-primary" type="button" onClick={() => window.print()}>Print bill</button></div>
        </AdminModal>}

        {activeSection === "Overview" && <div className="row g-3 mb-4">
          {[["Registered patients", dashboard?.patients], ["Appointments today", dashboard?.appointments_today], ["Waiting tokens", dashboard?.waiting_tokens], ["Completed consultations", dashboard?.completed_consultations], ["Pending registration fees", dashboard?.pending_registration_payments], ["Pending consultation bills", dashboard?.pending_consultation_payments]].map(([label, value]) => (
            <div className="col-6 col-lg-4 col-xxl-2" key={label}>
              <div className="card stat-card h-100"><div className="card-body">
                <div className="small text-secondary">{label}</div>
                <div className="stat-num">{loading ? "…" : value ?? 0}</div>
              </div></div>
            </div>
          ))}
        </div>}

        {activeSection === "Register & schedule" && <div className="row g-4 mb-4">
          <div className="col-12 col-xl-6">
            <section className="card h-100"><div className="card-body">
              <h2 className="h5 mb-3">Register a patient</h2>
              <form className="row g-3" onSubmit={(event) => submit(
                event, editingPatient ? `reception/patients/${editingPatient.id}/` : "reception/patients/", editingPatient ? patientForm : { ...patientForm, payment_method: paymentMethod },
                (patient) => {
                  if (editingPatient) return `${patient.full_name} was updated.`;
                  setRegistrationBill(patient);
                  return "";
                },
                () => { setPatientForm({ full_name: "", date_of_birth: "", gender: "", phone: "", address: "", blood_group: "", emergency_contact_name: "", emergency_contact_phone: "" }); setEditingPatient(null); },
                editingPatient ? "put" : "post",
              )}>
                <div className="col-12 col-md-6"><label className="form-label required">Full name</label><input className="form-control" required minLength="3" maxLength="100" autoComplete="name" value={patientForm.full_name} onChange={choose(setPatientForm, "full_name")} /></div>
                <div className="col-6 col-md-3"><label className="form-label required">Date of birth</label><input type="date" className="form-control" required min="1900-01-01" max={yesterday()} value={patientForm.date_of_birth} onChange={choose(setPatientForm, "date_of_birth")} /></div>
                <div className="col-6 col-md-3"><label className="form-label required">Gender</label><select className="form-select" required value={patientForm.gender} onChange={choose(setPatientForm, "gender")}><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option></select></div>
                <div className="col-12 col-md-6"><label className="form-label required">Phone</label><input type="tel" className="form-control" required minLength="10" maxLength="15" pattern="[0-9]{10,15}" title="Enter 10 to 15 digits." autoComplete="tel" value={patientForm.phone} onChange={choose(setPatientForm, "phone")} /></div>
                <div className="col-12"><label className="form-label required">Address</label><textarea className="form-control" required minLength="3" rows="2" value={patientForm.address} onChange={choose(setPatientForm, "address")} /></div>
                <div className="col-12 col-md-4"><label className="form-label">Blood group</label><select className="form-select" value={patientForm.blood_group} onChange={choose(setPatientForm, "blood_group")}><option value="">Select blood group</option><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option><option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option><option value="Unknown">Unknown</option></select></div>
                <div className="col-12 col-md-4"><label className="form-label">Emergency contact name</label><input className="form-control" maxLength="100" required={Boolean(patientForm.emergency_contact_phone)} value={patientForm.emergency_contact_name} onChange={choose(setPatientForm, "emergency_contact_name")} /></div>
                <div className="col-12 col-md-4"><label className="form-label">Emergency contact phone</label><input type="tel" className="form-control" minLength="10" maxLength="15" pattern="[0-9]{10,15}" title="Enter 10 to 15 digits, or leave blank." required={Boolean(patientForm.emergency_contact_name)} value={patientForm.emergency_contact_phone} onChange={choose(setPatientForm, "emergency_contact_phone")} /></div>
                <div className="col-12"><div className="alert alert-light border mb-0 py-2"><span className="fw-semibold">Registration fee:</span> {money(dashboard?.registration_fee)} <span className="text-secondary">(one time per patient)</span></div></div>
                <div className="col-12 d-flex gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : editingPatient ? "Save patient" : "Register patient"}</button>{editingPatient && <button className="btn btn-outline-secondary" type="button" onClick={() => { setEditingPatient(null); setPatientForm({ full_name: "", date_of_birth: "", gender: "", phone: "", address: "", blood_group: "", emergency_contact_name: "", emergency_contact_phone: "" }); }}>Cancel edit</button>}</div>
              </form>
            </div></section>
          </div>

          <div className="col-12 col-xl-6">
            <div className="d-grid gap-4">
              <section className="card"><div className="card-body">
                <h2 className="h5 mb-3">Book an appointment</h2>
                <form className="row g-3" onSubmit={(event) => submit(
                  event, "reception/bookings/", bookingForm,
                  (booking) => `Appointment booked for ${booking.patient_name} with ${booking.doctor_name}. Issue a token when the patient arrives; walk-ins are tokened when they arrive.`,
                )}>
                  <div className="col-12 col-md-6"><label className="form-label required">Patient</label><select className="form-select" required value={bookingForm.patient} onChange={choose(setBookingForm, "patient")}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.phone}</option>)}</select></div>
                  <div className="col-12 col-md-6"><label className="form-label required">Doctor</label><select className="form-select" required value={bookingForm.doctor} onChange={choose(setBookingForm, "doctor")}><option value="">Select doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}{doctor.department_name ? ` · ${doctor.department_name}` : ""}</option>)}</select></div>
                  <div className="col-12 col-md-6"><label className="form-label required">Date</label><input type="date" className="form-control" required min={today()} value={bookingForm.date} onChange={choose(setBookingForm, "date")} /></div>
                  {bookingForm.doctor && <div className="col-12"><div className="small text-secondary">{(() => { const doctor = doctors.find((item) => String(item.id) === bookingForm.doctor); return <>Consultation fee: {money(doctor?.consultation_fee)}{doctor?.consultation_days?.length > 0 && <> · Schedule: {doctor.consultation_days.join(", ")}{doctor.consultation_start_time ? `, ${doctor.consultation_start_time.slice(0, 5)}–${doctor.consultation_end_time?.slice(0, 5)}` : ""}</>}</>; })()}</div></div>}
                  <div className="col-12 align-self-end"><button className="btn btn-primary" disabled={saving || !patients.length || !doctors.length}>Book appointment</button></div>
                </form>
              </div></section>

              <section className="card"><div className="card-body">
                <h2 className="h5 mb-3">Add a walk-in to today’s queue</h2>
                <form className="row g-3" onSubmit={(event) => submit(
                  event, "reception/walk-ins/", walkInForm,
                  (token) => `Walk-in added for ${token.patient_name} with ${token.doctor_name}. Token ${token.token_number}.`,
                )}>
                  <div className="col-12 col-md-6"><label className="form-label required">Patient</label><select className="form-select" required value={walkInForm.patient} onChange={choose(setWalkInForm, "patient")}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.phone}</option>)}</select></div>
                  <div className="col-12 col-md-6"><label className="form-label required">Doctor</label><select className="form-select" required value={walkInForm.doctor} onChange={choose(setWalkInForm, "doctor")}><option value="">Select doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}{doctor.department_name ? ` · ${doctor.department_name}` : ""}</option>)}</select></div>
                  {walkInForm.doctor && <div className="col-12"><div className="small text-secondary">{(() => { const doctor = doctors.find((item) => String(item.id) === walkInForm.doctor); return <>Consultation fee: {money(doctor?.consultation_fee)}. Billed after the doctor completes the consultation. {doctor?.consultation_days?.length > 0 && <>Schedule: {doctor.consultation_days.join(", ")}. </>}Registration payment is required before token issue.</>; })()}</div></div>}
                  <div className="col-12"><button className="btn btn-outline-primary" disabled={saving || !patients.length || !doctors.length || walkInPatient?.registration_payment_status !== "Paid"}>Add walk-in</button>{walkInForm.patient && walkInPatient?.registration_payment_status !== "Paid" && <div className="form-text">Collect this patient's registration fee in the Patients list before adding a walk-in.</div>}</div>
                </form>
              </div></section>
            </div>
          </div>
        </div>}

        {activeSection === "Patients" && <section className="card mb-4"><div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3"><h2 className="h5 mb-0">Patients</h2><input className="form-control" style={{ maxWidth: 360 }} aria-label="Search patients" placeholder="Search patient ID, name, or phone" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} /></div>
          <div className="d-flex align-items-center gap-2 mb-3"><label className="small fw-semibold" htmlFor="payment-method">Payment method for registration and manual payments</label><select id="payment-method" className="form-select form-select-sm" style={{ maxWidth: 150 }} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Cash</option><option>Card</option><option>UPI</option></select></div>
          {loading ? <div className="text-muted">Loading patients…</div> : filteredPatients.length ? (
            <div className="table-responsive"><table className="table align-middle mb-0">
              <thead><tr><th>Patient ID</th><th>Name</th><th>Phone</th><th>Registration fee</th><th>Actions</th></tr></thead>
              <tbody>{filteredPatients.map((patient) => <tr key={patient.id}>
                <td>{formatId("PT", patient.id)}</td>
                <td>{patient.full_name}<details className="small mt-1"><summary>Details and history</summary>
                  <div className="mt-1">Blood group: {patient.blood_group || "Not recorded"}</div>
                  <div>Emergency contact: {patient.emergency_contact_name || "Not recorded"} {patient.emergency_contact_phone || ""}</div>
                  <div>Appointments: {patient.appointment_history?.map((item) => `${formatDate(item.date)} · ${item.doctor} (${item.status})`).join("; ") || "None"}</div>
                  <div>Consultations: {patient.consultation_history?.map((item) => `${formatDate(item.date)} · ${item.doctor} (${item.status})`).join("; ") || "None"}</div>
                </details></td>
                <td>{patient.phone}</td>
                <td>{patient.registration_fee ? money(patient.registration_fee) : money(dashboard?.registration_fee)}<div className="small text-secondary">{patient.registration_payment_status || "Pending"}</div></td>
                <td className="text-nowrap">
                  <button className="btn btn-sm btn-outline-secondary me-2" type="button" onClick={() => { setEditingPatient(patient); setPatientForm({ full_name: patient.full_name, date_of_birth: patient.date_of_birth, gender: patient.gender, phone: patient.phone, address: patient.address, blood_group: patient.blood_group || "", emergency_contact_name: patient.emergency_contact_name || "", emergency_contact_phone: patient.emergency_contact_phone || "" }); setActiveSection("Register & schedule"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                  {patient.registration_payment_status !== "Paid" && <button className="btn btn-sm btn-primary me-2" type="button" disabled={saving} onClick={() => collectRegistrationFee(patient)}>Collect registration fee</button>}
                  <button className="btn btn-sm btn-outline-danger" type="button" disabled={saving} onClick={() => deactivatePatient(patient)}>Deactivate</button>
                </td>
              </tr>)}</tbody>
            </table></div>
          ) : <div className="empty">No matching patients.</div>}
        </div></section>}

        {activeSection === "Doctors" && <section className="card mb-4"><div className="card-body">
          <h2 className="h5 mb-3">Available doctors</h2>
          {doctors.length ? <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Doctor</th><th>Department</th><th>Consultation fee</th><th>Schedule</th></tr></thead><tbody>
            {doctors.map((doctor) => <tr key={doctor.id}><td>{doctor.name}</td><td>{doctor.department_name || "—"}</td><td>{money(doctor.consultation_fee)}</td><td>{doctor.consultation_days?.length ? `${doctor.consultation_days.join(", ")}${doctor.consultation_start_time ? ` · ${doctor.consultation_start_time.slice(0, 5)}–${doctor.consultation_end_time?.slice(0, 5)}` : ""}` : "Schedule not set"}</td></tr>)}
          </tbody></table></div> : <div className="empty">No active doctors are available.</div>}
        </div></section>}

        {activeSection === "Today’s queue" && <section className="card mb-4"><div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 mb-0">Today’s queue</h2><button className="btn btn-sm btn-outline-secondary" type="button" onClick={load}>Refresh</button></div>
          {loading ? <div className="text-muted">Loading reception records…</div> : dashboard?.queue?.length ? (
            <div className="table-responsive"><table className="table mb-0"><thead><tr><th>Token</th><th>Patient</th><th>Phone</th><th>Doctor</th><th>Visit type</th><th>Consultation fee</th><th>Status</th><th>Reception</th></tr></thead><tbody>
              {dashboard.queue.map((item) => <tr key={item.id}><td className="fw-semibold">{formatId("TK", item.token_number)}</td><td>{item.patient_name}</td><td>{item.patient_phone}</td><td>{item.doctor_name}</td><td>{item.token_type}</td><td>{item.consultation_fee == null ? "Not billed" : money(item.consultation_fee)}</td><td><span className={`badge text-bg-${item.status === "Active" ? "success" : item.status === "Completed" ? "secondary" : "info"}`}>{item.status}</span><div className="small text-secondary">Consultation: {item.consultation_payment_status}</div></td><td>{item.status === "Reserved" && item.registration_payment_status === "Paid" ? <button className="btn btn-sm btn-primary" type="button" disabled={saving} onClick={() => activatePaidToken(item)}>Activate paid token</button> : item.status === "Completed" && item.consultation_payment_status === "Pending" ? <button className="btn btn-sm btn-primary" type="button" disabled={saving} onClick={() => collectConsultationFee(item)}>Record manual payment</button> : item.status === "Active" ? <span className="text-success small fw-semibold">Waiting for doctor</span> : item.status === "Reserved" ? <span className="small text-secondary">Registration fee required</span> : "—"}</td></tr>)}
            </tbody></table></div>
          ) : <div className="empty">No patients are in the queue today.</div>}
        </div></section>}

        {activeSection === "Payments" && <section className="card mb-4"><div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 mb-0">Completed consultations awaiting payment</h2><button className="btn btn-sm btn-outline-secondary" type="button" onClick={load} disabled={loading}>Refresh bills</button></div>
          {dashboard?.pending_consultation_bills?.length ? <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Bill</th><th>Token</th><th>Patient</th><th>Doctor</th><th>Amount</th><th>Payment</th></tr></thead><tbody>{dashboard.pending_consultation_bills.map((bill) => <tr key={bill.id}><td>{formatId("CB", bill.id)}</td><td>{formatId("TK", bill.token_number)}</td><td>{bill.patient_name}</td><td>{bill.doctor_name}</td><td>{money(bill.amount)}</td><td><button className="btn btn-sm btn-primary" type="button" disabled={saving} onClick={() => collectConsultationFee(bill)}>Record manual payment</button></td></tr>)}</tbody></table></div> : <div className="empty">No completed consultations are awaiting payment.</div>}
        </div></section>}

        {activeSection === "Appointments" && <section className="card"><div className="card-body">
          <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3"><h2 className="h5 mb-0">Appointments</h2><div className="d-flex gap-2"><label className="small">Date<input className="form-control form-control-sm" type="date" value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} /></label><label className="small">Doctor<select className="form-select form-select-sm" value={appointmentDoctor} onChange={(event) => setAppointmentDoctor(event.target.value)}><option value="">All doctors</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label></div></div>
          {loading ? <div className="text-muted">Loading appointments…</div> : bookings.length ? (
            <div className="table-responsive"><table className="table mb-0"><thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {bookings.map((booking) => <tr key={booking.id}><td>{booking.token_number ? formatId("TK", booking.token_number) : "Not issued"}</td><td>{booking.patient_name}</td><td>{booking.doctor_name}</td><td>{booking.status}</td><td>{rescheduling?.id === booking.id ? <div className="d-flex flex-wrap gap-2"><input className="form-control form-control-sm" style={{ maxWidth: 150 }} type="date" min={today()} value={rescheduling.date} onChange={(event) => setRescheduling({ ...rescheduling, date: event.target.value })} /><select className="form-select form-select-sm" style={{ maxWidth: 180 }} value={rescheduling.doctor} onChange={(event) => setRescheduling({ ...rescheduling, doctor: event.target.value })}>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select><button className="btn btn-sm btn-primary" type="button" disabled={saving} onClick={() => saveReschedule(booking)}>Save</button><button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setRescheduling(null)}>Cancel</button></div> : <>{!booking.token_number && booking.status === "Reserved" && booking.registration_payment_status === "Paid" && booking.date === today() && <button className="btn btn-sm btn-primary me-2" type="button" disabled={saving} onClick={() => issueBookingToken(booking)}>Check in / issue token</button>}{booking.status === "Reserved" && <><button className="btn btn-sm btn-outline-secondary me-2" type="button" onClick={() => setRescheduling({ id: booking.id, date: booking.date, doctor: String(booking.doctor) })}>Reschedule</button><button className="btn btn-sm btn-outline-danger" type="button" disabled={saving} onClick={async () => { try { await api.post(`reception/bookings/${booking.id}/cancel/`); await load(); } catch (requestError) { setError(errorMessage(requestError)); } }}>Cancel appointment</button></>}</>}</td></tr>)}
            </tbody></table></div>
          ) : <div className="empty">No appointments scheduled for today.</div>}
        </div></section>}
        </div>
      </main>
    </>
  );
}

export default ReceptionDashboard;
