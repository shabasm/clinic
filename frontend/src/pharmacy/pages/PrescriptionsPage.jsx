import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage, formatDate, formatId } from "../../admin/services/api";
import DispenseModal from "../components/DispenseModal";
import PharmacyNavbar from "../components/PharmacyNavbar";
import ReceiptModal from "../components/ReceiptModal";
import { badgeColor, getDashboard, getPrescriptions } from "../services/pharmacyApi";

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function PrescriptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [prescriptions, setPrescriptions] = useState([]);
  const [search, setSearch] = useState("");
  const [billsToday, setBillsToday] = useState(null);
  const statusFilter = searchParams.get("status") || "";
  const dateParam = searchParams.get("date");
  const openParam = searchParams.get("open");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [successBill, setSuccessBill] = useState(null);
  const [viewingReceiptBill, setViewingReceiptBill] = useState(null);

  // Active prescription modal id (null means closed)
  const [selectedRxId, setSelectedRxId] = useState(openParam || null);

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
      : dateParam
      ? dateParam
      : statusFilter === "Pending" || statusFilter === "Partially Dispensed"
      ? ""
      : today;

  const loadData = useCallback(() => {
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;

    Promise.all([getPrescriptions(params), getDashboard()])
      .then(([presData, dashData]) => {
        const sorted = presData
          .slice()
          .sort((a, b) => Number(b.status === "Pending") - Number(a.status === "Pending"));
        setPrescriptions(sorted);
        setBillsToday(dashData.bills_today ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadData();
  };

  const handleStatusChange = (val) => {
    const newParams = {};
    if (val) newParams.status = val;
    if (val === "Pending" || val === "Partially Dispensed") {
      newParams.date = "all";
      setUserDateFilter("");
    } else if (dateFilter) {
      newParams.date = dateFilter;
    }
    setSearchParams(newParams);
  };

  const handleCloseModal = () => {
    setSelectedRxId(null);
    if (searchParams.has("open")) {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
  };

  const handleDispenseSuccess = ({ bill, prescription }) => {
    handleCloseModal();
    loadData();
    if (bill) {
      setSuccessBill(bill);
      setSuccess(
        `Dispensing complete! Pharmacy Bill ${formatId(
          "BILL",
          bill.id
        )} generated. Prescription Status: ${prescription?.status || "Dispensed"}.`
      );
    } else if (prescription?.status === "Declined") {
      setSuccessBill(null);
      setSuccess(`Prescription ${formatId("RX", prescription.id)} marked as Declined.`);
    } else {
      setSuccessBill(null);
      setSuccess("Prescription processed successfully.");
    }
  };

  // Compute stats from full prescriptions list (before date/search filter)
  const statPending = prescriptions.filter((p) => p.status === "Pending").length;
  const statPartial = prescriptions.filter((p) => p.status === "Partially Dispensed").length;
  const statDispensedToday = prescriptions.filter(
    (p) => p.status === "Dispensed" && (p.date || "").startsWith(today)
  ).length;

  // Apply search + date filter for table display
  const filtered = prescriptions.filter((p) => {
    const rxDate = (p.date || "").slice(0, 10);
    if (dateFilter && rxDate !== dateFilter) return false;
    if (!search) return true;
    const text =
      `${formatId("RX", p.id)} ${p.patient_name || ""} ${p.doctor_name || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Prescriptions</h1>
          <p className="mb-0">
            Review patient prescriptions, collect payment, and dispense medicines in one step.
          </p>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success d-flex justify-content-between align-items-center mb-4" role="alert">
            <div>{success}</div>
            {successBill && (
              <button
                type="button"
                className="btn btn-sm btn-outline-success ms-3"
                onClick={() => setViewingReceiptBill(successBill)}
              >
                View / Print Receipt
              </button>
            )}
          </div>
        )}

        {/* Stats row */}
        {!loading && (
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <Link
                to="/pharmacy/prescriptions?status=Pending&date=all"
                onClick={() => setUserDateFilter("")}
                className="text-decoration-none"
              >
                <div
                  className={`card stat-card h-100 cursor-pointer ${
                    statusFilter === "Pending" && !dateFilter ? "border-primary" : ""
                  }`}
                  title="Click to view all pending prescriptions"
                >
                  <div className="card-body">
                    <div className="small text-secondary">Pending</div>
                    <div className="stat-num">{statPending}</div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link
                to="/pharmacy/prescriptions?status=Partially%20Dispensed&date=all"
                onClick={() => setUserDateFilter("")}
                className="text-decoration-none"
              >
                <div
                  className={`card stat-card h-100 cursor-pointer ${
                    statusFilter === "Partially Dispensed" && !dateFilter ? "border-primary" : ""
                  }`}
                  title="Click to view all partially dispensed prescriptions"
                >
                  <div className="card-body">
                    <div className="small text-secondary">Partially Dispensed</div>
                    <div className="stat-num">{statPartial}</div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link
                to="/pharmacy/prescriptions?status=Dispensed&date=today"
                onClick={() => setUserDateFilter(today)}
                className="text-decoration-none"
              >
                <div
                  className={`card stat-card h-100 cursor-pointer ${
                    statusFilter === "Dispensed" && dateFilter === today ? "border-primary" : ""
                  }`}
                  title="Click to view prescriptions dispensed today"
                >
                  <div className="card-body">
                    <div className="small text-secondary">Dispensed Today</div>
                    <div className="stat-num">{statDispensedToday}</div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link to="/pharmacy/bills?date=today" className="text-decoration-none">
                <div className="card stat-card h-100 cursor-pointer">
                  <div className="card-body">
                    <div className="small text-secondary">Bills Today</div>
                    <div className="stat-num">{billsToday ?? "—"}</div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Filters toolbar */}
        <form onSubmit={handleSearchSubmit} className="d-flex flex-wrap toolbar mb-3 gap-2">
          <div className="input-group w-auto flex-grow-1">
            <span className="input-group-text">Search</span>
            <input
              className="form-control"
              type="search"
              placeholder="Patient name, phone or prescription ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={loadData}
            />
          </div>
          <select
            className="form-select w-auto"
            aria-label="Filter prescription status"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Partially Dispensed">Partially Dispensed</option>
            <option value="Dispensed">Dispensed</option>
            <option value="Declined">Declined</option>
          </select>
          <input
            type="date"
            className="form-control w-auto"
            aria-label="Filter by date"
            value={dateFilter}
            onChange={(e) => setUserDateFilter(e.target.value)}
            title="Filter prescriptions by date"
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
        </form>

        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Prescription</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-muted p-3">
                      Loading prescriptions...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((pres) => {
                    const canDispense =
                      pres.status === "Pending" || pres.status === "Partially Dispensed";

                    return (
                      <tr key={pres.id}>
                        <td className="fw-semibold">{formatId("RX", pres.id)}</td>
                        <td>{pres.patient_name || "—"}</td>
                        <td>{pres.doctor_name || "—"}</td>
                        <td>{formatDate(pres.date)}</td>
                        <td>{pres.items?.length || 0}</td>
                        <td>
                          <span className={`badge text-bg-${badgeColor(pres.status)}`}>
                            {pres.status}
                          </span>
                        </td>
                        <td className="text-end text-nowrap">
                          {canDispense ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => setSelectedRxId(pres.id)}
                            >
                              Dispense / Process
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setSelectedRxId(pres.id)}
                            >
                              View Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="empty" colSpan="7">
                      {search || statusFilter || dateFilter
                        ? "No matching prescriptions."
                        : "No prescriptions have been received yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Single Dispense / Details Modal */}
      {selectedRxId && (
        <DispenseModal
          prescriptionId={selectedRxId}
          onClose={handleCloseModal}
          onSuccess={handleDispenseSuccess}
        />
      )}

      {/* Receipt Modal for newly generated bill */}
      {viewingReceiptBill && (
        <ReceiptModal
          bill={viewingReceiptBill}
          onClose={() => setViewingReceiptBill(null)}
        />
      )}
    </>
  );
}

export default PrescriptionsPage;
