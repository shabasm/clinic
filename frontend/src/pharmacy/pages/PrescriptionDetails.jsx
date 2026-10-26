import { useEffect, useState } from "react";
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

  // Per-item input states keyed by item.id
  const [billQuantities, setBillQuantities] = useState({});
  const [dispenseQuantities, setDispenseQuantities] = useState({});

  // Confirmation modal state: "bill" | "dispense" | "decline" | null
  const [activeModal, setActiveModal] = useState(null);

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

  const handleDispenseQtyChange = (itemId, val) => {
    setDispenseQuantities((prev) => ({ ...prev, [itemId]: val }));
  };

  // Helper to collect non-zero row quantities
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

  const getSelectedDispenseItems = () => {
    if (!prescription?.items) return null;
    const items = [];
    for (const item of prescription.items) {
      const qty = Number(dispenseQuantities[item.id]);
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
      const selected = getSelectedDispenseItems();
      const payloadItems = selected
        ? selected.map(({ item_id, quantity }) => ({ item_id, quantity }))
        : undefined;
      await dispensePrescription(id, payloadItems);
      setSuccess("Medicines dispensed and stock deducted successfully.");
      setActiveModal(null);
      setDispenseQuantities({});
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
  const canDecline =
    prescription.status === "Pending" && (prescription.bill_count ?? bills.length) === 0;

  const hasUnbilled = prescription.items?.some(
    (i) => i.prescribed_quantity - i.billed_quantity > 0
  );
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
          <Link to="/pharmacy/prescriptions" className="btn btn-outline-secondary">
            Back to Prescriptions
          </Link>
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
                    <>
                      <th style={{ width: "110px" }}>Bill qty</th>
                      <th style={{ width: "110px" }}>Dispense qty</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {prescription.items?.map((item) => {
                  const unbilled = item.prescribed_quantity - item.billed_quantity;
                  const maxDispensable = Math.min(
                    item.dispensable_quantity,
                    item.stock_quantity
                  );
                  const isExpired = item.stock_state === "Expired";
                  const isOutOfStock =
                    item.stock_state === "Out of stock" || item.stock_quantity === 0;
                  const isInactive = !item.medicine_is_active;

                  const warnings = [];
                  if (isInactive) warnings.push("Medicine is inactive.");
                  if (isExpired) warnings.push("Medicine is expired.");
                  if (isOutOfStock) warnings.push("Medicine is out of stock.");
                  if (!isOutOfStock && item.stock_quantity < unbilled) {
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
                        {item.remaining_quantity}
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
                        <>
                          <td>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              min="0"
                              max={Math.max(0, unbilled)}
                              step="1"
                              placeholder={unbilled > 0 ? `Max ${unbilled}` : "0"}
                              disabled={unbilled <= 0 || isExpired || isInactive}
                              value={billQuantities[item.id] ?? ""}
                              onChange={(e) =>
                                handleBillQtyChange(item.id, e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              min="0"
                              max={Math.max(0, maxDispensable)}
                              step="1"
                              placeholder={
                                maxDispensable > 0 ? `Max ${maxDispensable}` : "0"
                              }
                              disabled={
                                maxDispensable <= 0 || isExpired || isInactive
                              }
                              value={dispenseQuantities[item.id] ?? ""}
                              onChange={(e) =>
                                handleDispenseQtyChange(item.id, e.target.value)
                              }
                            />
                          </td>
                        </>
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
                  disabled={!hasUnbilled}
                  onClick={() => {
                    setModalError("");
                    setActiveModal("bill");
                  }}
                >
                  Create bill
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!hasDispensable}
                  onClick={() => {
                    setModalError("");
                    setActiveModal("dispense");
                  }}
                >
                  Dispense selected
                </button>
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
                  Decline prescription
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
                No specific quantities entered. This will bill all remaining unbilled quantities
                for active in-stock items on this prescription.
              </p>
              <div className="small text-secondary">
                Totals are calculated by the server.
              </div>
            </div>
          )}
        </ConfirmModal>
      )}

      {activeModal === "dispense" && (
        <ConfirmModal
          title="Dispense medicines"
          confirmText="Dispense"
          confirmVariant="primary"
          onConfirm={handleConfirmDispense}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          {getSelectedDispenseItems() ? (
            <div>
              <p>Dispense the specified paid items:</p>
              <ul>
                {getSelectedDispenseItems().map((it) => (
                  <li key={it.item_id}>
                    {it.name}: <strong>{it.quantity}</strong> units
                  </li>
                ))}
              </ul>
              <div className="small text-secondary">
                Medicine inventory will be decremented accordingly.
              </div>
            </div>
          ) : (
            <div>
              <p>
                Dispense all items that have been paid for and are ready? Medicine inventory will
                be deducted.
              </p>
            </div>
          )}
        </ConfirmModal>
      )}

      {activeModal === "decline" && (
        <ConfirmModal
          title="Decline prescription"
          confirmText="Decline prescription"
          confirmVariant="danger"
          onConfirm={handleConfirmDecline}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          <p className="mb-0">
            Decline prescription {formatId("RX", prescription.id)}? Once declined, this
            prescription cannot be billed or dispensed.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}

export default PrescriptionDetails;
