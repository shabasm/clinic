import { useEffect, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { badgeColor, collection, errorMessage, formatId, formatMoney, validateForm } from "../services/api";

const emptyForm = { name: "", normal_values: "", cost: "", is_active: true };

function LabTests() {
  const [tests, setTests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);

  const loadTests = async () => {
    try {
      const { data } = await api.get("labtests/");
      setTests(collection(data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  useEffect(() => {
    api.get("labtests/")
      .then(({ data }) => setTests(collection(data)))
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);

  const editTest = (test) => {
    setEditId(test.id);
    setForm({ name: test.name, normal_values: test.normal_values || "", cost: test.cost, is_active: test.is_active });
    setShowForm(true);
  };

  const saveTest = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    const testName = form.name.trim();
    if (tests.some((test) => test.name.toLowerCase() === testName.toLowerCase() && test.id !== editId)) {
      setError("Test already exists.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, name: testName, normal_values: form.normal_values.trim(), cost: Number(form.cost) };
      if (editId) await api.patch(`labtests/${editId}/`, payload);
      else await api.post("labtests/", payload);
      setForm(emptyForm);
      setEditId(null);
      setShowForm(false);
      await loadTests();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (test) => {
    setError("");
    try {
      await api.patch(`labtests/${test.id}/`, { is_active: !test.is_active });
      await loadTests();
      setPendingToggle(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const filtered = tests.filter((test) => {
    const text = `${formatId("TST", test.id)} ${test.id} ${test.name} ${test.normal_values}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (!statusFilter || String(test.is_active) === statusFilter);
  });

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div><h1 className="mb-1">Lab tests</h1><p className="mb-0">Manage the test list, normal values and prices.</p></div>
          <button className="btn btn-primary" type="button" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>Add test</button>
        </header>
        {error && !showForm && !pendingToggle && <div className="alert alert-danger" role="alert">{error}</div>}
        {showForm && (
          <AdminModal title={editId ? "Edit lab test" : "Add lab test"} onClose={() => { setForm(emptyForm); setEditId(null); setShowForm(false); }}>
            <form onSubmit={saveTest} noValidate>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label required" htmlFor="test_name">Test name</label><input id="test_name" className="form-control" required minLength="2" maxLength="80" pattern=".*\S.*" title="Enter 2-80 characters." value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="test_cost">Cost (₹)</label><input id="test_cost" className="form-control" type="number" min="0.01" step="0.01" title="Enter a positive amount with up to 2 decimals." required value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></div>
                <div className="col-12"><label className="form-label required" htmlFor="normal_values">Normal values</label><input id="normal_values" className="form-control" required maxLength="200" title="Enter up to 200 characters." value={form.normal_values} onChange={(event) => setForm({ ...form, normal_values: event.target.value })} /><div className="form-text">Used as the default reference range when results are entered.</div></div>
                {editId && <div className="col-12"><div className="form-check"><input id="test_active" className="form-check-input" type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><label className="form-check-label" htmlFor="test_active">Active test</label></div></div>}
              </div>
              </div>
              <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(false); }}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save test"}</button></div>
            </form>
          </AdminModal>
        )}
        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1"><span className="input-group-text">Search</span><input className="form-control" type="search" placeholder="Test name or ID" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="form-select w-auto" aria-label="All statuses" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
        </div>
        <div className="card"><div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead><tr><th>ID</th><th>Test</th><th>Normal values</th><th>Cost</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((test) => <tr key={test.id}><td>{formatId("TST", test.id)}</td><td>{test.name}</td><td>{test.normal_values || "—"}</td><td>{formatMoney(test.cost)}</td><td><span className={`badge text-bg-${badgeColor(test.is_active ? "Active" : "Inactive")}`}>{test.is_active ? "Active" : "Inactive"}</span></td><td className="text-end text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" type="button" onClick={() => editTest(test)}>Edit</button><button className={`btn btn-sm btn-outline-${test.is_active ? "danger" : "success"}`} type="button" onClick={() => test.is_active ? setPendingToggle(test) : toggleActive(test)}>{test.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}
              {!filtered.length && <tr><td className="empty" colSpan="6">{tests.length ? "No matching lab tests." : "No lab tests yet. Use “Add test” to create the first one."}</td></tr>}
            </tbody>
          </table>
        </div></div>
      </main>
      {pendingToggle && (
        <AdminModal title="Deactivate test" onClose={() => setPendingToggle(null)}>
          <div className="modal-body">{error && <div className="alert alert-danger" role="alert">{error}</div>}Deactivate {pendingToggle.name}? Doctors will no longer be able to recommend it.</div>
          <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={() => setPendingToggle(null)}>Cancel</button><button className="btn btn-danger" type="button" onClick={() => toggleActive(pendingToggle)}>Deactivate</button></div>
        </AdminModal>
      )}
    </>
  );
}

export default LabTests;
