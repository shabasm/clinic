import { useEffect, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { badgeColor, collection, errorMessage, formatDate, formatId, validateForm } from "../services/api";

const emptyForm = {
  full_name: "",
  gender: "",
  date_of_birth: "",
  phone: "",
  email: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  role: "",
  joining_date: "",
  qualification: "",
  is_active: true,
};

const localDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateAtAge = (dateString, age) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const targetYear = year + age;
  const targetDay = Math.min(day, new Date(targetYear, month, 0).getDate());
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
};

const personNamePattern = /^\p{L}[\p{L} .'-]{2,59}$/u;
const emailPattern = /^(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;

const staffFieldLabels = {
  full_name: "Full name",
  emergency_contact_name: "Emergency contact name",
  qualification: "Qualification",
  address: "Address",
  phone: "Phone",
  emergency_contact_phone: "Emergency phone",
  date_of_birth: "Date of birth",
  joining_date: "Joining date",
  email: "Email",
  non_field_errors: "Error",
};

const staffErrorMessage = (error) => {
  const data = error.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const [field, messages] = Object.entries(data)[0] || [];
    if (field) {
      const message = Array.isArray(messages) ? messages[0] : messages;
      if (typeof message === "string") {
        return `${staffFieldLabels[field] || field}: ${message}`;
      }
    }
  }
  return errorMessage(error);
};

function Staff() {
  const [staff, setStaff] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewMember, setViewMember] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadStaff = async () => {
    try {
      const [staffResponse, doctorResponse, departmentResponse] = await Promise.all([
        api.get("staff/"),
        api.get("doctors/"),
        api.get("departments/"),
      ]);
      setStaff(collection(staffResponse.data));
      setDoctors(collection(doctorResponse.data));
      setDepartments(collection(departmentResponse.data));
    } catch (requestError) {
      setError(staffErrorMessage(requestError));
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("staff/"),
      api.get("doctors/"),
      api.get("departments/"),
    ])
      .then(([staffResponse, doctorResponse, departmentResponse]) => {
        setStaff(collection(staffResponse.data));
        setDoctors(collection(doctorResponse.data));
        setDepartments(collection(departmentResponse.data));
      })
      .catch((requestError) => setError(staffErrorMessage(requestError)));
  }, []);

  const departmentForStaff = (member) => {
    if (member.role !== "Doctor") return null;
    const profile = doctors.find((doctor) => doctor.staff === member.id);
    return departments.find((department) => department.id === profile?.department)?.name || "—";
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!validateForm(event.currentTarget)) return;
    if (!personNamePattern.test(form.full_name.trim())) {
      setError("Name: 3-60 letters; spaces, . ' and - allowed.");
      return;
    }
    if (!personNamePattern.test(form.emergency_contact_name.trim())) {
      setError("Emergency name: 3-60 letters; spaces, . ' and - allowed.");
      return;
    }
    if (!/^[1-9]\d{9}$/.test(form.phone)) {
      setError("Phone: Enter 10 digits; cannot start with 0.");
      return;
    }
    if (!/^[1-9]\d{9}$/.test(form.emergency_contact_phone)) {
      setError("Emergency phone: Enter 10 digits; cannot start with 0.");
      return;
    }
    if (!emailPattern.test(form.email.trim()) || form.email.trim().length > 80) {
      setError("Email: Enter a valid address (max 80 characters).");
      return;
    }
    const address = form.address.trim();
    if (address.length < 5 || address.length > 200) {
      setError("Address: Enter 5-200 characters.");
      return;
    }
    if (form.qualification.trim().length < 2) {
      setError("Qualification: Enter 2+ characters.");
      return;
    }
    const today = localDateString(new Date());
    if (dateAtAge(form.date_of_birth, 18) > today) {
      setError("Staff must be 18 or older.");
      return;
    }
    if (form.joining_date > today) {
      setError("Joining date cannot be in the future.");
      return;
    }
    if (form.joining_date < form.date_of_birth) {
      setError("Joining date must follow date of birth.");
      return;
    }
    if (form.joining_date < dateAtAge(form.date_of_birth, 18)) {
      setError("Staff must be 18 at joining.");
      return;
    }
    const normalizedName = form.full_name.trim().toLowerCase();
    const normalizedPhone = form.phone.replace(/\D/g, "");
    const duplicateIdentity = staff.find((member) =>
      member.id !== editId &&
      member.full_name.trim().toLowerCase() === normalizedName &&
      member.date_of_birth === form.date_of_birth &&
      member.phone.replace(/\D/g, "") === normalizedPhone
    );
    if (duplicateIdentity) {
      setError(`Duplicate staff (${formatId("STF", duplicateIdentity.id)}).`);
      return;
    }
    const duplicatePhone = staff.find((member) =>
      member.id !== editId && member.phone.replace(/\D/g, "") === normalizedPhone
    );
    if (duplicatePhone) {
      setError(`Phone already in use (${formatId("STF", duplicatePhone.id)}).`);
      return;
    }
    if (form.phone.trim() === form.emergency_contact_phone.trim()) {
      setError("Emergency phone must differ from staff phone.");
      return;
    }
    const normalizedEmail = form.email.trim().toLowerCase();
    if (normalizedEmail && staff.some((member) => member.email?.trim().toLowerCase() === normalizedEmail && member.id !== editId)) {
      setError("Email already in use.");
      return;
    }
    setSaving(true);
    let createdStaff = false;
    try {
      if (editId) {
        await api.patch(`staff/${editId}/`, {
          ...form,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          emergency_contact_name: form.emergency_contact_name.trim(),
          qualification: form.qualification.trim(),
        });
      } else {
        const { data } = await api.post("staff/", {
          ...form,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          emergency_contact_name: form.emergency_contact_name.trim(),
          qualification: form.qualification.trim(),
        });
        createdStaff = true;
        if (form.role === "Doctor") {
          await api.post("doctors/", { staff: data.id, is_active: false });
        }
      }
      resetForm();
      await loadStaff();
    } catch (requestError) {
      setError(
        createdStaff
          ? `Staff created; doctor profile failed: ${staffErrorMessage(requestError)}`
          : staffErrorMessage(requestError),
      );
      if (createdStaff) await loadStaff();
    } finally {
      setSaving(false);
    }
  };

  const editStaff = (member) => {
    const values = { ...member };
    delete values.user;
    setForm({ ...emptyForm, ...values });
    setEditId(member.id);
    setError("");
    setShowForm(true);
  };

  const toggleStatus = async (member) => {
    setError("");
    try {
      await api.patch(`staff/${member.id}/`, { is_active: !member.is_active });
      if (member.is_active && member.role === "Doctor") {
        const { data } = await api.get("doctors/");
        const profile = collection(data).find((doctor) => doctor.staff === member.id);
        if (profile?.is_active) {
          await api.patch(`doctors/${profile.id}/`, { is_active: false });
        }
      }
      await loadStaff();
      setPendingToggle(null);
    } catch (requestError) {
      setError(staffErrorMessage(requestError));
    }
  };

  const filteredStaff = staff.filter((member) => {
    const text = `${formatId("STF", member.id)} ${member.id} ${member.full_name} ${member.role} ${member.phone} ${member.email}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (!roleFilter || member.role === roleFilter) &&
      (!statusFilter || String(member.is_active) === statusFilter);
  });

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <h1 className="mb-1">Staff</h1>
            <p className="mb-0">Add, edit and deactivate staff. Staff records are retained for past records.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => { setForm(emptyForm); setEditId(null); setError(""); setShowForm(true); }}>
            Add staff
          </button>
        </header>
        {error && !showForm && !pendingToggle && <div className="alert alert-danger" role="alert">{error}</div>}
        {showForm && (
          <AdminModal title={editId ? "Edit staff member" : "Add staff member"} size="modal-lg" onClose={resetForm}>
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="full_name">Full name</label>
                  <input id="full_name" className="form-control" maxLength="60" required title="Use 3-60 letters; spaces, . ' and - allowed." value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="gender">Gender</label>
                  <select id="gender" className="form-select" required value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
                    <option value="">Choose...</option><option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="date_of_birth">Date of birth</label>
                  <input id="date_of_birth" className="form-control" type="date" max={localDateString(new Date())} required value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="phone">Phone</label>
                  <input id="phone" className="form-control" type="tel" inputMode="numeric" maxLength="10" pattern="[1-9][0-9]{9}" title="Enter 10 digits; cannot start with 0." required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="email">Email</label>
                  <input id="email" className="form-control" type="email" maxLength="80" required title="Enter a valid email (max 80 characters)." value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="role">Role</label>
                  <select id="role" className="form-select" required disabled={Boolean(editId)} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    <option value="">Choose...</option><option>Receptionist</option><option>Doctor</option><option>Pharmacist</option><option>Lab Technician</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="joining_date">Joining date</label>
                  <input id="joining_date" className="form-control" type="date" max={localDateString(new Date())} required value={form.joining_date} onChange={(event) => setForm({ ...form, joining_date: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="qualification">Qualification</label>
                  <input id="qualification" className="form-control" minLength="2" maxLength="100" pattern=".*\S.*" title="Enter 2+ characters." required value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} />
                </div>
                <div className="col-12">
                  <label className="form-label required" htmlFor="address">Address</label>
                  <textarea id="address" className="form-control" rows="2" minLength="5" maxLength="200" required title="Enter 5-200 characters." value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="emergency_contact_name">Emergency contact name</label>
                  <input id="emergency_contact_name" className="form-control" maxLength="60" required title="Use 3-60 letters; spaces, . ' and - allowed." value={form.emergency_contact_name} onChange={(event) => setForm({ ...form, emergency_contact_name: event.target.value })} />
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="emergency_contact_phone">Emergency contact phone</label>
                  <input id="emergency_contact_phone" className="form-control" type="tel" inputMode="numeric" maxLength="10" pattern="[1-9][0-9]{9}" title="Enter 10 digits; cannot start with 0." required value={form.emergency_contact_phone} onChange={(event) => setForm({ ...form, emergency_contact_phone: event.target.value })} />
                </div>
                {editId && (
                  <div className="col-12">
                    <div className="form-check">
                      <input id="is_active" className="form-check-input" type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                      <label className="form-check-label" htmlFor="is_active">Active staff member</label>
                    </div>
                  </div>
                )}
              </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" type="button" onClick={resetForm}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save staff"}</button>
              </div>
            </form>
          </AdminModal>
        )}
        <div className="d-flex flex-wrap gap-2 mb-3">
          <div className="input-group w-auto flex-grow-1"><span className="input-group-text">Search</span><input className="form-control" type="search" placeholder="Name, ID, phone or email" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="form-select w-auto" aria-label="All roles" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">All roles</option><option>Receptionist</option><option>Doctor</option><option>Pharmacist</option><option>Lab Technician</option>
          </select>
          <select className="form-select w-auto" aria-label="All statuses" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option>
          </select>
        </div>
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead><tr><th>Staff ID</th><th>Name</th><th>Role</th><th>Contact</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>{formatId("STF", member.id)}</td><td>{member.full_name}</td><td>{member.role}{member.role === "Doctor" && <><br /><small className="text-secondary">Department: {departmentForStaff(member)}</small></>}</td>
                    <td>{member.phone}{member.email && <div className="small text-muted">{member.email}</div>}</td>
                    <td>{formatDate(member.joining_date)}</td>
                    <td><span className={`badge text-bg-${badgeColor(member.is_active ? "Active" : "Inactive")}`}>{member.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="text-nowrap">
                      <button className="btn btn-sm btn-outline-secondary me-1" type="button" onClick={() => setViewMember(member)}>View</button>
                      <button className="btn btn-sm btn-outline-primary me-2" type="button" onClick={() => editStaff(member)}>Edit</button>
                      <button className={`btn btn-sm btn-outline-${member.is_active ? "danger" : "success"}`} type="button" onClick={() => member.is_active ? setPendingToggle(member) : toggleStatus(member)}>{member.is_active ? "Deactivate" : "Activate"}</button>
                    </td>
                  </tr>
                ))}
                {!filteredStaff.length && <tr><td className="empty" colSpan="7">{staff.length ? "No matching staff records." : "No staff yet. Use “Add staff” to create the first record."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      {viewMember && (
        <AdminModal title="Staff details" size="modal-lg" onClose={() => setViewMember(null)}>
          <div className="modal-body">
            <dl className="row mb-0">
              {[
                ["Staff ID", formatId("STF", viewMember.id)],
                ["Full name", viewMember.full_name],
                ["Role", viewMember.role],
                ...(viewMember.role === "Doctor" ? [["Department", departmentForStaff(viewMember)]] : []),
                ["Status", viewMember.is_active ? "Active" : "Inactive"],
                ["Gender", viewMember.gender],
                ["Date of birth", viewMember.date_of_birth],
                ["Phone", viewMember.phone],
                ["Email", viewMember.email || "—"],
                ["Address", viewMember.address || "—"],
                ["Emergency contact", `${viewMember.emergency_contact_name || "—"} · ${viewMember.emergency_contact_phone || "—"}`],
                ["Joining date", viewMember.joining_date],
                ["Qualification", viewMember.qualification || "—"],
                ["Login", viewMember.user ? "Set" : "Not set"],
              ].map(([label, value]) => (
                <div className="row" key={label}>
                  <dt className="col-sm-4">{label}</dt><dd className="col-sm-8">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="modal-footer"><button className="btn btn-primary" type="button" onClick={() => setViewMember(null)}>Close</button></div>
        </AdminModal>
      )}
      {pendingToggle && (
        <AdminModal title="Deactivate staff" onClose={() => setPendingToggle(null)}>
          <div className="modal-body">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            Deactivate {pendingToggle.full_name}? They will no longer be able to log in. Their past records are kept.
            {pendingToggle.role === "Doctor" && <p className="mt-3 mb-0">The doctor profile will also be set to Inactive.</p>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={() => setPendingToggle(null)}>Cancel</button>
            <button className="btn btn-danger" type="button" onClick={() => toggleStatus(pendingToggle)}>Deactivate</button>
          </div>
        </AdminModal>
      )}
    </>
  );
}

export default Staff;
