import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { errorMessage, formatDate, formatId } from "../../admin/services/api";
import DoctorNavbar from "../components/DoctorNavbar";
import { getPatientHistory, searchPatients } from "../services/doctorApi";

function DoctorPatientHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPatientId = searchParams.get("patient");

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(urlPatientId || "");
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("consultations"); // "consultations" | "prescriptions" | "lab"

  // Live patient search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchPatients(query.trim());
        setSearchResults(results);
      } catch {
        // ignore search error
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadHistory = useCallback(async (pid) => {
    setLoading(true);
    setError("");
    try {
      const data = await getPatientHistory(pid);
      setPatientData(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      loadHistory(selectedPatientId);
    }
  }, [selectedPatientId, loadHistory]);

  const handleSelectPatient = (p) => {
    setSelectedPatientId(p.id);
    setSearchParams({ patient: p.id });
    setQuery("");
    setSearchResults([]);
  };

  const pat = patientData?.patient;

  return (
    <>
      <DoctorNavbar />
      <main className="container-xl admin-main pb-5">
        <header className="page-header mb-4">
          <h1 className="h3 mb-1">Patient Medical History</h1>
          <p className="text-secondary mb-0">
            Comprehensive longitudinal record of patient visits, prescriptions, and laboratory diagnostics.
          </p>
        </header>

        {/* Patient Search Section */}
        <div className="card shadow-sm border-0 mb-4 position-relative">
          <div className="card-body">
            <label className="form-label small fw-semibold text-secondary">
              Search Patient by Name or Phone
            </label>
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Type patient name or mobile number..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setQuery("");
                    setSearchResults([]);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Dropdown Suggestions */}
            {searchResults.length > 0 && (
              <div
                className="list-group position-absolute shadow mt-1 start-0 end-0 mx-3"
                style={{ zIndex: 1050, maxHeight: "250px", overflowY: "auto" }}
              >
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="list-group-item list-group-item-action text-start"
                    onClick={() => handleSelectPatient(p)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="text-dark">{p.full_name}</strong>
                      <span className="badge text-bg-light border">{formatId("PAT", p.id)}</span>
                    </div>
                    <div className="small text-secondary">
                      {p.gender} · {p.age ? `${p.age} yrs` : "—"} · Phone: {p.phone || "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            {error}
            <button type="button" className="btn-close" onClick={() => setError("")}></button>
          </div>
        )}

        {loading && (
          <div className="text-center py-5 text-secondary">
            <div className="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading patient history...
          </div>
        )}

        {!loading && !patientData && !selectedPatientId && (
          <div className="card shadow-sm border-0 text-center py-5 text-secondary">
            <div className="mb-2 fs-1">👤</div>
            <h5 className="text-dark">No patient selected</h5>
            <p className="small mb-0">
              Use the search bar above to look up a patient and view their complete medical history.
            </p>
          </div>
        )}

        {!loading && patientData && (
          <>
            {/* Demographics Card */}
            <div className="card shadow-sm border-0 mb-4 bg-light">
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <h2 className="h4 mb-0 text-dark fw-bold">{pat?.full_name}</h2>
                    <div className="text-secondary small">
                      {formatId("PAT", pat?.id)} · {pat?.gender} ·{" "}
                      {pat?.age ? `${pat.age} yrs` : "—"} · Blood Group: {pat?.blood_group || "—"}
                    </div>
                  </div>
                  <span className="badge text-bg-success px-3 py-2">
                    {pat?.is_active ? "Active Patient" : "Inactive"}
                  </span>
                </div>
                <div className="row g-2 text-secondary small">
                  <div className="col-md-3 col-6">
                    <strong>Phone:</strong> {pat?.phone || "—"}
                  </div>
                  <div className="col-md-3 col-6">
                    <strong>Email:</strong> {pat?.email || "—"}
                  </div>
                  <div className="col-md-3 col-6">
                    <strong>Address:</strong> {pat?.address || "—"}
                  </div>
                  <div className="col-md-3 col-6">
                    <strong>Emergency Contact:</strong>{" "}
                    {pat?.emergency_contact_name
                      ? `${pat.emergency_contact_name} (${pat.emergency_contact_phone || "—"})`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <ul className="nav nav-tabs mb-4">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === "consultations" ? "active fw-bold" : ""}`}
                  onClick={() => setActiveTab("consultations")}
                >
                  Consultations ({patientData.consultations?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === "prescriptions" ? "active fw-bold" : ""}`}
                  onClick={() => setActiveTab("prescriptions")}
                >
                  Prescriptions ({patientData.prescriptions?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === "lab" ? "active fw-bold" : ""}`}
                  onClick={() => setActiveTab("lab")}
                >
                  Laboratory Tests & Diagnostic Results ({patientData.lab_records?.length || 0})
                </button>
              </li>
            </ul>

            {/* Tab 1: Consultations */}
            {activeTab === "consultations" && (
              <div className="card shadow-sm border-0">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "140px" }}>Date</th>
                        <th>Doctor / Department</th>
                        <th>Diagnosis</th>
                        <th>Clinical Notes & Advice</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientData.consultations?.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center py-4 text-secondary">
                            No consultation records found for this patient.
                          </td>
                        </tr>
                      ) : (
                        patientData.consultations?.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{formatDate(c.completed_at || c.created_at)}</strong>
                            </td>
                            <td>
                              <div className="fw-semibold text-dark">{c.doctor_name}</div>
                              <div className="small text-secondary">{c.department}</div>
                            </td>
                            <td>
                              <span className="fw-semibold text-dark">
                                {c.diagnosis || "—"}
                              </span>
                            </td>
                            <td>
                              <span className="small text-secondary" style={{ whiteSpace: "pre-wrap" }}>
                                {c.clinical_notes || "—"}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  c.status === "Completed"
                                    ? "text-bg-success"
                                    : "text-bg-warning text-dark"
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Prescriptions */}
            {activeTab === "prescriptions" && (
              <div className="d-flex flex-column gap-3">
                {patientData.prescriptions?.length === 0 ? (
                  <div className="card shadow-sm border-0 text-center py-4 text-secondary">
                    No prescriptions found for this patient.
                  </div>
                ) : (
                  patientData.prescriptions?.map((rx) => (
                    <div key={rx.id} className="card shadow-sm border-0">
                      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                        <div>
                          <strong>Prescription {formatId("RX", rx.id)}</strong> &bull;{" "}
                          <span className="text-secondary small">{formatDate(rx.date)}</span> &bull;{" "}
                          <span className="small text-secondary">{rx.doctor_name}</span>
                        </div>
                        <span
                          className={`badge ${
                            rx.status === "Dispensed"
                              ? "text-bg-success"
                              : rx.status === "Declined"
                              ? "text-bg-danger"
                              : rx.status === "Partially Dispensed"
                              ? "text-bg-warning text-dark"
                              : "text-bg-info"
                          }`}
                        >
                          {rx.status}
                        </span>
                      </div>
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Medicine Name</th>
                              <th>Instructions</th>
                              <th className="text-center" style={{ width: "120px" }}>
                                Prescribed
                              </th>
                              <th className="text-center" style={{ width: "120px" }}>
                                Dispensed
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rx.items?.map((it, idx) => (
                              <tr key={idx}>
                                <td className="fw-semibold text-dark">{it.medicine_name}</td>
                                <td className="small text-secondary">{it.instructions || "—"}</td>
                                <td className="text-center fw-semibold">
                                  {it.prescribed_quantity}
                                </td>
                                <td className="text-center">{it.dispensed_quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Laboratory Tests & Diagnostic Results */}
            {activeTab === "lab" && (
              <div className="card shadow-sm border-0">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Test Name</th>
                        <th style={{ width: "120px" }}>Order Date</th>
                        <th>Prescribing Doctor</th>
                        <th>Status</th>
                        <th>Result Value</th>
                        <th>Reference Range</th>
                        <th style={{ width: "130px" }}>Completed Date</th>
                        <th>Remarks / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientData.lab_records?.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="text-center py-4 text-secondary">
                            No laboratory test records found for this patient.
                          </td>
                        </tr>
                      ) : (
                        patientData.lab_records?.map((lab) => (
                          <tr key={lab.id}>
                            <td>
                              <strong className="text-dark">{lab.test_name}</strong>
                              <div className="small text-muted">Order #{lab.order_id}</div>
                            </td>
                            <td className="small text-secondary">{formatDate(lab.order_date)}</td>
                            <td className="small text-dark">{lab.doctor_name}</td>
                            <td>
                              <span
                                className={`badge ${
                                  lab.status === "Completed"
                                    ? "text-bg-success"
                                    : lab.status === "In Progress"
                                    ? "text-bg-info"
                                    : lab.status === "Paid"
                                    ? "text-bg-primary"
                                    : "text-bg-warning text-dark"
                                }`}
                              >
                                {lab.status}
                              </span>
                            </td>
                            <td>
                              {lab.result ? (
                                <strong className="text-primary">{lab.result}</strong>
                              ) : (
                                <span className="badge text-bg-light border text-secondary">
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="small text-secondary">
                              {lab.reference_range || "Standard"}
                            </td>
                            <td className="small text-secondary">
                              {lab.completed_date ? formatDate(lab.completed_date) : "—"}
                            </td>
                            <td className="small text-muted">{lab.remarks || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

export default DoctorPatientHistory;
