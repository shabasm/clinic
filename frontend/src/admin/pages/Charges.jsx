import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNavbar from "../components/AdminNavbar";
import api, { collection, errorMessage, formatMoney, validateForm } from "../services/api";

function Charges() {
  const [settingsId, setSettingsId] = useState(null);
  const [form, setForm] = useState({ registration_fee: "", low_stock_threshold: "" });
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("settings/"),
      api.get("doctors/"),
      api.get("staff/"),
    ]).then(([settingsResponse, doctorResponse, staffResponse]) => {
      const settings = collection(settingsResponse.data)[0];
      if (settings) {
        setSettingsId(settings.id);
        setForm({
          registration_fee: settings.registration_fee,
          low_stock_threshold: settings.low_stock_threshold,
        });
      }
      setDoctors(collection(doctorResponse.data));
      setStaff(collection(staffResponse.data));
    }).catch((requestError) => {
      setError(errorMessage(requestError));
    });
  }, []);

  const saveSettings = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        registration_fee: Number(form.registration_fee),
        low_stock_threshold: Number(form.low_stock_threshold),
      };
      if (settingsId) {
        await api.patch(`settings/${settingsId}/`, payload);
      } else {
        const { data } = await api.post("settings/", payload);
        setSettingsId(data.id);
      }
      setNotice("Clinic settings saved successfully.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const staffName = (staffId) => staff.find((member) => member.id === staffId)?.full_name || `Staff #${staffId}`;

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Charges</h1>
          <p className="mb-0">Manage clinic fees, medicine prices and lab test prices.</p>
        </header>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <div className="row g-4">
          <div className="col-lg-6">
            <section className="card h-100"><div className="card-body d-flex flex-column">
              <h2 className="h5 mb-3">Registration and stock settings</h2>
              <form onSubmit={saveSettings} noValidate>
                <div className="mb-3">
                  <label className="form-label required" htmlFor="registration_fee">Registration fee (₹)</label>
                  <input id="registration_fee" className="form-control" type="number" min="0" step="0.01" title="Enter an amount with up to 2 decimals." required value={form.registration_fee} onChange={(event) => setForm({ ...form, registration_fee: event.target.value })} />
                  <div className="form-text">Charged once, when a patient registers for the first time.</div>
                </div>
                <div className="mb-4">
                  <label className="form-label required" htmlFor="low_stock_threshold">Low-stock threshold (units)</label>
                  <input id="low_stock_threshold" className="form-control" type="number" min="0" max="10000" step="1" title="Enter a whole number from 0 to 10,000." required value={form.low_stock_threshold} onChange={(event) => setForm({ ...form, low_stock_threshold: event.target.value })} />
                  <div className="form-text">A medicine at or below this quantity is shown as low stock.</div>
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
              </form>
            </div></section>
          </div>
          <div className="col-lg-6">
            <section className="card h-100"><div className="card-body d-flex flex-column">
              <h2 className="h5 mb-3">Consultation fee per doctor</h2>
              <div className="table-responsive">
                <table className="table mb-2">
                  <thead><tr><th>Doctor</th><th>Fee</th></tr></thead>
                  <tbody>
                    {doctors.map((doctor) => <tr key={doctor.id}><td>{staffName(doctor.staff)}</td><td>{doctor.consultation_fee ? formatMoney(doctor.consultation_fee) : <span className="text-secondary">Not set</span>}</td></tr>)}
                    {!doctors.length && <tr><td className="text-muted" colSpan="2">No doctor profiles found.</td></tr>}
                  </tbody>
                </table>
              </div>
              <Link className="btn btn-outline-primary mt-auto" to="/admin/doctors">Manage doctors</Link>
            </div></section>
          </div>
          <div className="col-lg-6">
            <section className="card h-100"><div className="card-body d-flex flex-column">
              <h2 className="h5 mb-2">Medicine prices</h2>
              <p className="text-secondary mb-3">View and update medicine prices in the Medicines page.</p>
              <Link className="btn btn-outline-primary mt-auto align-self-start" to="/admin/medicines">Manage medicines</Link>
            </div></section>
          </div>
          <div className="col-lg-6">
            <section className="card h-100"><div className="card-body d-flex flex-column">
              <h2 className="h5 mb-2">Lab test prices</h2>
              <p className="text-secondary mb-3">View and update lab test prices in the Lab Tests page.</p>
              <Link className="btn btn-outline-primary mt-auto align-self-start" to="/admin/labtests">Manage lab tests</Link>
            </div></section>
          </div>
        </div>
      </main>
    </>
  );
}

export default Charges;
