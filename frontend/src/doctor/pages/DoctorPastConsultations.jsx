import { useCallback, useEffect, useState } from "react";
import { errorMessage, formatDate, formatId } from "../../admin/services/api";
import DoctorNavbar from "../components/DoctorNavbar";
import { getConsultation, getPastConsultations } from "../services/doctorApi";

function DoctorPastConsultations() {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // Details Modal
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  const loadConsultations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (selectedDate) params.date = selectedDate;
      if (searchTerm) params.search = searchTerm;
      const data = await getPastConsultations(params);
      setConsultations(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadConsultations();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadConsultations]);

  const handleOpenDetails = async (id) => {
    setModalLoading(true);
    setModalError("");
    setSelectedConsultation(null);
    try {
      const data = await getConsultation(id);
      setSelectedConsultation(data);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setModalLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedDate("");
  };

  return (
    <>
      <DoctorNavbar />
      <main className="container admin-main">
        <header className="page-header mb-4">
          <h1 className="mb-1">Past consultations</h1>
          <p className="mb-0">
            Review completed patient consultations, prescribed medications, and laboratory diagnostic findings.
          </p>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {/* Filters Card */}
        <div className="card mb-4">
          <div className="card-body">
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label">
                  Search patient or diagnosis
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Patient name, phone, diagnosis..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">
                  Consultation date
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="col-md-3 d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm flex-grow-1"
                  onClick={handleResetFilters}
                >
                  Reset filters
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Consultations Table */}
        <div className="card mb-4">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: "130px" }}>Date</th>
                  <th style={{ width: "90px" }}>Token</th>
                  <th>Patient Details</th>
                  <th>Diagnosis & Advice</th>
                  <th>Prescriptions</th>
                  <th>Lab Orders</th>
                  <th>Status</th>
                  <th className="text-end" style={{ width: "120px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="text-center py-4 text-secondary">
                      Loading consultation records...
                    </td>
                  </tr>
                ) : consultations.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty">
                      No consultations found matching criteria.
                    </td>
                  </tr>
                ) : (
                  consultations.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{formatDate(c.completed_at || c.created_at)}</strong>
                      </td>
                      <td>
                        <span className="badge text-bg-primary">#{c.token_number}</span>
                      </td>
                      <td>
                        <div className="fw-semibold text-dark">{c.patient_name}</div>
                        <div className="small text-secondary">
                          {c.patient_gender || "—"} &bull; {c.patient_age ? `${c.patient_age} yrs` : "—"} &bull; {c.patient_phone || "—"}
                        </div>
                      </td>
                      <td>
                        <div
                          className="fw-semibold text-dark text-truncate"
                          style={{ maxWidth: "220px" }}
                          title={c.diagnosis}
                        >
                          {c.diagnosis || "—"}
                        </div>
                        <div
                          className="small text-muted text-truncate"
                          style={{ maxWidth: "220px" }}
                          title={c.clinical_notes}
                        >
                          {c.clinical_notes || ""}
                        </div>
                      </td>
                      <td>
                        {c.prescription_items_count > 0 ? (
                          <span className="badge text-bg-light border text-primary">
                            {c.prescription_items_count} med(s)
                          </span>
                        ) : (
                          <span className="text-secondary small">None</span>
                        )}
                      </td>
                      <td>
                        {c.lab_tests_count > 0 ? (
                          <span className="badge text-bg-light border text-info">
                            {c.lab_tests_count} test(s)
                          </span>
                        ) : (
                          <span className="text-secondary small">None</span>
                        )}
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
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleOpenDetails(c.id)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Consultation Details Modal */}
        {(selectedConsultation || modalLoading || modalError) && (
          <div
            className="modal fade show d-block"
            tabIndex="-1"
            style={{ backgroundColor: "rgba(23, 52, 59, 0.4)" }}
          >
            <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Consultation details &mdash;{" "}
                    {selectedConsultation && formatId("CNS", selectedConsultation.id)}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setSelectedConsultation(null);
                      setModalError("");
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  {modalLoading && (
                    <div className="text-center py-4 text-muted">
                      Loading consultation records...
                    </div>
                  )}

                  {modalError && (
                    <div className="alert alert-danger" role="alert">
                      {modalError}
                    </div>
                  )}

                  {selectedConsultation && (
                    <div>
                      {/* Patient Summary Card */}
                      <div className="card mb-3 bg-light border">
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <h6 className="fw-bold mb-1 text-dark">
                                {selectedConsultation.patient?.full_name}
                              </h6>
                              <div className="small text-secondary">
                                {formatId("PAT", selectedConsultation.patient?.id)} &bull;{" "}
                                {selectedConsultation.patient?.gender} &bull;{" "}
                                {selectedConsultation.patient?.age
                                  ? `${selectedConsultation.patient.age} yrs`
                                  : "—"}{" "}
                                &bull; Phone: {selectedConsultation.patient?.phone || "—"}
                              </div>
                            </div>
                            <span className="badge text-bg-primary fs-6">
                              Token #{selectedConsultation.token?.token_number}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Clinical Examination */}
                      <div className="mb-4">
                        <h6 className="fw-bold text-dark border-bottom pb-2">
                          Clinical findings & diagnosis
                        </h6>
                        <div className="mb-2">
                          <strong>Diagnosis:</strong>{" "}
                          <span className="text-dark">
                            {selectedConsultation.diagnosis || "No diagnosis recorded"}
                          </span>
                        </div>
                        <div>
                          <strong>Clinical notes & advice:</strong>
                          <p className="text-secondary small mb-0 mt-1" style={{ whiteSpace: "pre-wrap" }}>
                            {selectedConsultation.clinical_notes || "No clinical notes."}
                          </p>
                        </div>
                      </div>

                      {/* Prescriptions */}
                      <div className="mb-4">
                        <h6 className="fw-bold text-dark border-bottom pb-2">
                          Prescribed medications
                        </h6>
                        {selectedConsultation.prescription_items?.length === 0 ? (
                          <div className="text-secondary small">No medications prescribed.</div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-sm table-bordered align-middle">
                              <thead>
                                <tr>
                                  <th>Medicine</th>
                                  <th>Instructions</th>
                                  <th className="text-center">Prescribed</th>
                                  <th className="text-center">Dispensed</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedConsultation.prescription_items?.map((rx, idx) => (
                                  <tr key={idx}>
                                    <td className="fw-semibold">{rx.medicine_name}</td>
                                    <td className="small text-secondary">
                                      {rx.instructions || "—"}
                                    </td>
                                    <td className="text-center">{rx.prescribed_quantity}</td>
                                    <td className="text-center">{rx.dispensed_quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Associated Laboratory Results */}
                      <div>
                        <h6 className="fw-bold text-dark border-bottom pb-2">
                          Associated laboratory results
                        </h6>
                        {selectedConsultation.recent_lab_results?.length === 0 ? (
                          <div className="text-secondary small">
                            No laboratory tests ordered for this consultation.
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-sm table-hover align-middle">
                              <thead>
                                <tr>
                                  <th>Test Name</th>
                                  <th>Date</th>
                                  <th>Status</th>
                                  <th>Result Value</th>
                                  <th>Reference Range</th>
                                  <th>Remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedConsultation.recent_lab_results?.map((lab, idx) => (
                                  <tr key={idx}>
                                    <td className="fw-semibold">{lab.test_name}</td>
                                    <td className="small text-secondary">
                                      {formatDate(lab.completed_date || lab.date)}
                                    </td>
                                    <td>
                                      <span
                                        className={`badge ${
                                          lab.status === "Completed"
                                            ? "text-bg-success"
                                            : lab.status === "In Progress"
                                            ? "text-bg-info"
                                            : "text-bg-warning text-dark"
                                        }`}
                                      >
                                        {lab.status}
                                      </span>
                                    </td>
                                    <td className="fw-semibold text-primary">
                                      {lab.result || (
                                        <span className="text-secondary fw-normal fst-italic">
                                          Pending
                                        </span>
                                      )}
                                    </td>
                                    <td className="small text-secondary">
                                      {lab.reference_range || "—"}
                                    </td>
                                    <td className="small text-muted">{lab.remarks || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => {
                      setSelectedConsultation(null);
                      setModalError("");
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default DoctorPastConsultations;
