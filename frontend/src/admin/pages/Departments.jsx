import { useEffect, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { collection, errorMessage, formatId, validateForm } from "../services/api";

const emptyForm = { name: "", description: "" };

function Departments() {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDepartments = async () => {
    try {
      const { data } = await api.get("departments/");
      setDepartments(collection(data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  useEffect(() => {
    api.get("departments/")
      .then(({ data }) => setDepartments(collection(data)))
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const editDepartment = (department) => {
    setEditId(department.id);
    setForm({
      name: department.name,
      description: department.description || "",
    });
    setShowForm(true);
  };

  const saveDepartment = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    const name = form.name.trim();
    if (name.length < 2) {
      setError("Department: Enter 2+ characters.");
      return;
    }
    if (departments.some((department) =>
      department.name.toLowerCase() === name.toLowerCase() && department.id !== editId
    )) {
      setError("Department already exists.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, name, description: form.description.trim() };
      if (editId) {
        await api.patch(`departments/${editId}/`, payload);
      } else {
        await api.post("departments/", payload);
      }
      closeForm();
      await loadDepartments();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const deleteDepartment = async () => {
    if (!pendingDelete) return;
    setError("");
    setSaving(true);
    try {
      await api.delete(`departments/${pendingDelete.id}/`);
      setPendingDelete(null);
      await loadDepartments();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const filtered = departments.filter((department) =>
    `${formatId("DEP", department.id)} ${department.id} ${department.name} ${department.description || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <h1 className="mb-1">Departments</h1>
            <p className="mb-0">Manage clinic departments used by doctor profiles.</p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setEditId(null);
              setShowForm(true);
            }}
          >
            Add department
          </button>
        </header>
        {error && !showForm && !pendingDelete && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1">
            <span className="input-group-text">Search</span>
            <input
              className="form-control"
              type="search"
              placeholder="Department name or ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr><th>Department ID</th><th>Department</th><th>Description</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((department) => (
                  <tr key={department.id}>
                    <td>{formatId("DEP", department.id)}</td>
                    <td>{department.name}</td>
                    <td>{department.description || "—"}</td>
                    <td className="text-end text-nowrap">
                      <button
                        className="btn btn-sm btn-outline-primary me-1"
                        type="button"
                        onClick={() => editDepartment(department)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        type="button"
                        onClick={() => setPendingDelete(department)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td className="empty" colSpan="4">
                      {departments.length
                        ? "No matching departments."
                        : "No departments yet. Use “Add department” to create the first one."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      {showForm && (
        <AdminModal
          title={editId ? "Edit department" : "Add department"}
          onClose={closeForm}
        >
          <form onSubmit={saveDepartment} noValidate>
            <div className="modal-body">
              {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="mb-3">
                <label className="form-label required" htmlFor="department_name">Department name</label>
                <input
                  id="department_name"
                  className="form-control"
                  required
                  minLength="2"
                  maxLength="100"
                  pattern=".*\S.*"
                  title="Enter 2-100 characters."
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="department_description">Description</label>
                <textarea
                  id="department_description"
                  className="form-control"
                  rows="3"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-secondary" type="button" onClick={closeForm}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save department"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
      {pendingDelete && (
        <AdminModal title="Delete department" onClose={() => setPendingDelete(null)}>
          <div className="modal-body">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            Delete {pendingDelete.name}? Doctor profiles using this department will no longer have a department assigned.
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={() => setPendingDelete(null)}>Cancel</button>
            <button className="btn btn-danger" type="button" disabled={saving} onClick={deleteDepartment}>
              {saving ? "Deleting..." : "Delete department"}
            </button>
          </div>
        </AdminModal>
      )}
    </>
  );
}

export default Departments;
