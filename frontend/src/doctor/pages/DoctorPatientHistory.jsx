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
      <main className="container admin-main">
        <header className="page-header mb-4">
          <h1 className="mb-1">Patient medical history</h1>
          <p className="mb-0">
            Comprehensive longitudinal record of patient visits, prescriptions, and laboratory diagnostics.
          </p>
        </header>

        {/* Patient Search Section */}
        <div className="card mb-4 position-relative">
          <div className="card-body">
            <label className="form-label">
              Search patient by name or phone
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
                      {p.gender} &bull; {p.age ? `${p.age} yrs` : "—"} &bull; Phone: {p.phone || "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-muted py-4">
            Loading patient history...
          </div>
        )}

        {!loading && !patientData && !selectedPatientId && (
          <div className="card mb-4">
            <div className="card-body empty py-5">
              <h5 className="text-dark">No patient selected</h5>
              <p className="small mb-0 text-muted">
                Use the search bar above to look up a patient and view their complete medical history.
              </p>
            </div>
          </div>
        )}

        {!loading && patientData && (
          <>
            {/* Patient Demographics Summary Card */}
            <div className="card mb-4">
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-3 col-6">
                    <div className="small text-secondary">Patient</div>
                    <div className="fw-semibold">{pat?.full_name}</div>
                    <div className="small text-muted">{formatId("PAT", pat?.id)}</div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div className="small text-secondary">Age / Gender</div>
                    <div className="fw-semibold">
                      {pat?.age ? `${pat.age} yrs` : "—"} &bull; {pat?.gender}
                    </div>
                    <div className="small text-muted">Blood: {pat?.blood_group || "—"}</div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div className="small text-secondary">Contact details</div>
                    <div className="fw-semibold">{pat?.phone || "—"}</div>
                    <div className="small text-muted text-truncate">{pat?.email || pat?.address || "—"}</div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div className="small text-secondary">Emergency contact</div>
                    <div className="fw-semibold">
                      {pat?.emergency_contact_name || "—"}
                    </div>
                    <div className="small text-muted">
                      {pat?.emergency_contact_phone || ""}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <ul className="nav doctor-tabs mb-4">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === "consultations" ? "active" : ""}`}
                  onClick={() => setActiveTab("consultations")}
                >
                  Consultations ({patientData.consultations?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === "prescriptions" ? "active" : ""}`}
                  onClick={() => setActiveTab("prescriptions")}
                >
                  Prescriptions ({patientData.prescriptions?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === "lab" ? "active" : ""}`}
                  onClick={() => setActiveTab("lab")}
                >
                  Laboratory Tests & Diagnostic Results ({patientData.lab_records?.length || 0})
                </button>
              </li>
            </ul>

            {/* Tab 1: Consultations */}
            {activeTab === "consultations" && (
              <div className="card mb-4">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
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
                          <td colSpan="5" className="empty">
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
              <div className="d-flex flex-column gap-3 mb-4">
                {patientData.prescriptions?.length === 0 ? (
                  <div className="card mb-4">
                    <div className="card-body empty">
                      No prescriptions found for this patient.
                    </div>
                  </div>
                ) : (
                  patientData.prescriptions?.map((rx) => (
                    <div key={rx.id} className="card">
                      <div className="card-body pb-0 d-flex justify-content-between align-items-center mb-2">
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
                          <thead>
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
              <div className="card mb-4">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
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
                          <td colSpan="8" className="empty">
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
