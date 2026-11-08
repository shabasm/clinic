import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import { badgeColor, getBills } from "../services/pharmacyApi";

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function BillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState("");
  const statusFilter = searchParams.get("payment_status") || "";
  const dateParam = searchParams.get("date");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = todayStr();

  // If date=all is passed, show all bills. Otherwise default to today's bills.
  const [dateFilter, setDateFilter] = useState(() => {
    if (dateParam === "all") return "";
    if (dateParam === "today") return today;
    if (dateParam) return dateParam;
    return today;
  });

  // Sync dateFilter when query params change
  useEffect(() => {
    const d = searchParams.get("date");
    if (d === "all") {
      setDateFilter("");
    } else if (d === "today") {
      setDateFilter(todayStr());
    } else if (d) {
      setDateFilter(d);
    }
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;
    const params = {};
    if (statusFilter) params.payment_status = statusFilter;
    getBills(params)
      .then((data) => {
        if (!isMounted) return;
        setBills(data);
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
  }, [statusFilter]);

  const handleStatusChange = (val) => {
    const newParams = {};
    if (val) newParams.payment_status = val;
    if (dateFilter) newParams.date = dateFilter;
    setSearchParams(newParams);
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
          <h1 className="mb-1">Bills</h1>
          <p className="mb-0">
            Pharmacy bills. Payment status is separate from prescription status.
          </p>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
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
                onClick={() => setDateFilter(today)}
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
                onClick={() => setDateFilter("")}
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
              placeholder="Patient name or bill ID"
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
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter bills by date"
          />
          {dateFilter !== today && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setDateFilter(today)}
            >
              Today
            </button>
          )}
          {dateFilter && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setDateFilter("")}
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
                  <th>Patient</th>
                  <th>Prescription</th>
                  <th>Date</th>
                  <th className="text-end">Total</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-muted p-3">
                      Loading bills...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((b) => (
                    <tr key={b.id}>
                      <td className="fw-semibold">{formatId("BILL", b.id)}</td>
                      <td>{b.patient_name || formatId("PAT", b.patient)}</td>
                      <td>
                        <Link to={`/pharmacy/prescriptions/${b.prescription}`}>
                          {formatId("RX", b.prescription)}
                        </Link>
                      </td>
                      <td>{formatDate(b.created_at)}</td>
                      <td className="text-end fw-semibold">
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
                    <td className="empty" colSpan="7">
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
                    <th colSpan="4" className="text-end text-secondary small">
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
    </>
  );
}

export default BillsPage;
