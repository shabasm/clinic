import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage, formatDate, formatId, formatMoney } from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import { badgeColor, getDashboard, getPrescriptions } from "../services/pharmacyApi";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function PrescriptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [prescriptions, setPrescriptions] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [billsToday, setBillsToday] = useState(null);
  const statusFilter = searchParams.get("status") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = todayStr();

  const loadPrescriptions = (searchTerm, statusTerm) => {
    const params = {};
    if (searchTerm?.trim()) params.search = searchTerm.trim();
    if (statusTerm) params.status = statusTerm;
    getPrescriptions(params)
      .then((data) => {
        const sorted = data
          .slice()
          .sort((a, b) => Number(b.status === "Pending") - Number(a.status === "Pending"));
        setPrescriptions(sorted);
        setLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    const params = {};
    if (statusFilter) params.status = statusFilter;

    Promise.all([getPrescriptions(params), getDashboard()])
      .then(([presData, dashData]) => {
        if (!isMounted) return;
        const sorted = presData
          .slice()
          .sort((a, b) => Number(b.status === "Pending") - Number(a.status === "Pending"));
        setPrescriptions(sorted);
        setBillsToday(dashData.bills_today ?? 0);
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

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadPrescriptions(search, statusFilter);
  };

  const handleStatusChange = (val) => {
    const newParams = {};
    if (val) newParams.status = val;
    setSearchParams(newParams);
  };

  // Compute stats from full prescriptions list (before date/search filter)
  const statPending = prescriptions.filter((p) => p.status === "Pending").length;
  const statPartial = prescriptions.filter((p) => p.status === "Partially Dispensed").length;
  const statDispensedToday = prescriptions.filter(
    (p) => p.status === "Dispensed" && (p.date || "").startsWith(today)
  ).length;

  // Apply search + date filter for table display
  const filtered = prescriptions.filter((p) => {
    if (dateFilter && (p.date || "") !== dateFilter) return false;
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
            Prescriptions sent by doctors. Create a bill, collect payment, then dispense.
          </p>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {/* Stats row */}
        {!loading && (
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <Link
                to="/pharmacy/prescriptions?status=Pending"
                className="text-decoration-none"
              >
                <div className="card stat-card h-100">
                  <div className="card-body">
                    <div className="small text-secondary">Pending</div>
                    <div className="stat-num">{statPending}</div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link
                to="/pharmacy/prescriptions?status=Partially%20Dispensed"
                className="text-decoration-none"
              >
                <div className="card stat-card h-100">
                  <div className="card-body">
                    <div className="small text-secondary">Partially Dispensed</div>
                    <div className="stat-num">{statPartial}</div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link
                to="/pharmacy/prescriptions?status=Dispensed"
                className="text-decoration-none"
              >
                <div className="card stat-card h-100">
                  <div className="card-body">
                    <div className="small text-secondary">Dispensed Today</div>
                    <div className="stat-num">{statDispensedToday}</div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link to="/pharmacy/bills" className="text-decoration-none">
                <div className="card stat-card h-100">
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
              onBlur={() => loadPrescriptions(search, statusFilter)}
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
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter prescriptions by date"
          />
          {dateFilter && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setDateFilter("")}
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
                  filtered.map((pres) => (
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
                        <Link
                          to={`/pharmacy/prescriptions/${pres.id}`}
                          className="btn btn-sm btn-primary"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
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
    </>
  );
}

export default PrescriptionsPage;
