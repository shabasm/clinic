import { useEffect, useRef, useState } from "react";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import ConfirmModal from "./ConfirmModal";
import {
  badgeColor,
  declinePrescription,
  dispenseAndPay,
  getPrescription,
} from "../services/pharmacyApi";

function printInstructionSlip(slipElement, rxId) {
  if (!slipElement) return;
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
        <title>Prescription Instructions — ${rxId || ""}</title>
        <style>
          body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 1.5rem; color: #17343b; }
          h2 { font-size: 1.3rem; margin-bottom: 0.25rem; color: #0f8b8d; }
          .subtitle { font-size: 0.9rem; color: #6c7c80; margin-bottom: 1rem; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1.25rem; font-size: 0.9rem; }
          .meta strong { color: #495057; }
          table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.9rem; }
          th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #0f8b8d; }
          td { padding: 0.5rem; border-bottom: 1px solid #dee2e6; }
          .text-center { text-align: center; }
          .footer { margin-top: 2rem; font-size: 0.8rem; color: #6c7c80; text-align: center; border-top: 1px solid #ddd; padding-top: 0.75rem; }
          @media print { body { margin: 1rem; } }
        </style>
      </head>
      <body>
        ${slipElement.innerHTML}
      </body>
    </html>
  `);
  doc.close();

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
  }, 300);
}

const MAX_DISPENSE_LIMIT_PER_MEDICINE = 60;

function getItemDispenseInfo(item) {
  const stock = Number(item.stock_quantity) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const dispensed = Number(item.dispensed_quantity) || 0;

  if (item.medicine_is_active === false) {
    return { canDispense: false, reason: "Inactive", maxQty: 0, price: unitPrice, allowedCapacity: 0 };
  }
  if (item.stock_state === "Expired") {
    return { canDispense: false, reason: "Expired", maxQty: 0, price: unitPrice, allowedCapacity: 0 };
  }
  if (stock <= 0 || item.stock_state === "Out of stock") {
    return { canDispense: false, reason: "Out of stock", maxQty: 0, price: unitPrice, allowedCapacity: 0 };
  }
  const allowedCapacity = Math.max(0, MAX_DISPENSE_LIMIT_PER_MEDICINE - dispensed);
  if (allowedCapacity <= 0) {
    return { canDispense: false, reason: "Max limit (60) reached", maxQty: 0, price: unitPrice, allowedCapacity: 0 };
  }

  const maxQty = Math.min(allowedCapacity, stock);
  return { canDispense: true, reason: null, maxQty, price: unitPrice, allowedCapacity };
}

function parseQty(val) {
  const num = parseInt(val, 10);
  return isNaN(num) || num < 0 ? 0 : num;
}

function DispenseModal({ prescriptionId, onClose, onSuccess }) {
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [modalError, setModalError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // null | "dispense" | "decline"
  const slipRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    getPrescription(prescriptionId)
      .then((data) => {
        if (!isMounted) return;
        setPrescription(data);
        // Default quantities to prescribed remaining (or maxQty) as strings
        const initial = {};
        (data.items || []).forEach((item) => {
          const info = getItemDispenseInfo(item);
          const remaining = Number(item.remaining_quantity) || 0;
          if (info.canDispense) {
            const defaultQty = remaining > 0 ? Math.min(remaining, info.maxQty) : info.maxQty;
            initial[item.id] = String(defaultQty);
          } else {
            initial[item.id] = "0";
          }
        });
        setQuantities(initial);
        setModalError("");
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setModalError(errorMessage(err));
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [prescriptionId]);

  if (!prescriptionId) return null;

  const isProcessed =
    prescription?.status === "Dispensed" || prescription?.status === "Declined";

  // CHANGE 2: Show "Dispensed" column only when it has history or prescription is processed
  const hasDispensedHistory = prescription?.items?.some(
    (item) => Number(item.dispensed_quantity) > 0
  );
  const showDispensedColumn = Boolean(isProcessed || hasDispensedHistory);

  // Keep quantity as string while typing
  const handleQtyChange = (itemId, rawVal) => {
    setQuantities((prev) => ({ ...prev, [itemId]: rawVal }));
  };

  // Normalize on blur to clamped integer [0, maxQty]
  const handleQtyBlur = (itemId, maxQty) => {
    const raw = quantities[itemId];
    let val = parseInt(raw, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > maxQty) val = maxQty;
    setQuantities((prev) => ({ ...prev, [itemId]: String(val) }));
  };

  // Stepper helper
  const handleStep = (itemId, maxQty, delta) => {
    const current = parseQty(quantities[itemId]);
    const next = Math.max(0, Math.min(maxQty, current + delta));
    setQuantities((prev) => ({ ...prev, [itemId]: String(next) }));
  };

  // Quick set helper (0 or Max)
  const handleSetQuick = (itemId, val) => {
    setQuantities((prev) => ({ ...prev, [itemId]: String(val) }));
  };

  // Table-level bulk buttons
  const handleDispenseAllAvailable = () => {
    if (!prescription?.items) return;
    const updated = {};
    prescription.items.forEach((item) => {
      const info = getItemDispenseInfo(item);
      updated[item.id] = info.canDispense ? String(info.maxQty) : "0";
    });
    setQuantities(updated);
  };

  const handleClearAll = () => {
    if (!prescription?.items) return;
    const updated = {};
    prescription.items.forEach((item) => {
      updated[item.id] = "0";
    });
    setQuantities(updated);
  };

  // Calculate live totals (empty treated as 0)
  let grandTotal = 0;
  let totalUnits = 0;
  let pendingCount = 0;
  const itemsToDispense = [];

  if (prescription?.items) {
    for (const item of prescription.items) {
      const info = getItemDispenseInfo(item);
      const remaining = Math.max(0, Number(item.remaining_quantity) || 0);
      if (info.canDispense) {
        const raw = quantities[item.id];
        const parsed = parseQty(raw);
        const effectiveQty = Math.min(parsed, info.maxQty);
        if (effectiveQty > 0) {
          totalUnits += effectiveQty;
          grandTotal += effectiveQty * info.price;
          itemsToDispense.push({
            item_id: item.id,
            quantity: effectiveQty,
            name: item.medicine_name,
            unit_price: info.price,
          });
        }
        if (remaining > effectiveQty) {
          pendingCount += 1;
        }
      } else {
        if (remaining > 0) {
          pendingCount += 1;
        }
      }
    }
  }

  const handlePrintInstructions = () => {
    printInstructionSlip(slipRef.current, formatId("RX", prescription?.id));
  };

  const handleCollectPaymentClick = () => {
    setModalError("");
    if (!prescription?.items) return;

    // Normalize all quantities before confirming
    const normalized = {};
    prescription.items.forEach((item) => {
      const info = getItemDispenseInfo(item);
      if (info.canDispense) {
        let val = parseInt(quantities[item.id], 10);
        if (isNaN(val) || val < 0) val = 0;
        if (val > info.maxQty) val = info.maxQty;
        normalized[item.id] = String(val);
      } else {
        normalized[item.id] = "0";
      }
    });
    setQuantities(normalized);

    if (totalUnits <= 0) {
      setModalError("Please specify at least 1 unit of medicine to dispense.");
      return;
    }
    setConfirmDialog("dispense");
  };

  const handleConfirmDispense = async () => {
    setActionLoading(true);
    setModalError("");
    try {
      const payload = itemsToDispense.map(({ item_id, quantity }) => ({
        item_id,
        quantity,
      }));
      const res = await dispenseAndPay(prescription.id, payload);
      setConfirmDialog(null);
      onSuccess?.(res);
    } catch (err) {
      setConfirmDialog(null);
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDecline = async () => {
    setActionLoading(true);
    setModalError("");
    try {
      const res = await declinePrescription(prescription.id);
      setConfirmDialog(null);
      onSuccess?.({ prescription: res });
    } catch (err) {
      setConfirmDialog(null);
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div
        className="modal show d-block"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title mb-1">
                  {isProcessed ? "Prescription Details" : "Dispense Prescription"}
                </h5>
                {prescription && (
                  <div className="text-secondary small">
                    {formatId("RX", prescription.id)} · Prescribed by{" "}
                    {prescription.doctor_name || "Doctor"}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onClose}
              ></button>
            </div>

            <div className="modal-body p-4">
              {loading ? (
                <div className="text-muted p-4 text-center">
                  Loading prescription details...
                </div>
              ) : (
                <>
                  {modalError && (
                    <div className="alert alert-danger mb-3" role="alert">
                      {modalError}
                    </div>
                  )}

                  {/* Patient & Prescription Summary Strip */}
                  <div className="card bg-light border-0 mb-4">
                    <div className="card-body p-3">
                      <div className="row g-3">
                        <div className="col-12 col-md-3">
                          <div className="text-secondary small">Patient</div>
                          <div className="fw-bold">
                            {prescription.patient_name || "—"}
                          </div>
                          <div className="text-secondary small">
                            {formatId("PAT", prescription.patient)}
                          </div>
                        </div>
                        <div className="col-6 col-md-3">
                          <div className="text-secondary small">Prescribed By</div>
                          <div className="fw-semibold">
                            {prescription.doctor_name || "—"}
                          </div>
                        </div>
                        <div className="col-6 col-md-3">
                          <div className="text-secondary small">Date</div>
                          <div className="fw-semibold">
                            {formatDate(prescription.date)}
                          </div>
                        </div>
                        <div className="col-12 col-md-3">
                          <div className="text-secondary small">Status</div>
                          <span
                            className={`badge text-bg-${badgeColor(
                              prescription.status
                            )} fs-6`}
                          >
                            {prescription.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bulk buttons above medicines table */}
                  {!isProcessed && (
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="small text-secondary fw-semibold">
                        Prescription Medicines
                      </span>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={handleDispenseAllAvailable}
                        >
                          Dispense all available
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={handleClearAll}
                        >
                          Clear all
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Medicines Table */}
                  <div className="table-responsive mb-3">
                    <table className="table align-middle table-hover mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Medicine &amp; Directions</th>
                          <th className="text-center">Prescribed</th>
                          {showDispensedColumn && (
                            <th className="text-center">Dispensed</th>
                          )}
                          <th className="text-center">Remaining</th>
                          <th>Stock State</th>
                          <th className="text-end">Price</th>
                          <th style={{ minWidth: 170 }}>Dispense Qty</th>
                          <th className="text-end">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescription.items && prescription.items.length > 0 ? (
                          prescription.items.map((item) => {
                            const info = getItemDispenseInfo(item);
                            const stock = Number(item.stock_quantity) || 0;
                            const rawVal = quantities[item.id] ?? "";
                            const parsedVal = parseInt(rawVal, 10);
                            const currentNum = isNaN(parsedVal) || parsedVal < 0 ? 0 : parsedVal;
                            const exceedsMax = !isNaN(parsedVal) && parsedVal > info.maxQty;
                            const effectiveQty = Math.min(currentNum, info.maxQty);
                            const lineTotal = effectiveQty * info.price;

                            return (
                              <tr key={item.id}>
                                <td>
                                  <div className="fw-bold">
                                    {item.medicine_name}
                                  </div>
                                  {item.instructions && (
                                    <div className="text-secondary small mt-1">
                                      Directions: {item.instructions}
                                    </div>
                                  )}
                                </td>
                                <td className="text-center">
                                  <span className="badge text-bg-light border">
                                    {item.prescribed_quantity}
                                  </span>
                                </td>
                                {showDispensedColumn && (
                                  <td className="text-center">
                                    <span className="badge text-bg-light border">
                                      {item.dispensed_quantity}
                                    </span>
                                  </td>
                                )}
                                <td className="text-center">
                                  <strong
                                    className={
                                      item.remaining_quantity > 0
                                        ? "text-primary"
                                        : "text-secondary"
                                    }
                                  >
                                    {Math.max(0, item.remaining_quantity)}
                                  </strong>
                                </td>
                                <td>
                                  <span
                                    className={`badge text-bg-${badgeColor(
                                      item.stock_state
                                    )}`}
                                  >
                                    {item.stock_state}
                                  </span>
                                  {info.canDispense && (
                                    <div
                                      className="text-secondary"
                                      style={{ fontSize: "0.75rem" }}
                                    >
                                      Avail: {item.stock_quantity}
                                    </div>
                                  )}
                                </td>
                                <td className="text-end">
                                  {formatMoney(info.price)}
                                </td>
                                <td>
                                  {isProcessed ? (
                                    <span className="badge text-bg-light border fs-6">
                                      {item.dispensed_quantity}
                                    </span>
                                  ) : info.canDispense ? (
                                    <div>
                                      <div
                                        className="input-group input-group-sm mb-1"
                                        style={{ maxWidth: 150 }}
                                      >
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary px-2"
                                          onClick={() =>
                                            handleStep(item.id, info.maxQty, -1)
                                          }
                                          disabled={currentNum <= 0}
                                          title="Decrease quantity"
                                        >
                                          −
                                        </button>
                                        <input
                                          type="number"
                                          className={`form-control form-control-sm text-center ${
                                            exceedsMax ? "border-danger text-danger" : ""
                                          }`}
                                          min="0"
                                          max={info.maxQty}
                                          step="1"
                                          value={rawVal}
                                          onChange={(e) =>
                                            handleQtyChange(
                                              item.id,
                                              e.target.value
                                            )
                                          }
                                          onBlur={() =>
                                            handleQtyBlur(item.id, info.maxQty)
                                          }
                                        />
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary px-2"
                                          onClick={() =>
                                            handleStep(item.id, info.maxQty, 1)
                                          }
                                          disabled={currentNum >= info.maxQty}
                                          title="Increase quantity"
                                        >
                                          +
                                        </button>
                                      </div>
                                      <div className="d-flex align-items-center gap-1 mb-1">
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary py-0 px-2"
                                          style={{ fontSize: "0.72rem" }}
                                          onClick={() =>
                                            handleSetQuick(item.id, 0)
                                          }
                                          disabled={
                                            currentNum === 0 && rawVal === "0"
                                          }
                                        >
                                          0
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary py-0 px-2"
                                          style={{ fontSize: "0.72rem" }}
                                          onClick={() =>
                                            handleSetQuick(item.id, info.maxQty)
                                          }
                                          disabled={currentNum === info.maxQty}
                                        >
                                          Max
                                        </button>
                                      </div>
                                      {exceedsMax && (
                                        <div
                                          className="text-danger fw-semibold"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          Only {info.maxQty} available
                                        </div>
                                      )}
                                      <div
                                        className="text-secondary"
                                        style={{ fontSize: "0.75rem" }}
                                      >
                                        {stock < info.allowedCapacity
                                          ? `Max ${info.maxQty} (stock limit)`
                                          : `Max ${info.maxQty} (limit 60)`}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-danger small fw-semibold">
                                      {info.reason}
                                    </span>
                                  )}
                                </td>
                                <td className="text-end fw-semibold">
                                  {info.canDispense
                                    ? formatMoney(lineTotal)
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={showDispensedColumn ? 8 : 7}
                              className="text-muted text-center p-3"
                            >
                              No medicines in this prescription.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Live summary badge */}
                  {!isProcessed && (
                    <div className="p-3 bg-light rounded border">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="text-secondary">
                          Items to dispense:{" "}
                          <strong className="text-dark">
                            {totalUnits} unit{totalUnits === 1 ? "" : "s"}
                          </strong>{" "}
                          ({itemsToDispense.length} medicine
                          {itemsToDispense.length === 1 ? "" : "s"})
                        </div>
                        <div className="fs-5">
                          <span className="text-secondary me-2">
                            Grand Total:
                          </span>
                          <strong className="text-primary">
                            {formatMoney(grandTotal)}
                          </strong>
                        </div>
                      </div>
                      {pendingCount > 0 && (
                        <div className="mt-2 text-warning-emphasis small pt-2 border-top">
                          {pendingCount} medicine(s) will remain pending. The
                          prescription will be marked Partially Dispensed.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer d-flex justify-content-between">
              <div>
                {!isProcessed && prescription && (
                  <button
                    type="button"
                    className="btn btn-outline-danger me-2"
                    disabled={actionLoading || loading}
                    onClick={() => setConfirmDialog("decline")}
                  >
                    Decline Prescription
                  </button>
                )}
                {prescription && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={handlePrintInstructions}
                  >
                    Print Instructions
                  </button>
                )}
              </div>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                >
                  Close
                </button>
                {!isProcessed && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={actionLoading || loading || totalUnits <= 0}
                    onClick={handleCollectPaymentClick}
                  >
                    Collect Payment &amp; Dispense
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      {confirmDialog === "dispense" && (
        <ConfirmModal
          title="Confirm Payment & Dispense"
          confirmText="Payment Received"
          confirmVariant="primary"
          loading={actionLoading}
          onConfirm={handleConfirmDispense}
          onClose={() => setConfirmDialog(null)}
        >
          <p className="mb-2">
            Confirm that payment of{" "}
            <strong>{formatMoney(grandTotal)}</strong> has been received from{" "}
            <strong>{prescription?.patient_name || "the patient"}</strong>.
          </p>
          <div className="card my-3 bg-light border">
            <div className="card-header py-2 small fw-semibold text-secondary">
              Billed Medicines ({itemsToDispense.length} line item
              {itemsToDispense.length === 1 ? "" : "s"}, {totalUnits} unit
              {totalUnits === 1 ? "" : "s"})
            </div>
            <ul className="list-group list-group-flush small">
              {itemsToDispense.map((item) => (
                <li
                  key={item.item_id}
                  className="list-group-item d-flex justify-content-between align-items-center py-2 bg-transparent"
                >
                  <span>
                    <span className="fw-semibold">{item.name}</span> ×{" "}
                    {item.quantity}
                  </span>
                  <span className="fw-semibold text-dark">
                    = {formatMoney(item.quantity * item.unit_price)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="card-footer py-2 d-flex justify-content-between align-items-center fw-bold">
              <span>Grand Total</span>
              <span className="text-primary fs-6">
                {formatMoney(grandTotal)}
              </span>
            </div>
          </div>
          <p className="small text-muted mb-0">
            This will create the paid pharmacy bill, record payment, and deduct
            stock.
          </p>
        </ConfirmModal>
      )}

      {confirmDialog === "decline" && (
        <ConfirmModal
          title="Decline Prescription"
          message={`Are you sure you want to mark Prescription ${formatId(
            "RX",
            prescription.id
          )} for ${
            prescription.patient_name || "the patient"
          } as Declined?\n\nThis means the patient chose not to purchase these medicines now. No bill will be created and no stock will be deducted.`}
          confirmText="Mark Declined"
          confirmVariant="danger"
          loading={actionLoading}
          onConfirm={handleConfirmDecline}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      {/* Hidden printable instruction slip */}
      <div style={{ display: "none" }}>
        <div ref={slipRef}>
          <h2>✚ CareFlow Clinic</h2>
          <div className="subtitle">Prescription Instruction Slip</div>
          <div className="meta">
            <div>
              <strong>Prescription: </strong>
              {formatId("RX", prescription?.id)}
            </div>
            <div>
              <strong>Date: </strong>
              {formatDate(prescription?.date)}
            </div>
            <div>
              <strong>Patient: </strong>
              {prescription?.patient_name} (
              {formatId("PAT", prescription?.patient)})
            </div>
            <div>
              <strong>Doctor: </strong>
              {prescription?.doctor_name}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th className="text-center">Prescribed</th>
                <th>Directions &amp; Instructions</th>
              </tr>
            </thead>
            <tbody>
              {(prescription?.items || []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.medicine_name}</strong>
                  </td>
                  <td className="text-center">{item.prescribed_quantity}</td>
                  <td>{item.instructions || "As directed by physician"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="footer">
            Take medicines strictly as prescribed by your physician. Contact the
            clinic in case of any adverse reaction.
          </div>
        </div>
      </div>
    </>
  );
}

export default DispenseModal;
