import { useEffect, useMemo, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { collection, errorMessage, formatId, validateForm } from "../services/api";

function Credentials() {
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState("");
  const [loginFilter, setLoginFilter] = useState("");
  const [staffId, setStaffId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mode, setMode] = useState("create");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const loadStaff = async () => {
    try {
      const { data } = await api.get("staff/");
      setStaff(collection(data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  useEffect(() => {
    api.get("staff/")
      .then(({ data }) => setStaff(collection(data)))
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);

  const eligibleStaff = useMemo(
    () => staff.filter((member) => member.is_active && !member.user),
    [staff],
  );

  const beginCreate = (memberId = "") => {
    setMode("create");
    setStaffId(String(memberId));
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
    setShowModal(true);
  };

  const beginEdit = (member) => {
    setMode("edit");
    setStaffId(String(member.id));
    setUsername(member.username || "");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
    setShowModal(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const normalizedUsername = username.trim();
    const usernameKey = normalizedUsername.toLowerCase();
    if (!/^[a-z0-9._]{4,20}$/i.test(normalizedUsername)) {
      setError("Username: 4-20 letters, numbers, . or _.");
      return;
    }
    if (mode === "create" && usernameKey === "admin") {
      setError("Username is reserved.");
      return;
    }
    if (staff.some((member) =>
      member.id !== Number(staffId) &&
      member.username?.toLowerCase() === usernameKey
    )) {
      setError("Username already in use.");
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password: 8+ characters, with a letter and number.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await api.post("staff-credentials/", {
          staff_id: Number(staffId),
          username: normalizedUsername,
          password,
        });
        setNotice("Staff login credentials created successfully.");
      } else {
        await api.post("staff-credentials-update/", {
          staff_id: Number(staffId),
          username: normalizedUsername,
          new_password: password,
        });
        setNotice("Staff login credentials updated successfully.");
      }
      setPassword("");
      setConfirmPassword("");
      setUsername("");
      await loadStaff();
      setShowModal(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const filteredStaff = staff.filter((member) => {
    const hasLogin = Boolean(member.user);
    const text = `${formatId("STF", member.id)} ${member.id} ${member.full_name} ${member.role} ${member.username || ""}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (!loginFilter || String(hasLogin) === loginFilter);
  });

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <h1 className="mb-1">Credentials</h1>
            <p className="mb-0">Manage staff usernames and passwords. Login access follows staff status.</p>
          </div>
        </header>
        {error && !showModal && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <div className="d-flex flex-wrap gap-2 mb-3">
          <div className="input-group w-auto flex-grow-1"><span className="input-group-text">Search</span><input className="form-control" type="search" placeholder="Name, ID or username" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="form-select w-auto" aria-label="All logins" value={loginFilter} onChange={(event) => setLoginFilter(event.target.value)}>
            <option value="">All logins</option><option value="true">Set</option><option value="false">Not set</option>
          </select>
        </div>
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead><tr><th>Staff ID</th><th>Name</th><th>Role</th><th>Staff status</th><th>Username</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>{formatId("STF", member.id)}</td><td>{member.full_name}</td><td>{member.role}</td>
                    <td><span className={`badge text-bg-${member.is_active ? "success" : "secondary"}`}>{member.is_active ? "Active" : "Inactive"}</span></td>
                    <td>{member.username || <span className="text-secondary">Not set</span>}</td>
                    <td className="text-end text-nowrap">
                      {!member.user && member.is_active && (
                        <button className="btn btn-sm btn-outline-primary me-2" type="button" onClick={() => beginCreate(member.id)}>Set login</button>
                      )}
                      {member.user && (
                        <>
                          <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => beginEdit(member)}>Reset login</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!filteredStaff.length && <tr><td className="text-center text-muted py-4" colSpan="6">No staff records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

      </main>
      {showModal && (
        <AdminModal title={mode === "create" ? "Set login" : "Reset login"} onClose={() => setShowModal(false)}>
          <form onSubmit={submit} noValidate>
            <div className="modal-body">
              {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label required" htmlFor="credential_staff">Staff member</label>
                  <select id="credential_staff" className="form-select" required disabled={Boolean(staffId && mode === "edit")} value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                    <option value="">Choose…</option>
                    {(mode === "create" ? eligibleStaff : staff.filter((member) => member.user)).map((member) => (
                      <option value={member.id} key={member.id}>{formatId("STF", member.id)} — {member.full_name} ({member.role})</option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label required" htmlFor="credential_username">Username</label>
                  <input id="credential_username" className="form-control" autoComplete="off" required minLength="4" maxLength="20" pattern="[A-Za-z0-9._]{4,20}" title="Use 4-20 letters, numbers, . or _." value={username} onChange={(event) => setUsername(event.target.value)} />
                  <div className="form-text">4-20 characters: letters, numbers, . and _.</div>
                </div>
                <div className="col-md-6">
                  <label
                    className="form-label required"
                    htmlFor="credential_password"
                  >
                    {mode === "create" ? "Password" : "New password"}
                  </label>

                  <div className="input-group">
                    <input
                      id="credential_password"
                      className="form-control"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength="8"
                      pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}"
                      title="Use 8+ characters with a letter and number."
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />

                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div className="col-md-6">
                  <label className="form-label required" htmlFor="credential_confirm">
                    Confirm password
                  </label>

                  <div className="input-group">
                    <input
                      id="credential_confirm"
                      className="form-control"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength="8"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />

                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div className="col-12"><div className="form-text">At least 8 characters, with at least one letter and one number.</div></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : mode === "create" ? "Save login" : "Reset login"}</button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  );
}

export default Credentials;
