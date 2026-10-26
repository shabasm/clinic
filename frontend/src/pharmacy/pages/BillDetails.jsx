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
  getBill,
  payBill,
} from "../services/pharmacyApi";

function BillDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Active modal: "pay" | "cancel" | null
  const [activeModal, setActiveModal] = useState(null);

  useEffect(() => {
    let isMounted = true;
    getBill(id)
      .then((data) => {
        if (!isMounted) return;
        setBill(data);
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
      setSuccess("Payment confirmed successfully. The prescription is now ready to dispense.");
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
          <header className="page-header pharmacy-no-print">
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
          <header className="page-header pharmacy-no-print">
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
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3 pharmacy-no-print">
          <div>
            <h1 className="mb-1">Bill {formatId("BILL", bill.id)}</h1>
            <p className="mb-0">Pharmacy billing and receipt record.</p>
          </div>
          <div className="d-flex gap-2">
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
          <div className="alert alert-danger pharmacy-no-print" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success pharmacy-no-print" role="status">
            {success}
          </div>
        )}

        {/* Bill summary and lines card */}
        <div className="card mb-4 pharmacy-no-print">
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
            <div className="d-flex gap-2">
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
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => window.print()}
              >
                Print receipt
              </button>
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
