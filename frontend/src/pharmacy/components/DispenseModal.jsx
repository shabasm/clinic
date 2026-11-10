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

function getItemDispenseInfo(item) {
  const remaining = Number(item.remaining_quantity) || 0;
  const stock = Number(item.stock_quantity) || 0;
  const unitPrice = Number(item.unit_price) || 0;

  if (item.medicine_is_active === false) {
    return { canDispense: false, reason: "Inactive", maxQty: 0, price: unitPrice };
  }
  if (item.stock_state === "Expired") {
    return { canDispense: false, reason: "Expired", maxQty: 0, price: unitPrice };
  }
  if (stock <= 0 || item.stock_state === "Out of stock") {
    return { canDispense: false, reason: "Out of stock", maxQty: 0, price: unitPrice };
  }
  if (remaining <= 0) {
    return { canDispense: false, reason: "Completed", maxQty: 0, price: unitPrice };
  }

  const maxQty = Math.min(remaining, stock);
  return { canDispense: true, reason: null, maxQty, price: unitPrice };
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
        // Default quantities to max dispensable quantity
        const initial = {};
        (data.items || []).forEach((item) => {
          const info = getItemDispenseInfo(item);
          if (info.canDispense) {
            initial[item.id] = info.maxQty;
          } else {
            initial[item.id] = 0;
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

  const handleQtyChange = (itemId, maxQty, rawVal) => {
    let val = Number(rawVal);
    if (isNaN(val) || val < 0) val = 0;
    if (val > maxQty) val = maxQty;
    val = Math.floor(val);
    setQuantities((prev) => ({ ...prev, [itemId]: val }));
  };

  // Calculate live totals
  let grandTotal = 0;
  let totalUnits = 0;
  const itemsToDispense = [];

  if (prescription?.items) {
    for (const item of prescription.items) {
      const info = getItemDispenseInfo(item);
      if (info.canDispense) {
        const qty = Number(quantities[item.id]) || 0;
        if (qty > 0) {
          totalUnits += qty;
          grandTotal += qty * info.price;
          itemsToDispense.push({
            item_id: item.id,
            quantity: qty,
            name: item.medicine_name,
            unit_price: info.price,
          });
        }
      }
    }
  }

  const handlePrintInstructions = () => {
    printInstructionSlip(slipRef.current, formatId("RX", prescription?.id));
  };

  const handleCollectPaymentClick = () => {
    setModalError("");
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

                  {/* Medicines Table */}
                  <div className="table-responsive mb-3">
                    <table className="table align-middle table-hover mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Medicine &amp; Directions</th>
                          <th className="text-center">Prescribed</th>
                          <th className="text-center">Dispensed</th>
                          <th className="text-center">Remaining</th>
                          <th>Stock State</th>
                          <th className="text-end">Price</th>
                          <th style={{ width: 140 }}>Dispense Qty</th>
                          <th className="text-end">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescription.items && prescription.items.length > 0 ? (
                          prescription.items.map((item) => {
                            const info = getItemDispenseInfo(item);
                            const currentQty = Number(quantities[item.id]) || 0;
                            const lineTotal = currentQty * info.price;

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
                                <td className="text-center">
                                  <span className="badge text-bg-light border">
                                    {item.dispensed_quantity}
                                  </span>
                                </td>
                                <td className="text-center">
                                  <strong
                                    className={
                                      item.remaining_quantity > 0
                                        ? "text-primary"
                                        : "text-secondary"
                                    }
                                  >
                                    {item.remaining_quantity}
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
                                      <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        min="0"
                                        max={info.maxQty}
                                        step="1"
                                        value={currentQty}
                                        onChange={(e) =>
                                          handleQtyChange(
                                            item.id,
                                            info.maxQty,
                                            e.target.value
                                          )
                                        }
                                      />
                                      <div
                                        className="text-secondary"
                                        style={{ fontSize: "0.75rem" }}
                                      >
                                        Max: {info.maxQty}
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
                            <td colSpan="8" className="text-muted text-center p-3">
                              No medicines in this prescription.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Live summary badge */}
                  {!isProcessed && (
                    <div className="d-flex justify-content-between align-items-center p-3 bg-light rounded border">
                      <div className="text-secondary">
                        Items to dispense:{" "}
                        <strong className="text-dark">
                          {totalUnits} unit{totalUnits === 1 ? "" : "s"}
                        </strong>{" "}
                        ({itemsToDispense.length} medicine{itemsToDispense.length === 1 ? "" : "s"})
                      </div>
                      <div className="fs-5">
                        <span className="text-secondary me-2">Grand Total:</span>
                        <strong className="text-primary">
                          {formatMoney(grandTotal)}
                        </strong>
                      </div>
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
          message={`Confirm that payment of ${formatMoney(
            grandTotal
          )} has been received from ${prescription.patient_name || "the patient"}.\n\n${
            itemsToDispense.length
          } line item(s), ${totalUnits} unit(s).\n\nThis will create the pharmacy bill and deduct stock.`}
          confirmText="Payment Received"
          confirmVariant="primary"
          loading={actionLoading}
          onConfirm={handleConfirmDispense}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {confirmDialog === "decline" && (
        <ConfirmModal
          title="Decline Prescription"
          message={`Are you sure you want to mark Prescription ${formatId(
            "RX",
            prescription.id
          )} for ${prescription.patient_name || "the patient"} as Declined?\n\nThis means the patient chose not to purchase these medicines now. No bill will be created and no stock will be deducted.`}
          confirmText="Mark Declined"
          confirmVariant="danger"
          loading={actionLoading}
          onConfirm={handleConfirmDecline}
          onCancel={() => setConfirmDialog(null)}
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
              {prescription?.patient_name} ({formatId("PAT", prescription?.patient)})
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
            Take medicines strictly as prescribed by your physician. Contact the clinic in case of any adverse reaction.
          </div>
        </div>
      </div>
    </>
  );
}

export default DispenseModal;
