import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage, formatDate, formatId, formatMoney } from "../../admin/services/api";
import DoctorNavbar from "../components/DoctorNavbar";
import {
  completeConsultation,
  getConsultation,
  getLabTests,
  getMedicines,
  saveDraftConsultation,
  startConsultation,
} from "../services/doctorApi";

function DoctorConsultation() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tokenIdParam = searchParams.get("tokenId");
  const navigate = useNavigate();

  const [consultation, setConsultation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Form states
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState(new Set());

  // Master lists for selection
  const [availableMedicines, setAvailableMedicines] = useState([]);
  const [availableLabTests, setAvailableLabTests] = useState([]);

  // Add medicine modal state
  const [showMedModal, setShowMedModal] = useState(false);
  const [medSearch, setMedSearch] = useState("");
  const [selectedMedId, setSelectedMedId] = useState("");
  const [medQty, setMedQty] = useState(1);
  const [medInstructions, setMedInstructions] = useState("");
  const [medModalError, setMedModalError] = useState("");

  const slipRef = useRef(null);

  const loadData = useCallback(async (consId) => {
    setLoading(true);
    setError("");
    try {
      const [consData, medsData, testsData] = await Promise.all([
        getConsultation(consId),
        getMedicines(),
        getLabTests(),
      ]);

      setConsultation(consData);
      setDiagnosis(consData.diagnosis || "");
      setClinicalNotes(consData.clinical_notes || "");
      setPrescriptionItems(consData.prescription_items || []);
      setSelectedLabTestIds(new Set(consData.lab_test_ids || []));
      setAvailableMedicines(medsData);
      setAvailableLabTests(testsData);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      loadData(id);
    } else if (tokenIdParam) {
      startConsultation(tokenIdParam)
        .then((res) => {
          navigate(`/doctor/consultation/${res.id}`, { replace: true });
        })
        .catch((err) => {
          setError(errorMessage(err));
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [id, tokenIdParam, loadData, navigate]);

  const isCompleted = consultation?.status === "Completed";

  const handleLabToggle = (testId) => {
    if (isCompleted) return;
    setSelectedLabTestIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(testId)) {
        updated.delete(testId);
      } else {
        updated.add(testId);
      }
      return updated;
    });
  };

  const handleOpenMedModal = () => {
    setMedModalError("");
    setSelectedMedId(availableMedicines.length > 0 ? String(availableMedicines[0].id) : "");
    setMedQty(1);
    setMedInstructions("1 tab twice daily after food");
    setShowMedModal(true);
  };

  const handleAddMedicine = (e) => {
    e.preventDefault();
    if (!selectedMedId) {
      setMedModalError("Please select a medicine.");
      return;
    }
    const med = availableMedicines.find((m) => String(m.id) === String(selectedMedId));
    if (!med) {
      setMedModalError("Selected medicine not found.");
      return;
    }
    const qty = parseInt(medQty, 10);
    if (!qty || qty <= 0) {
      setMedModalError("Quantity must be a positive whole number.");
      return;
    }
    if (qty > med.stock_quantity) {
      setMedModalError(`Requested quantity exceeds available stock (${med.stock_quantity}).`);
      return;
    }

    const existingIndex = prescriptionItems.findIndex((p) => p.medicine_id === med.id);
    if (existingIndex >= 0) {
      const updated = [...prescriptionItems];
      updated[existingIndex] = {
        ...updated[existingIndex],
        prescribed_quantity: qty,
        instructions: medInstructions.trim(),
      };
      setPrescriptionItems(updated);
    } else {
      setPrescriptionItems((prev) => [
        ...prev,
        {
          medicine_id: med.id,
          medicine_name: med.name,
          prescribed_quantity: qty,
          instructions: medInstructions.trim(),
          unit_price: med.price,
        },
      ]);
    }

    setShowMedModal(false);
  };

  const handleRemoveMedicine = (index) => {
    if (isCompleted) return;
    setPrescriptionItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        diagnosis: diagnosis.trim(),
        clinical_notes: clinicalNotes.trim(),
        prescription_items: prescriptionItems.map((p) => ({
          medicine_id: p.medicine_id,
          quantity: p.prescribed_quantity,
          instructions: p.instructions || "",
        })),
        lab_test_ids: Array.from(selectedLabTestIds),
      };
      await saveDraftConsultation(id, payload);
      setSuccess("Consultation draft saved successfully.");
      loadData(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!diagnosis.trim() || diagnosis.trim().length < 3) {
      setError("Please enter a valid diagnosis (at least 3 characters).");
      return;
    }
    if (!clinicalNotes.trim() || clinicalNotes.trim().length < 3) {
      setError("Please enter clinical notes (at least 3 characters).");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        diagnosis: diagnosis.trim(),
        clinical_notes: clinicalNotes.trim(),
        prescription_items: prescriptionItems.map((p) => ({
          medicine_id: p.medicine_id,
          quantity: p.prescribed_quantity,
          instructions: p.instructions || "",
        })),
        lab_test_ids: Array.from(selectedLabTestIds),
      };
      await completeConsultation(id, payload);
      setSuccess("Consultation completed successfully. Orders and bills have been forwarded.");
      loadData(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePrintSlip = () => {
    if (!slipRef.current) return;
    const slipHtml = slipRef.current.innerHTML;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Prescription Slip — ${consultation?.patient?.full_name}</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; margin: 2rem; color: #17343b; }
            .header { border-bottom: 2px solid #0f8b8d; padding-bottom: 1rem; margin-bottom: 1.5rem; }
            .clinic-title { font-size: 1.5rem; font-weight: bold; color: #0f8b8d; }
            .clinic-sub { font-size: 0.85rem; color: #6c7c80; }
            .doc-info { margin-top: 0.5rem; font-size: 0.95rem; }
            .patient-box { background: #f6f8f8; border: 1px solid #dce7e7; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem; }
            .patient-grid { display: flex; flex-wrap: wrap; gap: 1rem 2rem; font-size: 0.9rem; }
            .rx-title { font-size: 1.1rem; font-weight: bold; border-bottom: 1px solid #dce7e7; padding-bottom: 0.4rem; margin-bottom: 1rem; color: #0f8b8d; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
            th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #dce7e7; font-size: 0.85rem; color: #51696d; background: #eef4f4; }
            td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #dce7e7; font-size: 0.9rem; }
            .notes { background: #f6f8f8; padding: 0.8rem; border-radius: 4px; font-size: 0.85rem; margin-bottom: 2rem; border-left: 3px solid #0f8b8d; }
            .signature { margin-top: 3rem; text-align: right; }
            .sign-line { display: inline-block; width: 200px; border-top: 1px solid #6c7c80; padding-top: 0.5rem; font-size: 0.9rem; }
            @media print { body { margin: 1rem; } }
          </style>
        </head>
        <body>
          ${slipHtml}
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
      }
    }, 250);
  };

  if (loading) {
    return (
      <>
        <DoctorNavbar />
        <main className="container admin-main">
          <header className="page-header">
            <h1 className="mb-1">Consultation details</h1>
            <p className="mb-0">Loading patient visit record...</p>
          </header>
          <div className="text-muted">Loading ...</div>
        </main>
      </>
    );
  }

  if (!consultation) {
    return (
      <>
        <DoctorNavbar />
        <main className="container admin-main">
          <header className="page-header">
            <h1 className="mb-1">Consultation details</h1>
            <p className="mb-0">Record not found.</p>
          </header>
          <div className="alert alert-danger" role="alert">
            {error || "Could not find the requested consultation."}
          </div>
          <Link to="/doctor/queue" className="btn btn-outline-secondary">
            Back to Queue
          </Link>
        </main>
      </>
    );
  }

  const pat = consultation.patient;
  const doc = consultation.doctor;
  const tok = consultation.token;

  const filteredMeds = availableMedicines.filter((m) => {
    if (!medSearch) return true;
    return (
      m.name.toLowerCase().includes(medSearch.toLowerCase()) ||
      m.manufacturer?.toLowerCase().includes(medSearch.toLowerCase())
    );
  });

  return (
    <>
      <DoctorNavbar />
      <main className="container admin-main">
        {/* Page Header */}
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
          <div>
            <h1 className="mb-1">
              Consultation {formatId("CNS", consultation.id)}
            </h1>
            <p className="mb-0">
              Token #{tok?.token_number} &bull; {tok?.token_type || "Walk-In"}
            </p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            {isCompleted && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={handlePrintSlip}
              >
                Print prescription
              </button>
            )}
            <Link to="/doctor/queue" className="btn btn-outline-secondary">
              Back to Queue
            </Link>
          </div>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" role="status">
            {success}
          </div>
        )}

        {isCompleted && (
          <div className="alert alert-success d-flex align-items-center justify-content-between mb-4">
            <div>
              <strong>Consultation completed.</strong> Closed on{" "}
              {formatDate(consultation.completed_at)}. This record is read-only.
            </div>
          </div>
        )}

        {/* Patient Summary Card — Matches PrescriptionDetails styling */}
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
                <div className="small text-secondary">Phone / Address</div>
                <div className="fw-semibold">{pat?.phone || "—"}</div>
                <div className="small text-muted text-truncate">{pat?.address || "—"}</div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Status</div>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className={`badge text-bg-${isCompleted ? "success" : "info"}`}>
                    {consultation.status}
                  </span>
                  <Link
                    to={`/doctor/patient-history?patient=${pat?.id}`}
                    className="small text-decoration-none"
                  >
                    History &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Layout */}
        <div className="row g-4">
          {/* Left Column: Workspace */}
          <div className="col-lg-8">
            {/* Clinical Notes & Diagnosis */}
            <div className="card mb-4">
              <div className="card-body">
                <h2 className="h5 mb-3">Clinical examination</h2>
                <div className="mb-3">
                  <label htmlFor="diagInput" className="form-label">
                    Diagnosis <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    id="diagInput"
                    className="form-control"
                    placeholder="e.g. Acute Upper Respiratory Tract Infection, Allergic Rhinitis"
                    value={diagnosis}
                    disabled={isCompleted}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="notesInput" className="form-label">
                    Clinical notes & observations <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="notesInput"
                    className="form-control"
                    rows="4"
                    placeholder="Symptoms, physical vitals, complaints, findings, advice..."
                    value={clinicalNotes}
                    disabled={isCompleted}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>

            {/* Prescriptions Section */}
            <div className="card mb-4">
              <div className="card-body pb-0 d-flex justify-content-between align-items-center mb-3">
                <h2 className="h5 mb-0">Prescription medicines</h2>
                {!isCompleted && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleOpenMedModal}
                  >
                    + Add medicine
                  </button>
                )}
              </div>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Instructions</th>
                      <th className="text-center" style={{ width: "90px" }}>Qty</th>
                      {!isCompleted && (
                        <th className="text-end" style={{ width: "70px" }}>Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptionItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={isCompleted ? 3 : 4}
                          className="empty"
                        >
                          No medicines prescribed for this consultation.
                        </td>
                      </tr>
                    ) : (
                      prescriptionItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <div className="fw-semibold text-dark">{item.medicine_name}</div>
                            {item.unit_price && (
                              <div className="small text-muted">
                                Price: {formatMoney(item.unit_price)}
                              </div>
                            )}
                          </td>
                          <td className="text-secondary small">
                            {item.instructions || "—"}
                          </td>
                          <td className="text-center fw-semibold">
                            {item.prescribed_quantity}
                          </td>
                          {!isCompleted && (
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleRemoveMedicine(idx)}
                                title="Remove item"
                              >
                                &times;
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Laboratory Tests Section */}
            <div className="card mb-4">
              <div className="card-body">
                <h2 className="h5 mb-1">Laboratory investigations</h2>
                <p className="text-secondary small mb-3">
                  Select diagnostic tests to recommend. Orders will be forwarded to the laboratory.
                </p>

                {availableLabTests.length === 0 ? (
                  <div className="text-muted small">No active laboratory tests configured.</div>
                ) : (
                  <div className="row g-3">
                    {availableLabTests.map((t) => {
                      const checked = selectedLabTestIds.has(t.id);
                      return (
                        <div key={t.id} className="col-md-6">
                          <div className={`doctor-lab-card ${checked ? "selected" : ""}`}>
                            <div className="form-check">
                              <input
                                className="form-check-input cursor-pointer"
                                type="checkbox"
                                id={`lab_${t.id}`}
                                checked={checked}
                                disabled={isCompleted}
                                onChange={() => handleLabToggle(t.id)}
                              />
                              <label
                                className="form-check-label w-100 cursor-pointer ms-1"
                                htmlFor={`lab_${t.id}`}
                              >
                                <div className="d-flex justify-content-between align-items-center">
                                  <strong className="text-dark">{t.name}</strong>
                                  <span className="badge text-bg-light border">
                                    {formatMoney(t.cost)}
                                  </span>
                                </div>
                                <div
                                  className="text-secondary small mt-1"
                                  style={{ fontSize: "0.8rem" }}
                                >
                                  Norm: {t.normal_values || "Standard"}
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {!isCompleted && (
              <div className="d-flex flex-wrap justify-content-end gap-2 py-2 mb-4">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleSaveDraft}
                  disabled={saving}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-4"
                  onClick={handleComplete}
                  disabled={saving}
                >
                  Complete Consultation
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Sidebar */}
          <div className="col-lg-4">
            {/* Recent Lab Results */}
            <div className="card mb-4">
              <div className="card-body">
                <h2 className="h5 mb-3">Recent lab results</h2>
                {consultation.recent_lab_results?.length === 0 ? (
                  <div className="empty py-3">
                    No laboratory records for this patient.
                  </div>
                ) : (
                  <div>
                    {consultation.recent_lab_results?.map((res, i) => (
                      <div key={i} className="doctor-ref-item">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <strong className="small text-dark">{res.test_name}</strong>
                          <span className="text-secondary" style={{ fontSize: "0.75rem" }}>
                            {formatDate(res.completed_date || res.date)}
                          </span>
                        </div>
                        {res.result ? (
                          <div className="small text-primary fw-semibold">
                            {res.result}{" "}
                            {res.reference_range && (
                              <span className="text-secondary fw-normal">
                                ({res.reference_range})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="small text-warning">
                            <span className="badge text-bg-warning text-dark me-1">
                              {res.status || "Pending"}
                            </span>{" "}
                            No result yet
                          </div>
                        )}
                        {res.remarks && (
                          <div className="small text-muted mt-1" style={{ fontSize: "0.75rem" }}>
                            {res.remarks}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Consultations */}
            <div className="card mb-4">
              <div className="card-body">
                <h2 className="h5 mb-3">Recent consultations</h2>
                {consultation.recent_consultations?.length === 0 ? (
                  <div className="empty py-3">
                    First consultation at clinic.
                  </div>
                ) : (
                  <div>
                    {consultation.recent_consultations?.map((past, i) => (
                      <div key={i} className="doctor-ref-item">
                        <div className="d-flex justify-content-between align-items-center">
                          <strong
                            className="small text-dark text-truncate"
                            style={{ maxWidth: "160px" }}
                          >
                            {past.diagnosis || "Diagnosis pending"}
                          </strong>
                          <span className="text-secondary" style={{ fontSize: "0.75rem" }}>
                            {formatDate(past.completed_at || past.created_at)}
                          </span>
                        </div>
                        <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
                          {past.doctor_name} ({past.department})
                        </div>
                        {past.clinical_notes && (
                          <div
                            className="small text-muted text-truncate mt-1"
                            style={{ fontSize: "0.8rem" }}
                          >
                            {past.clinical_notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Add Medicine */}
        {showMedModal && (
          <div
            className="modal fade show d-block"
            tabIndex="-1"
            style={{ backgroundColor: "rgba(23, 52, 59, 0.4)" }}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Prescribe medicine</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowMedModal(false)}
                  ></button>
                </div>
                <form onSubmit={handleAddMedicine}>
                  <div className="modal-body">
                    {medModalError && (
                      <div className="alert alert-danger py-2 small" role="alert">
                        {medModalError}
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label">
                        Select medicine <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm mb-2"
                        placeholder="Type to filter medicines..."
                        value={medSearch}
                        onChange={(e) => setMedSearch(e.target.value)}
                      />
                      <select
                        className="form-select form-select-sm"
                        value={selectedMedId}
                        onChange={(e) => setSelectedMedId(e.target.value)}
                        size={5}
                      >
                        {filteredMeds.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — In Stock: {m.stock_quantity} ({formatMoney(m.price)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">
                        Quantity <span className="text-danger">*</span>
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="1"
                        value={medQty}
                        onChange={(e) => setMedQty(e.target.value)}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">
                        Instructions / dosage
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. 1 tab twice daily after food for 5 days"
                        value={medInstructions}
                        onChange={(e) => setMedInstructions(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setShowMedModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm">
                      Add to prescription
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Hidden Printable Prescription Slip */}
        <div style={{ display: "none" }}>
          <div ref={slipRef}>
            <div className="header">
              <div className="clinic-title">CareFlow Clinic</div>
              <div className="clinic-sub">Quality Healthcare & Medical Diagnostics</div>
              <div className="doc-info">
                <strong>Dr. {doc?.name || "Practitioner"}</strong> &bull;{" "}
                {doc?.specialization}
                {doc?.license_number && ` &bull; Lic No: ${doc.license_number}`}
              </div>
            </div>

            <div className="patient-box">
              <div className="patient-grid">
                <div>
                  <strong>Patient:</strong> {pat?.full_name} ({formatId("PAT", pat?.id)})
                </div>
                <div>
                  <strong>Age / Gender:</strong> {pat?.age ? `${pat.age} yrs` : "—"} /{" "}
                  {pat?.gender || "—"}
                </div>
                <div>
                  <strong>Date:</strong> {formatDate(consultation?.completed_at || consultation?.created_at)}
                </div>
                <div>
                  <strong>Token:</strong> #{tok?.token_number}
                </div>
              </div>
            </div>

            <div className="rx-title">&#8478; Prescriptions</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Medicine</th>
                  <th style={{ width: "20%" }}>Quantity</th>
                  <th style={{ width: "40%" }}>Instructions</th>
                </tr>
              </thead>
              <tbody>
                {prescriptionItems.length === 0 ? (
                  <tr>
                    <td colSpan="3">No medications prescribed.</td>
                  </tr>
                ) : (
                  prescriptionItems.map((item, i) => (
                    <tr key={i}>
                      <td><strong>{item.medicine_name}</strong></td>
                      <td>{item.prescribed_quantity}</td>
                      <td>{item.instructions || "As directed"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {diagnosis && (
              <div className="notes">
                <strong>Diagnosis:</strong> {diagnosis}
                {clinicalNotes && (
                  <div style={{ marginTop: "0.25rem" }}>
                    <strong>Advice:</strong> {clinicalNotes}
                  </div>
                )}
              </div>
            )}

            <div className="signature">
              <div className="sign-line">
                Dr. {doc?.name || "Doctor"}
                <br />
                <span style={{ fontSize: "0.8rem", color: "#6c7c80" }}>
                  Authorized Signature
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default DoctorConsultation;
