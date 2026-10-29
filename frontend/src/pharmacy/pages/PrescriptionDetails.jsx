import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import ConfirmModal from "../components/ConfirmModal";
import PharmacyNavbar from "../components/PharmacyNavbar";
import {
  badgeColor,
  createBill,
  declinePrescription,
  dispensePrescription,
  getBills,
  getPrescription,
} from "../services/pharmacyApi";

function PrescriptionDetails() {
  const { id } = useParams();
  const [prescription, setPrescription] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Per-item input states for bill creation keyed by item.id
  const [billQuantities, setBillQuantities] = useState({});

  // Confirmation modal state: "bill" | "dispense" | "decline" | null
  const [activeModal, setActiveModal] = useState(null);

  // Ref for the printable instruction slip
  const slipRef = useRef(null);

  const reloadData = () => {
    Promise.all([getPrescription(id), getBills({ prescription: id })])
      .then(([presData, billsData]) => {
        setPrescription(presData);
        setBills(billsData);
      })
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([getPrescription(id), getBills({ prescription: id })])
      .then(([presData, billsData]) => {
        if (!isMounted) return;
        setPrescription(presData);
        setBills(billsData);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(errorMessage(err));
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleBillQtyChange = (itemId, val) => {
    setBillQuantities((prev) => ({ ...prev, [itemId]: val }));
  };

  // Helper to collect non-zero row quantities for billing
  const getSelectedBillItems = () => {
    if (!prescription?.items) return null;
    const items = [];
    for (const item of prescription.items) {
      const qty = Number(billQuantities[item.id]);
      if (qty > 0) {
        items.push({ item_id: item.id, quantity: qty, name: item.medicine_name });
      }
    }
    return items.length > 0 ? items : null;
  };

  const handleConfirmBill = async () => {
    setActionLoading(true);
    setModalError("");
    setError("");
    setSuccess("");
    try {
      const selected = getSelectedBillItems();
      const payloadItems = selected
        ? selected.map(({ item_id, quantity }) => ({ item_id, quantity }))
        : undefined;
      const newBill = await createBill(id, payloadItems);
      setSuccess(`Bill ${formatId("BILL", newBill.id)} created successfully.`);
      setActiveModal(null);
      setBillQuantities({});
      reloadData();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDispense = async () => {
    setActionLoading(true);
    setModalError("");
    setError("");
    setSuccess("");
    try {
      await dispensePrescription(id);
      setSuccess("Ready medicines dispensed and stock deducted successfully.");
      setActiveModal(null);
      reloadData();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDecline = async () => {
    setActionLoading(true);
    setModalError("");
    setError("");
    setSuccess("");
    try {
      await declinePrescription(id);
      setSuccess("Prescription declined.");
      setActiveModal(null);
      reloadData();
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  // Print Instruction Slip — uses a hidden iframe so about:blank never opens or stays open
  const handlePrintInstructions = () => {
    if (!prescription) return;
    const slipHtml = slipRef.current?.innerHTML || "";
    
    // Create an invisible iframe
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
          <title>Prescription Instructions — ${formatId("RX", prescription.id)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 2rem; color: #222; }
            h2 { color: #0f8b8d; margin-bottom: 0.25rem; }
            .subtitle { color: #6c7c80; font-size: 0.9rem; margin-bottom: 1.5rem; }
            .meta { display: flex; gap: 2rem; margin-bottom: 1.5rem; font-size: 0.9rem; }
            .meta div span { font-weight: 600; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th { background: #0f8b8d; color: #fff; padding: 0.5rem 0.75rem; text-align: left; }
            td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #ddd; }
            tr:last-child td { border-bottom: none; }
            .footer { margin-top: 2rem; font-size: 0.8rem; color: #6c7c80; text-align: center; border-top: 1px solid #ddd; padding-top: 1rem; }
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
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1000);
      }
    }, 250);
  };

  if (loading) {
    return (
      <>
        <PharmacyNavbar />
        <main className="container admin-main">
          <header className="page-header">
            <h1 className="mb-1">Prescription details</h1>
            <p className="mb-0">Loading prescription record...</p>
          </header>
          <div className="text-muted">Loading ...</div>
        </main>
      </>
    );
  }

  if (!prescription) {
    return (
      <>
        <PharmacyNavbar />
        <main className="container admin-main">
          <header className="page-header">
            <h1 className="mb-1">Prescription details</h1>
            <p className="mb-0">Prescription not found.</p>
          </header>
          <div className="alert alert-danger" role="alert">
            {error || "Could not find the requested prescription."}
          </div>
          <Link to="/pharmacy/prescriptions" className="btn btn-outline-secondary">
            Back to Prescriptions
          </Link>
        </main>
      </>
    );
  }

  const isTerminal =
    prescription.status === "Dispensed" || prescription.status === "Declined";
  const isPartial = prescription.status === "Partially Dispensed";
  const isPending = prescription.status === "Pending";
  const hasUnpaidBills = bills.some((b) => b.payment_status === "Pending");

  // Can decline if Pending or Partially Dispensed and no unpaid bills exist
  const canDecline = (isPending || isPartial) && !hasUnpaidBills;

  // Pharmacy can bill any active in-stock items
  const canBill = prescription.items?.some(
    (i) => i.stock_quantity > 0 && i.medicine_is_active && i.stock_state !== "Expired"
  );

  // Ready to dispense if any item has been paid for and is in stock
  const hasDispensable = prescription.items?.some(
    (i) => i.dispensable_quantity > 0 && i.stock_quantity > 0
  );

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <h1 className="mb-1">Prescription {formatId("RX", prescription.id)}</h1>
            <p className="mb-0">Review prescription lines, bill, and dispense.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handlePrintInstructions}
              title="Print patient instruction slip"
            >
              Print instructions
            </button>
            <Link to="/pharmacy/prescriptions" className="btn btn-outline-secondary">
              Back to Prescriptions
            </Link>
          </div>
        </header>

        {error && !activeModal && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" role="status">
            {success}
          </div>
        )}

        {/* Prescription summary card */}
        <div className="card mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Patient</div>
                <div className="fw-semibold">
                  {prescription.patient_name || formatId("PAT", prescription.patient)}
                </div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Doctor</div>
                <div className="fw-semibold">{prescription.doctor_name || "—"}</div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Prescription Date</div>
                <div className="fw-semibold">{formatDate(prescription.date)}</div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Status</div>
                <div>
                  <span className={`badge text-bg-${badgeColor(prescription.status)}`}>
                    {prescription.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prescription items table */}
        <div className="card mb-4">
          <div className="card-body pb-0">
            <h2 className="h5 mb-3">Prescription Items</h2>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Instructions</th>
                  <th className="text-end">Price</th>
                  <th className="text-center">Prescribed</th>
                  <th className="text-center">Dispensed</th>
                  <th className="text-center">Remaining</th>
                  <th className="text-center">Billed</th>
                  <th className="text-center">Paid</th>
                  <th className="text-center">Ready</th>
                  <th className="text-center">In stock</th>
                  <th>Stock state</th>
                  {!isTerminal && (
                    <th style={{ width: "120px" }}>Bill qty</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {prescription.items?.map((item) => {
                  const unbilled = item.prescribed_quantity - item.billed_quantity;
                  const isExpired = item.stock_state === "Expired";
                  const isOutOfStock =
                    item.stock_state === "Out of stock" || item.stock_quantity === 0;
                  const isInactive = !item.medicine_is_active;

                  const warnings = [];
                  if (isInactive) warnings.push("Medicine is inactive.");
                  if (isExpired) warnings.push("Medicine is expired.");
                  if (isOutOfStock) warnings.push("Medicine is out of stock.");
                  if (!isOutOfStock && unbilled > 0 && item.stock_quantity < unbilled) {
                    warnings.push("Stock is less than remaining unbilled quantity.");
                  }
                  if (item.billed_quantity > item.paid_quantity) {
                    warnings.push("Unpaid bill exists; payment required before dispensing.");
                  }
                  if (item.dispensable_quantity > item.stock_quantity) {
                    warnings.push("Stock is less than paid quantity. Restock needed.");
                  }

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="fw-semibold">{item.medicine_name}</div>
                        {warnings.length > 0 && (
                          <div className="small text-danger mt-1">
                            {warnings.join(" ")}
                          </div>
                        )}
                      </td>
                      <td className="small text-secondary">{item.instructions || "—"}</td>
                      <td className="text-end">{formatMoney(item.unit_price)}</td>
                      <td className="text-center">{item.prescribed_quantity}</td>
                      <td className="text-center">{item.dispensed_quantity}</td>
                      <td className="text-center fw-semibold">
                        {Math.max(0, item.remaining_quantity)}
                      </td>
                      <td className="text-center">{item.billed_quantity}</td>
                      <td className="text-center">{item.paid_quantity}</td>
                      <td className="text-center text-primary fw-semibold">
                        {item.dispensable_quantity}
                      </td>
                      <td className="text-center">{item.stock_quantity}</td>
                      <td>
                        <span
                          className={`badge text-bg-${badgeColor(item.stock_state)}`}
                        >
                          {item.stock_state}
                        </span>
                      </td>
                      {!isTerminal && (
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            min="0"
                            max={item.stock_quantity}
                            step="1"
                            placeholder={
                              item.stock_quantity > 0
                                ? `Stock: ${item.stock_quantity}`
                                : "0"
                            }
                            disabled={
                              item.stock_quantity <= 0 || isExpired || isInactive
                            }
                            value={billQuantities[item.id] ?? ""}
                            onChange={(e) =>
                              handleBillQtyChange(item.id, e.target.value)
                            }
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isTerminal && (
            <div className="card-footer bg-transparent d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canBill}
                  onClick={() => {
                    setModalError("");
                    setActiveModal("bill");
                  }}
                >
                  Create bill
                </button>
                {hasDispensable && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      setModalError("");
                      setActiveModal("dispense");
                    }}
                  >
                    Dispense ready medicines
                  </button>
                )}
              </div>
              {canDecline && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => {
                    setModalError("");
                    setActiveModal("decline");
                  }}
                >
                  {isPartial ? "Cancel remaining prescription" : "Decline prescription"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bills for this prescription */}
        <section className="card">
          <div className="card-body pb-0">
            <h2 className="h5 mb-3">Bills for this prescription</h2>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Payment Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {bills.length > 0 ? (
                  bills.map((b) => (
                    <tr key={b.id}>
                      <td className="fw-semibold">{formatId("BILL", b.id)}</td>
                      <td>{formatDate(b.created_at)}</td>
                      <td>{formatMoney(b.total)}</td>
                      <td>
                        <span
                          className={`badge text-bg-${badgeColor(b.payment_status)}`}
                        >
                          {b.payment_status}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        <Link
                          to={`/pharmacy/bills/${b.id}`}
                          className="btn btn-sm btn-outline-primary"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty" colSpan="5">
                      No bills have been created for this prescription yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Hidden printable instruction slip — rendered into a ref, printed via hidden iframe */}
      <div style={{ display: "none" }}>
        <div ref={slipRef}>
          <h2>✚ CareFlow Clinic</h2>
          <div className="subtitle">Prescription Instruction Slip</div>
          <div className="meta">
            <div>
              <span>Prescription: </span>
              {formatId("RX", prescription?.id)}
            </div>
            <div>
              <span>Date: </span>
              {formatDate(prescription?.date)}
            </div>
            <div>
              <span>Patient: </span>
              {prescription?.patient_name}
            </div>
            <div>
              <span>Doctor: </span>
              {prescription?.doctor_name}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Qty</th>
                <th>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {(prescription?.items || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.medicine_name}</td>
                  <td>{item.prescribed_quantity}</td>
                  <td>{item.instructions || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="footer">CareFlow Health Management System</div>
        </div>
      </div>

      {/* Confirmation Modals */}
      {activeModal === "bill" && (
        <ConfirmModal
          title="Create pharmacy bill"
          confirmText="Create bill"
          confirmVariant="primary"
          onConfirm={handleConfirmBill}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          {getSelectedBillItems() ? (
            <div>
              <p>Create a bill for the specified quantities:</p>
              <ul>
                {getSelectedBillItems().map((it) => (
                  <li key={it.item_id}>
                    {it.name}: <strong>{it.quantity}</strong> units
                  </li>
                ))}
              </ul>
              <div className="small text-secondary">
                Totals and line amounts are calculated by the server from active catalog prices.
              </div>
            </div>
          ) : (
            <div>
              <p>
                No specific quantities entered. This will bill remaining unbilled quantities
                for active in-stock items on this prescription.
              </p>
              <div className="small text-secondary">Totals are calculated by the server.</div>
            </div>
          )}
        </ConfirmModal>
      )}

      {activeModal === "dispense" && (
        <ConfirmModal
          title="Dispense ready medicines"
          confirmText="Dispense"
          confirmVariant="success"
          onConfirm={handleConfirmDispense}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          <p className="mb-2">
            Dispense all ready medicines that have been paid for?
          </p>
          <div className="small text-secondary">
            Medicine inventory will be decremented accordingly.
          </div>
        </ConfirmModal>
      )}

      {activeModal === "decline" && (
        <ConfirmModal
          title={isPartial ? "Cancel remaining prescription" : "Decline prescription"}
          confirmText={isPartial ? "Cancel prescription" : "Decline prescription"}
          confirmVariant="danger"
          onConfirm={handleConfirmDecline}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          {isPartial ? (
            <div>
              <p className="fw-semibold text-danger">
                Are you sure you want to cancel the remaining items for prescription {formatId("RX", prescription.id)}?
              </p>
              <ul className="small text-secondary mb-3">
                <li>Previously dispensed medicines and inventory stock will remain unchanged.</li>
                <li>Existing paid bills and payment receipts are preserved.</li>
                <li>The prescription status will become <strong>Declined</strong> and no further billing or dispensing will be permitted.</li>
              </ul>
            </div>
          ) : (
            <p className="mb-0">
              Decline prescription {formatId("RX", prescription.id)}? Once declined, this
              prescription cannot be billed or dispensed.
            </p>
          )}
        </ConfirmModal>
      )}
    </>
  );
}

export default PrescriptionDetails;
