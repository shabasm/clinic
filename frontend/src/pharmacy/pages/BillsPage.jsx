import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import ConfirmModal from "../components/ConfirmModal";
import PharmacyNavbar from "../components/PharmacyNavbar";
import ReceiptModal from "../components/ReceiptModal";
import { badgeColor, cancelBill, getBills } from "../services/pharmacyApi";

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function BillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState("");
  const statusFilter = searchParams.get("payment_status") || "";
  const dateParam = searchParams.get("date");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [activeReceiptBill, setActiveReceiptBill] = useState(null);
  const [cancellingBill, setCancellingBill] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const today = todayStr();

  // Local user date override (null means compute from query params / defaults)
  const [userDateFilter, setUserDateFilter] = useState(null);

  const dateFilter =
    userDateFilter !== null
      ? userDateFilter
      : dateParam === "all"
      ? ""
      : dateParam === "today"
      ? today
      : dateParam || today;

  const loadBills = useCallback(() => {
    const params = {};
    if (statusFilter) params.payment_status = statusFilter;
    getBills(params)
      .then((data) => {
        setBills(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  }, [statusFilter]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handleStatusChange = (val) => {
    const newParams = {};
    if (val) newParams.payment_status = val;
    if (dateFilter) newParams.date = dateFilter;
    setSearchParams(newParams);
  };

  const handleConfirmCancelBill = async () => {
    if (!cancellingBill) return;
    setCancelLoading(true);
    setError("");
    try {
      await cancelBill(cancellingBill.id);
      setSuccess(`Bill ${formatId("BILL", cancellingBill.id)} cancelled successfully.`);
      setCancellingBill(null);
      loadBills();
    } catch (err) {
      setError(errorMessage(err));
      setCancellingBill(null);
    } finally {
      setCancelLoading(false);
    }
  };

  // Compute stats from the full bills array (before date/search filter)
  const billsToday = bills.filter((b) =>
    (b.created_at || "").startsWith(today)
  );
  const statBillsToday = billsToday.length;
  const statRevenueToday = billsToday
    .filter((b) => b.payment_status === "Paid")
    .reduce((sum, b) => sum + Number(b.total || 0), 0);
  const statTotalBills = bills.length;

  // Apply search + date filter for table display
  const filtered = bills.filter((b) => {
    const billDate = (b.created_at || "").slice(0, 10);
    if (dateFilter && billDate !== dateFilter) return false;
    if (!search) return true;
    const text =
      `${formatId("BILL", b.id)} ${b.patient_name || ""} ${formatId(
        "PAT",
        b.patient
      )} ${formatId("RX", b.prescription)}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  // Daily total for currently displayed rows
  const displayedTotal = filtered.reduce(
    (sum, b) => sum + Number(b.total || 0),
    0
  );

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Billing Records</h1>
          <p className="mb-0">
            View pharmacy bills, payment receipts, and revenue summaries.
          </p>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            {success}
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={() => setSuccess("")}
            ></button>
          </div>
        )}

        {/* Stats row - clicking cards filters the table */}
        {!loading && (
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-4">
              <div
                className={`card stat-card h-100 cursor-pointer ${
                  dateFilter === today ? "border-primary" : ""
                }`}
                style={{ cursor: "pointer" }}
                onClick={() => setUserDateFilter(today)}
                role="button"
                tabIndex={0}
                title="Click to view today's bills"
              >
                <div className="card-body">
                  <div className="small text-secondary">Bills Today</div>
                  <div className="stat-num">{statBillsToday}</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-4">
              <div className="card stat-card h-100">
                <div className="card-body">
                  <div className="small text-secondary">Revenue Today</div>
                  <div className="stat-num">{formatMoney(statRevenueToday)}</div>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-4">
              <div
                className={`card stat-card h-100 cursor-pointer ${
                  !dateFilter ? "border-primary" : ""
                }`}
                style={{ cursor: "pointer" }}
                onClick={() => setUserDateFilter("")}
                role="button"
                tabIndex={0}
                title="Click to view all bills across all dates"
              >
                <div className="card-body">
                  <div className="small text-secondary">All Bills</div>
                  <div className="stat-num">{statTotalBills}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters toolbar */}
        <div className="d-flex flex-wrap toolbar mb-3 gap-2">
          <div className="input-group w-auto flex-grow-1">
            <span className="input-group-text">Search</span>
            <input
              className="form-control"
              type="search"
              placeholder="Patient name, prescription ID, or bill ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select w-auto"
            aria-label="Filter payment status"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="">All payment statuses</option>
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
          </select>
          <input
            type="date"
            className="form-control w-auto"
            aria-label="Filter by date"
            value={dateFilter}
            onChange={(e) => setUserDateFilter(e.target.value)}
            title="Filter bills by date"
          />
          {dateFilter !== today && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setUserDateFilter(today)}
            >
              Today
            </button>
          )}
          {dateFilter && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setUserDateFilter("")}
            >
              Clear date
            </button>
          )}
        </div>

        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Date &amp; Time</th>
                  <th>Patient</th>
                  <th>Prescription</th>
                  <th className="text-center">Items</th>
                  <th className="text-end">Total</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="text-muted p-3">
                      Loading bills...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((b) => {
                    const itemsCount = (b.items || []).reduce(
                      (acc, it) => acc + (Number(it.quantity) || 0),
                      0
                    );
                    const timePart = formatTime(b.created_at);

                    return (
                      <tr key={b.id}>
                        <td className="fw-semibold">
                          <span className="badge text-bg-light border fs-6">
                            {formatId("BILL", b.id)}
                          </span>
                        </td>
                        <td>
                          <strong>{formatDate(b.created_at)}</strong>
                          {timePart && (
                            <span className="text-secondary small d-block">
                              {timePart}
                            </span>
                          )}
                        </td>
                        <td>
                          <strong>
                            {b.patient_name || formatId("PAT", b.patient)}
                          </strong>
                          {b.patient && (
                            <span className="text-secondary small d-block">
                              {formatId("PAT", b.patient)}
                            </span>
                          )}
                        </td>
                        <td>
                          <Link
                            to={`/pharmacy/prescriptions?open=${b.prescription}`}
                            className="text-decoration-none"
                          >
                            <span className="badge text-bg-light border">
                              {formatId("RX", b.prescription)}
                            </span>
                          </Link>
                        </td>
                        <td className="text-center">
                          <span className="badge text-bg-primary fs-6">
                            {itemsCount}
                          </span>
                        </td>
                        <td className="text-end fw-bold text-primary">
                          {formatMoney(b.total)}
                        </td>
                        <td>
                          <span
                            className={`badge text-bg-${badgeColor(
                              b.payment_status
                            )}`}
                          >
                            {b.payment_status}
                          </span>
                        </td>
                        <td className="text-end text-nowrap">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary me-1"
                            onClick={() => setActiveReceiptBill(b)}
                          >
                            View Receipt
                          </button>
                          {b.payment_status === "Pending" && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => setCancellingBill(b)}
                              title="Cancel unpaid bill"
                            >
                              Cancel bill
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="empty" colSpan="8">
                      {bills.length
                        ? "No matching bills."
                        : "No pharmacy bills have been created yet."}
                    </td>
                  </tr>
                )}
              </tbody>
              {/* Daily total footer */}
              {!loading && filtered.length > 0 && (
                <tfoot>
                  <tr className="table-light">
                    <th colSpan="5" className="text-end text-secondary small">
                      {dateFilter
                        ? `Total for ${formatDate(dateFilter)}`
                        : "Displayed total"}
                      :
                    </th>
                    <th className="text-end text-primary">
                      {formatMoney(displayedTotal)}
                    </th>
                    <th colSpan="2"></th>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>

      {/* View Receipt Modal */}
      {activeReceiptBill && (
        <ReceiptModal
          bill={activeReceiptBill}
          onClose={() => setActiveReceiptBill(null)}
        />
      )}

      {/* Confirm Cancel Bill Modal (Backward Compatibility for Pending bills) */}
      {cancellingBill && (
        <ConfirmModal
          title="Cancel Unpaid Bill"
          message={`Are you sure you want to cancel Bill ${formatId(
            "BILL",
            cancellingBill.id
          )} for ${formatMoney(cancellingBill.total)}? This action cannot be undone.`}
          confirmText="Cancel Bill"
          confirmVariant="danger"
          loading={cancelLoading}
          onConfirm={handleConfirmCancelBill}
          onCancel={() => setCancellingBill(null)}
        />
      )}
    </>
  );
}

export default BillsPage;
