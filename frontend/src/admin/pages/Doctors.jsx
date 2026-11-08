import { useEffect, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { badgeColor, collection, errorMessage, formatId, formatMoney, validateForm } from "../services/api";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const emptyForm = {
  staff: "",
  department: "",
  experience_years: "",
  medical_license_number: "",
  consultation_fee: "",
  consultation_days: [],
  consultation_start_time: "",
  consultation_end_time: "",
  is_active: true,
};

function Doctors() {
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [doctorResponse, staffResponse, departmentResponse] = await Promise.all([
        api.get("doctors/"),
        api.get("staff/"),
        api.get("departments/"),
      ]);
      setDoctors(collection(doctorResponse.data));
      setStaff(collection(staffResponse.data));
      setDepartments(collection(departmentResponse.data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("doctors/"),
      api.get("staff/"),
      api.get("departments/"),
    ]).then(([doctorResponse, staffResponse, departmentResponse]) => {
      setDoctors(collection(doctorResponse.data));
      setStaff(collection(staffResponse.data));
      setDepartments(collection(departmentResponse.data));
    }).catch((requestError) => {
      setError(errorMessage(requestError));
    });
  }, []);

  const staffName = (id) => staff.find((member) => member.id === id)?.full_name || formatId("STF", id);
  const departmentName = (id) => departments.find((department) => department.id === id)?.name || "—";

  const editDoctor = (doctor) => {
    setEditId(doctor.id);
    setForm({
      staff: String(doctor.staff),
      department: doctor.department ? String(doctor.department) : "",
      experience_years: doctor.experience_years ?? "",
      medical_license_number: doctor.medical_license_number || "",
      consultation_fee: doctor.consultation_fee ?? "",
      consultation_days: doctor.consultation_days || [],
      consultation_start_time: doctor.consultation_start_time || "",
      consultation_end_time: doctor.consultation_end_time || "",
      is_active: doctor.is_active,
    });
    setShowForm(true);
  };

  const saveDoctor = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    if (!form.consultation_days.length) {
      setError("Select a consultation day.");
      return;
    }
    if (form.consultation_end_time <= form.consultation_start_time) {
      setError("End time must be later.");
      return;
    }
    const doctorStaff = staff.find((member) => member.id === Number(form.staff));
    if (doctorStaff?.date_of_birth && form.experience_years !== "") {
      const birthDate = new Date(`${doctorStaff.date_of_birth}T00:00:00`);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const beforeBirthday = today.getMonth() < birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
      if (beforeBirthday) age -= 1;
      const maxExperience = Math.max(0, age - 18);
      if (Number(form.experience_years) > maxExperience) {
        setError(`Experience exceeds the ${maxExperience}-year maximum.`);
        return;
      }
    }
    const normalizedLicense = form.medical_license_number.trim();
    if (doctors.some((doctor) =>
      doctor.medical_license_number?.toLowerCase() === normalizedLicense.toLowerCase() &&
      doctor.id !== editId
    )) {
      setError("License already in use.");
      return;
    }
    if (form.is_active) {
      const profileComplete = form.department && form.experience_years !== "" &&
        normalizedLicense && Number(form.consultation_fee) > 0 &&
        form.consultation_days.length > 0 && form.consultation_start_time &&
        form.consultation_end_time > form.consultation_start_time;
      if (!doctorStaff?.is_active) {
        setError("Activate staff first.");
        return;
      }
      if (!profileComplete) {
        setError("Complete the profile first.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        staff: Number(form.staff),
        department: form.department ? Number(form.department) : null,
        experience_years: form.experience_years === "" ? null : Number(form.experience_years),
        medical_license_number: normalizedLicense,
        consultation_fee: form.consultation_fee === "" ? null : Number(form.consultation_fee),
      };
      await api.patch(`doctors/${editId}/`, payload);
      setForm(emptyForm);
      setEditId(null);
      setShowForm(false);
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (doctor) => {
    setError("");
    try {
      if (!doctor.is_active) {
        const member = staff.find((item) => item.id === doctor.staff);
        const complete = doctor.department && doctor.experience_years !== null &&
          doctor.medical_license_number && Number(doctor.consultation_fee) > 0 &&
          doctor.consultation_days?.length && doctor.consultation_start_time &&
          doctor.consultation_end_time > doctor.consultation_start_time;
        if (!member?.is_active) {
          setError("Activate staff first.");
          return;
        }
        if (!complete) {
          setError("Complete the profile first.");
          return;
        }
      }
      await api.patch(`doctors/${doctor.id}/`, { is_active: !doctor.is_active });
      await loadData();
      setPendingToggle(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const filtered = doctors.filter((doctor) => {
    const isAvailable = doctor.is_active && staff.find((member) => member.id === doctor.staff)?.is_active;
    const searchText = `${formatId("DOC", doctor.id)} ${formatId("STF", doctor.staff)} ${doctor.id} ${staffName(doctor.staff)} ${departmentName(doctor.department)} ${doctor.medical_license_number || ""}`.toLowerCase();
    return searchText.includes(search.toLowerCase()) &&
      (!availability || String(Boolean(isAvailable)) === availability);
  });

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div><h1 className="mb-1">Doctors</h1><p className="mb-0">Doctor profiles, schedules and fees. A doctor is available only when the staff record and the profile are both Active.</p></div>
        </header>
        {error && !showForm && !pendingToggle && <div className="alert alert-danger" role="alert">{error}</div>}
        {showForm && (
          <AdminModal title="Edit doctor profile" size="modal-lg" onClose={() => { setForm(emptyForm); setEditId(null); setShowForm(false); }}>
            <form onSubmit={saveDoctor} noValidate>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                <div className="col-12 mb-3"><div className="fw-semibold">{staffName(Number(form.staff))} ({formatId("DOC", editId)})</div><div className="small text-secondary">Staff record: {staff.find((member) => member.id === Number(form.staff))?.is_active ? "Active" : "Inactive"}</div></div>
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label required" htmlFor="department">Department</label><select id="department" className="form-select" required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}><option value="">Choose...</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="experience_years">Experience (years)</label><input id="experience_years" className="form-control" type="number" min="0" max="60" step="1" required value={form.experience_years} onChange={(event) => setForm({ ...form, experience_years: event.target.value })} /></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="license">Medical license number</label><input id="license" className="form-control" maxLength="20" minLength="5" pattern="[A-Za-z0-9/-]{5,20}" title="Use 5-20 letters, numbers, / or -." required value={form.medical_license_number} onChange={(event) => setForm({ ...form, medical_license_number: event.target.value })} /></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="consultation_fee">Consultation fee (₹)</label><input id="consultation_fee" className="form-control" type="number" min="0.01" step="0.01" required value={form.consultation_fee} onChange={(event) => setForm({ ...form, consultation_fee: event.target.value })} /></div>
                <div className="col-12"><label className="form-label required d-block">Consultation days</label><div className="d-flex flex-wrap gap-3">{days.map((day) => <label className="form-check form-check-inline" key={day}><input className="form-check-input" type="checkbox" checked={form.consultation_days.includes(day)} onChange={(event) => setForm({ ...form, consultation_days: event.target.checked ? [...form.consultation_days, day] : form.consultation_days.filter((selected) => selected !== day) })} /> <span className="form-check-label">{day.slice(0, 3)}</span></label>)}</div></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="consultation_start_time">Start time</label><input id="consultation_start_time" className="form-control" type="time" required value={form.consultation_start_time} onChange={(event) => setForm({ ...form, consultation_start_time: event.target.value })} /></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="consultation_end_time">End time</label><input id="consultation_end_time" className="form-control" type="time" required value={form.consultation_end_time} onChange={(event) => setForm({ ...form, consultation_end_time: event.target.value })} /></div>
                {editId && <div className="col-md-6"><label className="form-label required" htmlFor="doctor_active">Doctor status</label><select id="doctor_active" className="form-select" value={String(form.is_active)} onChange={(event) => setForm({ ...form, is_active: event.target.value === "true" })}><option value="true">Active</option><option value="false">Inactive</option></select><div className="form-text">A doctor is available only when staff and doctor profile are Active.</div></div>}
              </div>
              </div>
              <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(false); }}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button></div>
            </form>
          </AdminModal>
        )}
        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1"><span className="input-group-text">Search</span><input className="form-control" type="search" placeholder="Name, Department and license" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="form-select w-auto" aria-label="All availability" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">All availability</option><option value="true">Available</option><option value="false">Unavailable</option></select>
        </div>
        <div className="card"><div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead><tr><th>Doctor</th><th>Department</th><th>Experience</th><th>License</th><th>Fee</th><th>Schedule</th><th>Status</th><th>Availability</th><th></th></tr></thead>
            <tbody>
              {filtered.map((doctor) => {
                const member = staff.find((item) => item.id === doctor.staff);
                const isAvailable = Boolean(doctor.is_active && member?.is_active);
                return <tr key={doctor.id}><td>{staffName(doctor.staff)}<br /><small className="text-secondary">{formatId("DOC", doctor.id)}</small></td><td>{departmentName(doctor.department)}</td><td>{doctor.experience_years != null ? `${doctor.experience_years} yrs` : "—"}</td><td>{doctor.medical_license_number || "—"}</td><td>{doctor.consultation_fee ? formatMoney(doctor.consultation_fee) : "—"}</td><td>{(doctor.consultation_days || []).map((day) => day.slice(0, 3)).join(", ") || "—"}<br /><small className="text-secondary">{doctor.consultation_start_time ? `${doctor.consultation_start_time}–${doctor.consultation_end_time}` : ""}</small></td><td><span className={`badge text-bg-${badgeColor(doctor.is_active ? "Active" : "Inactive")}`}>{doctor.is_active ? "Active" : "Inactive"}</span><br /><small className="text-secondary">Staff: {member?.is_active ? "Active" : "Inactive"}</small></td><td><span className={`badge text-bg-${badgeColor(isAvailable ? "Available" : "Unavailable")}`}>{isAvailable ? "Available" : "Unavailable"}</span></td><td className="text-end text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" type="button" onClick={() => editDoctor(doctor)}>Edit</button><button className={`btn btn-sm btn-outline-${doctor.is_active ? "danger" : "success"}`} type="button" onClick={() => doctor.is_active ? setPendingToggle(doctor) : toggleStatus(doctor)}>{doctor.is_active ? "Deactivate" : "Activate"}</button></td></tr>;
              })}
              {!filtered.length && <tr><td className="empty" colSpan="9">No doctor profiles found.</td></tr>}
            </tbody>
          </table>
        </div></div>
      </main>
      {pendingToggle && (
        <AdminModal title="Deactivate doctor" onClose={() => setPendingToggle(null)}>
          <div className="modal-body">{error && <div className="alert alert-danger" role="alert">{error}</div>}Deactivate this doctor? They will be hidden from new appointments and walk-ins. Past consultations are kept.</div>
          <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={() => setPendingToggle(null)}>Cancel</button><button className="btn btn-danger" type="button" onClick={() => toggleStatus(pendingToggle)}>Deactivate</button></div>
        </AdminModal>
      )}
    </>
  );
}

export default Doctors;
