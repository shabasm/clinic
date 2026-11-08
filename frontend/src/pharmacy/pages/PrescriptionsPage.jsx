import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage, formatDate, formatId } from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = todayStr();

  // If date=all is given, or if filtering for Pending/Partially Dispensed without an explicit date,
  // show all dates so pending prescriptions from previous days are fully visible.
  // Otherwise default to todayStr() for fresh visits.
  const [dateFilter, setDateFilter] = useState(() => {
    if (dateParam === "all") return "";
    if (dateParam === "today") return today;
    if (dateParam) return dateParam;
    if (statusFilter === "Pending" || statusFilter === "Partially Dispensed") return "";
    return today;
  });

  // Sync dateFilter when searchParams change (e.g. clicking widgets/links)
  useEffect(() => {
    const d = searchParams.get("date");
    const s = searchParams.get("status");
    if (d === "all") {
      setDateFilter("");
    } else if (d === "today") {
      setDateFilter(todayStr());
    } else if (d) {
      setDateFilter(d);
    } else if (s === "Pending" || s === "Partially Dispensed") {
      setDateFilter("");
    }
  }, [searchParams]);

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
    if (val === "Pending" || val === "Partially Dispensed") {
      newParams.date = "all";
      setDateFilter("");
    } else if (dateFilter) {
      newParams.date = dateFilter;
    }
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
                to="/pharmacy/prescriptions?status=Pending&date=all"
                onClick={() => setDateFilter("")}
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
                onClick={() => setDateFilter("")}
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
                onClick={() => setDateFilter(today)}
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
