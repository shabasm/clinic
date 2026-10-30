import { useCallback, useEffect, useState } from "react";
import api, { errorMessage, formatId } from "../admin/services/api";
import RoleNavbar from "../shared/RoleNavbar";

function DoctorDashboard() {
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("doctor/queue/");
      setQueue(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = async (item, action) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`doctor/tokens/${item.id}/${action}/`, notes[item.id] || {});
      setNotice(action === "start" ? `Consultation started for ${item.patient_name}.` : `Consultation completed. Pending consultation bill ${formatId("CB", data.bill_id)} created.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return <>
    <RoleNavbar title="Doctor workspace" />
    <main className="container admin-main">
      <header className="page-header d-flex justify-content-between align-items-end"><div><h1 className="mb-1">Today's queue</h1><p className="mb-0">Patients with an active, paid registration token.</p></div><button className="btn btn-outline-secondary" type="button" onClick={load}>Refresh</button></header>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {queue.length ? <div className="card"><div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Token</th><th>Patient</th><th>Status</th><th>Consultation</th></tr></thead><tbody>{queue.map((item) => <tr key={item.id}><td>{formatId("TK", item.token_number)}</td><td>{item.patient_name}<div className="small text-secondary">Patient {formatId("PT", item.patient_id)}</div></td><td>{item.status}</td><td>{item.consultation_status === "In Progress" ? <div className="d-flex flex-column gap-2"><textarea className="form-control" placeholder="Diagnosis" value={notes[item.id]?.diagnosis || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: { ...current[item.id], diagnosis: event.target.value } }))} /><textarea className="form-control" placeholder="Clinical notes" value={notes[item.id]?.clinical_notes || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: { ...current[item.id], clinical_notes: event.target.value } }))} /><button className="btn btn-primary align-self-start" type="button" disabled={saving} onClick={() => act(item, "complete")}>Complete consultation</button></div> : item.consultation_status === "Completed" ? <span className="text-success">Completed</span> : item.status === "Active" ? <button className="btn btn-primary" type="button" disabled={saving} onClick={() => act(item, "start")}>Start consultation</button> : "Waiting"}</td></tr>)}</tbody></table></div></div> : <div className="empty">No tokens in your queue today.</div>}
    </main>
  </>;
}

export default DoctorDashboard;
