import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import ConfirmModal from "../components/ConfirmModal";
import PharmacyNavbar from "../components/PharmacyNavbar";
import ReceiptPrint from "../components/ReceiptPrint";
import {
  badgeColor,
  cancelBill,
  dispensePrescription,
  getBill,
  getPrescription,
  payBill,
} from "../services/pharmacyApi";

function BillDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [isDispensed, setIsDispensed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Active modal: "pay" | "cancel" | "dispense" | "dispensePrompt" | null
  const [activeModal, setActiveModal] = useState(null);

  useEffect(() => {
    let isMounted = true;
    getBill(id)
      .then((data) => {
        if (!isMounted) return;
        setBill(data);
        if (data.prescription) {
          getPrescription(data.prescription)
            .then((pres) => {
              if (isMounted && pres.status === "Dispensed") {
                setIsDispensed(true);
              }
            })
            .catch(() => {});
        }
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

  const handlePay = async () => {
    setActionLoading(true);
    setModalError("");
    setError("");
    setSuccess("");
    try {
      const updated = await payBill(id);
      setBill(updated);
      setSuccess("Payment confirmed successfully. The medicines are now ready to dispense.");
      // Open the dispense modal window immediately after confirming payment
      setActiveModal("dispensePrompt");
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispense = async () => {
    if (!bill?.prescription) return;
    setActionLoading(true);
    setModalError("");
    setError("");
    try {
      await dispensePrescription(bill.prescription);
      setSuccess("Medicines successfully dispensed and stock deducted!");
      setIsDispensed(true);
      setActiveModal(null);
    } catch (err) {
      setModalError(errorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    setModalError("");
    setError("");
    try {
      await cancelBill(id);
      navigate("/pharmacy/bills", { replace: true });
    } catch (err) {
      setModalError(errorMessage(err));
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <PharmacyNavbar />
        <main className="container admin-main">
          <header className="page-header pharmacy-no-print d-print-none">
            <h1 className="mb-1">Bill details</h1>
            <p className="mb-0">Loading bill record...</p>
          </header>
          <div className="text-muted">Loading ...</div>
        </main>
      </>
    );
  }

  if (!bill) {
    return (
      <>
        <PharmacyNavbar />
        <main className="container admin-main">
          <header className="page-header pharmacy-no-print d-print-none">
            <h1 className="mb-1">Bill details</h1>
            <p className="mb-0">Bill not found.</p>
          </header>
          <div className="alert alert-danger" role="alert">
            {error || "Could not find the requested bill."}
          </div>
          <Link to="/pharmacy/bills" className="btn btn-outline-secondary">
            Back to Bills
          </Link>
        </main>
      </>
    );
  }

  const isPending = bill.payment_status === "Pending";

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3 pharmacy-no-print d-print-none">
          <div>
            <h1 className="mb-1">Bill {formatId("BILL", bill.id)}</h1>
            <p className="mb-0">Pharmacy billing and receipt record.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            {!isPending && !isDispensed && (
              <button
                type="button"
                className="btn btn-success"
                onClick={() => {
                  setModalError("");
                  setActiveModal("dispense");
                }}
              >
                Dispense Medicines
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => window.print()}
            >
              Print receipt
            </button>
            <Link to="/pharmacy/bills" className="btn btn-outline-secondary">
              Back to Bills
            </Link>
          </div>
        </header>

        {error && !activeModal && (
          <div className="alert alert-danger pharmacy-no-print d-print-none" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success d-flex flex-wrap justify-content-between align-items-center gap-2 pharmacy-no-print d-print-none" role="status">
            <div>{success}</div>
            {!isPending && !isDispensed && (
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={() => {
                  setModalError("");
                  setActiveModal("dispense");
                }}
              >
                Dispense Medicines
              </button>
            )}
          </div>
        )}

        {/* Bill summary and lines card */}
        <div className="card mb-4 pharmacy-no-print d-print-none">
          <div className="card-body">
            <div className="row g-3 mb-4">
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Patient</div>
                <div className="fw-semibold">
                  {bill.patient_name || formatId("PAT", bill.patient)}
                </div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Prescription</div>
                <div>
                  <Link
                    to={`/pharmacy/prescriptions/${bill.prescription}`}
                    className="fw-semibold"
                  >
                    {formatId("RX", bill.prescription)}
                  </Link>
                </div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Created Date</div>
                <div className="fw-semibold">{formatDate(bill.created_at)}</div>
              </div>
              <div className="col-md-3 col-6">
                <div className="small text-secondary">Payment Status</div>
                <div>
                  <span className={`badge text-bg-${badgeColor(bill.payment_status)}`}>
                    {bill.payment_status}
                  </span>
                </div>
              </div>
              {bill.paid_at && (
                <div className="col-md-3 col-6">
                  <div className="small text-secondary">Paid Date</div>
                  <div className="fw-semibold">{formatDate(bill.paid_at)}</div>
                </div>
              )}
            </div>

            <h2 className="h5 mb-3">Bill Items</h2>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th className="text-center">Quantity</th>
                    <th className="text-end">Unit Price</th>
                    <th className="text-end">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(bill.items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="fw-semibold">{item.medicine_name}</td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-end">{formatMoney(item.unit_price)}</td>
                      <td className="text-end">{formatMoney(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="3" className="text-end pt-3">
                      Subtotal:
                    </th>
                    <td className="text-end pt-3">{formatMoney(bill.subtotal)}</td>
                  </tr>
                  <tr>
                    <th colSpan="3" className="text-end fs-6">
                      Total:
                    </th>
                    <td className="text-end fs-6 fw-bold text-primary">
                      {formatMoney(bill.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card-footer bg-transparent d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
            <div className="d-flex gap-2 flex-wrap">
              {isPending && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setModalError("");
                    setActiveModal("pay");
                  }}
                >
                  Confirm payment
                </button>
              )}
              {!isPending && !isDispensed && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => {
                    setModalError("");
                    setActiveModal("dispense");
                  }}
                >
                  Dispense Medicines
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => window.print()}
              >
                Print receipt
              </button>
              <Link
                to={`/pharmacy/prescriptions/${bill.prescription}`}
                className="btn btn-outline-secondary"
              >
                View Prescription
              </Link>
            </div>
            {isPending && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => {
                  setModalError("");
                  setActiveModal("cancel");
                }}
              >
                Cancel bill
              </button>
            )}
          </div>
        </div>

        {/* Standalone Printable Receipt */}
        <section>
          <ReceiptPrint bill={bill} />
        </section>
      </main>

      {/* 1. Modal: Confirm Payment */}
      {activeModal === "pay" && (
        <ConfirmModal
          title="Confirm bill payment"
          confirmText="Confirm payment"
          confirmVariant="primary"
          onConfirm={handlePay}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          <p>
            Mark bill {formatId("BILL", bill.id)} for{" "}
            <strong>{formatMoney(bill.total)}</strong> as Paid?
          </p>
          <div className="small text-secondary">
            Stock availability will be validated before confirming payment. Once paid, the
            bill cannot be cancelled.
          </div>
        </ConfirmModal>
      )}

      {/* 2. Modal: Dispense Prompt right after confirming payment */}
      {activeModal === "dispensePrompt" && (
        <ConfirmModal
          title="Payment Confirmed — Dispense Medicines"
          confirmText="Dispense Medicines"
          confirmVariant="success"
          onConfirm={handleDispense}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          <div className="alert alert-success py-2 mb-3">
            Payment for Bill {formatId("BILL", bill.id)} of <strong>{formatMoney(bill.total)}</strong> has been recorded as <strong>Paid</strong>.
          </div>
          <p className="mb-2">
            Would you like to dispense the medicines for Prescription {formatId("RX", bill.prescription)} now?
          </p>
          <div className="small text-secondary">
            Clicking <strong>Dispense Medicines</strong> will immediately deduct the items from medicine inventory and mark the prescription as dispensed.
          </div>
        </ConfirmModal>
      )}

      {/* 3. Modal: Dispense Medicines from button */}
      {activeModal === "dispense" && (
        <ConfirmModal
          title="Dispense medicines"
          confirmText="Dispense"
          confirmVariant="success"
          onConfirm={handleDispense}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          <p className="mb-2">
            Dispense the paid medicines for Prescription {formatId("RX", bill.prescription)}?
          </p>
          <div className="small text-secondary">
            Inventory stock will be deducted immediately.
          </div>
        </ConfirmModal>
      )}

      {/* 4. Modal: Cancel Bill */}
      {activeModal === "cancel" && (
        <ConfirmModal
          title="Cancel pharmacy bill"
          confirmText="Cancel bill"
          confirmVariant="danger"
          onConfirm={handleCancel}
          onClose={() => setActiveModal(null)}
          loading={actionLoading}
          error={modalError}
        >
          <p>
            Cancel and delete bill {formatId("BILL", bill.id)}? The unbilled items will become
            available again for new bills.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}

export default BillDetails;
