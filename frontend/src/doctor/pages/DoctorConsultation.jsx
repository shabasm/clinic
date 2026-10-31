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
      // Start or resume consultation for token
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
      setMedModalError("Quantity must be a positive integer.");
      return;
    }
    if (qty > med.stock_quantity) {
      setMedModalError(`Requested quantity exceeds available stock (${med.stock_quantity}).`);
      return;
    }

    // Check if already in prescription
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
      setSuccess("Consultation completed successfully. Records and orders have been sent.");
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
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 2rem; color: #1e293b; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1.5rem; }
            .clinic-title { font-size: 1.5rem; font-weight: bold; color: #0284c7; }
            .clinic-sub { font-size: 0.85rem; color: #64748b; }
            .doc-info { margin-top: 0.5rem; font-size: 0.95rem; }
            .patient-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem; }
            .patient-grid { display: flex; flex-wrap: wrap; gap: 1rem 2rem; font-size: 0.9rem; }
            .rx-title { font-size: 1.1rem; font-weight: bold; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.4rem; margin-bottom: 1rem; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
            th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #cbd5e1; font-size: 0.85rem; color: #475569; }
            td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
            .notes { background: #f1f5f9; padding: 0.8rem; border-radius: 4px; font-size: 0.85rem; margin-bottom: 2rem; }
            .signature { margin-top: 3rem; text-align: right; }
            .sign-line { display: inline-block; width: 200px; border-top: 1px solid #475569; padding-top: 0.5rem; font-size: 0.9rem; }
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
        <main className="container-xl admin-main py-5 text-center text-secondary">
          <div className="spinner-border spinner-border-sm me-2" role="status"></div>
          Loading consultation workspace...
        </main>
      </>
    );
  }

  if (!consultation) {
    return (
      <>
        <DoctorNavbar />
        <main className="container-xl admin-main py-5">
          <div className="alert alert-danger" role="alert">
            {error || "Consultation record not found."}
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
      <main className="container-xl admin-main pb-5">
        {/* Header navigation and status */}
        <header className="page-header d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div className="d-flex align-items-center gap-3">
            <Link to="/doctor/queue" className="btn btn-outline-secondary btn-sm">
              &larr; Back to Queue
            </Link>
            <div>
              <h1 className="h3 mb-0">
                Consultation {formatId("CNS", consultation.id)}
              </h1>
              <span className="text-secondary small">
                Token #{tok?.token_number} · {tok?.token_type || "Walk-In"}
              </span>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span
              className={`badge px-3 py-2 fs-6 ${
                isCompleted ? "text-bg-success" : "text-bg-info"
              }`}
            >
              {consultation.status}
            </span>
            {isCompleted && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handlePrintSlip}
              >
                Print Prescription Slip
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            {error}
            <button type="button" className="btn-close" onClick={() => setError("")}></button>
          </div>
        )}
        {success && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            {success}
            <button type="button" className="btn-close" onClick={() => setSuccess("")}></button>
          </div>
        )}

        {isCompleted && (
          <div className="alert alert-success d-flex align-items-center justify-content-between mb-4">
            <div>
              <strong>Consultation Completed.</strong> Completed on{" "}
              {formatDate(consultation.completed_at)}. This record is read-only.
            </div>
          </div>
        )}

        {/* Patient Demographics Card */}
        <div className="card shadow-sm border-0 mb-4 bg-light">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h2 className="h4 mb-0 text-dark fw-bold">{pat?.full_name}</h2>
                <div className="text-secondary small">
                  {formatId("PAT", pat?.id)} · {pat?.gender} ·{" "}
                  {pat?.age ? `${pat.age} yrs` : "—"} · Blood: {pat?.blood_group || "—"}
                </div>
              </div>
              <Link
                to={`/doctor/patient-history?patient=${pat?.id}`}
                className="btn btn-sm btn-outline-primary"
              >
                View Full Patient History &rarr;
              </Link>
            </div>
            <div className="row g-2 text-secondary small">
              <div className="col-md-3 col-6">
                <strong>Phone:</strong> {pat?.phone || "—"}
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
              <div className="col-md-3 col-6">
                <strong>Registered:</strong> {formatDate(pat?.registration_date)}
              </div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Layout: Left = Workspace, Right = Reference History */}
        <div className="row g-4">
          {/* Left Column: Workspace */}
          <div className="col-lg-8">
            {/* Diagnosis & Clinical Notes */}
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3">
                <h3 className="h5 mb-0 fw-bold">Clinical Examination</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label htmlFor="diagInput" className="form-label fw-semibold">
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
                  <label htmlFor="notesInput" className="form-label fw-semibold">
                    Clinical Notes & Observations <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="notesInput"
                    className="form-control"
                    rows="4"
                    placeholder="Symptoms, physical vitals, patient complaints, clinical findings, treatment advice..."
                    value={clinicalNotes}
                    disabled={isCompleted}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>

            {/* Prescriptions Section */}
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                <h3 className="h5 mb-0 fw-bold">Prescription Medicines</h3>
                {!isCompleted && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleOpenMedModal}
                  >
                    + Add Medicine
                  </button>
                )}
              </div>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Medicine Name</th>
                      <th>Instructions / Dosage</th>
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
                          className="text-center py-3 text-secondary"
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
                                Unit Price: {formatMoney(item.unit_price)}
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
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3">
                <h3 className="h5 mb-0 fw-bold">Laboratory Investigations</h3>
                <p className="text-secondary small mb-0">
                  Select diagnostic tests to recommend. Orders will be forwarded to the Laboratory.
                </p>
              </div>
              <div className="card-body">
                {availableLabTests.length === 0 ? (
                  <div className="text-secondary small">No laboratory tests configured.</div>
                ) : (
                  <div className="row g-3">
                    {availableLabTests.map((t) => {
                      const checked = selectedLabTestIds.has(t.id);
                      return (
                        <div key={t.id} className="col-md-6">
                          <div
                            className={`p-3 border rounded h-100 ${
                              checked ? "border-primary bg-primary bg-opacity-10" : "bg-light"
                            }`}
                          >
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`lab_${t.id}`}
                                checked={checked}
                                disabled={isCompleted}
                                onChange={() => handleLabToggle(t.id)}
                              />
                              <label
                                className="form-check-label w-100 cursor-pointer"
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
                                  Normal range: {t.normal_values || "Standard"}
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

            {/* Consultation Action Buttons */}
            {!isCompleted && (
              <div className="d-flex flex-wrap justify-content-end gap-3 py-3 border-top">
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
                  className="btn btn-success px-4"
                  onClick={handleComplete}
                  disabled={saving}
                >
                  Complete Consultation
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Sidebar (Recent Consultations & Recent Lab Results) */}
          <div className="col-lg-4">
            {/* Recent Lab Results Sidebar Box */}
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3">
                <h4 className="h6 mb-0 fw-bold text-dark">Recent Lab Results</h4>
              </div>
              <div className="card-body p-3">
                {consultation.recent_lab_results?.length === 0 ? (
                  <div className="text-secondary small text-center py-3">
                    No laboratory records for this patient.
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {consultation.recent_lab_results?.map((res, i) => (
                      <div key={i} className="list-group-item px-0 py-2 border-bottom">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <strong className="small text-dark">{res.test_name}</strong>
                          <span className="text-secondary" style={{ fontSize: "0.75rem" }}>
                            {formatDate(res.completed_date || res.date)}
                          </span>
                        </div>
                        {res.result ? (
                          <div className="small text-primary fw-semibold">
                            Result: {res.result}{" "}
                            {res.reference_range && (
                              <span className="text-secondary fw-normal">
                                ({res.reference_range})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="small text-warning">
                            <span className="badge text-bg-warning text-dark">
                              {res.status || "Pending"}
                            </span>{" "}
                            No result yet
                          </div>
                        )}
                        {res.remarks && (
                          <div className="small text-muted mt-1" style={{ fontSize: "0.75rem" }}>
                            Notes: {res.remarks}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Consultations Sidebar Box */}
            <div className="card shadow-sm border-0 mb-4">
              <div className="card-header bg-white py-3">
                <h4 className="h6 mb-0 fw-bold text-dark">Recent Consultations</h4>
              </div>
              <div className="card-body p-3">
                {consultation.recent_consultations?.length === 0 ? (
                  <div className="text-secondary small text-center py-3">
                    First consultation at clinic.
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {consultation.recent_consultations?.map((past, i) => (
                      <div key={i} className="list-group-item px-0 py-2 border-bottom">
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
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Prescribe Medicine</h5>
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
                      <label className="form-label small fw-semibold">
                        Search / Select Medicine
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
                            {m.name} — In Stock: {m.stock_quantity} (₹{m.price})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label className="form-label small fw-semibold">Quantity</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min="1"
                        value={medQty}
                        onChange={(e) => setMedQty(e.target.value)}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label small fw-semibold">
                        Instructions / Dosage
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="e.g. 1 tab thrice daily after meals for 5 days"
                        value={medInstructions}
                        onChange={(e) => setMedInstructions(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowMedModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm">
                      Add to Prescription
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
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
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
