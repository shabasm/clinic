/* pages/lab/LabResults.jsx
   Lists consolidated lab reports, one row per LabOrder, showing all tests and results
   in a single combined report. */
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusBadge from "../../components/StatusBadge";
import ReportModal from "../../components/ReportModal";
import { errorMessage } from "../../services/api";
import { getReports } from "../../services/labServices";
import { fmtDate, orderCode } from "../../utils/format";

export default function LabResults() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", date: "" });
  const [openReport, setOpenReport] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const r = await getReports();
      setReports(r);
    } catch (err) {
      setError(errorMessage(err, "Could not load reports."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () => [...reports].sort((a, b) => (b.order_date || "").localeCompare(a.order_date || "") || b.id - a.id),
    [reports]
  );

  const filtered = sorted.filter((r) => {
    if (filters.date && r.order_date !== filters.date) return false;
    const q = filters.q.trim().toLowerCase();
    if (q) {
      const haystack = [
        orderCode(r.lab_order),
        r.patient_name,
        r.doctor_name,
        r.status,
      ].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <header className="page-header">
        <h1 className="mb-1">Results &amp; Reports</h1>
        <p className="mb-0">Consolidated lab reports per order. Open one to view and print all test results together.</p>
      </header>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm btn-outline-danger" onClick={load}>Try again</button>
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body p-3">
          <div className="d-flex flex-wrap justify-content-between align-items-center toolbar">
            <div className="input-group w-auto" style={{ minWidth: 260 }}>
              <span className="input-group-text">Search</span>
              <input
                className="form-control"
                type="search"
                placeholder="Order ID, patient name, doctor…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </div>
            <div className="d-flex gap-2 align-items-center">
              <div className="input-group w-auto">
                <span className="input-group-text">Date</span>
                <input
                  className="form-control"
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                />
              </div>
              <button className="btn btn-outline-secondary" type="button" onClick={() => setFilters({ q: "", date: "" })}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Order date</th>
                  <th>Order ID</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Tests</th>
                  <th>Report status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="7" className="empty">Loading reports…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan="7" className="empty">No reports found.</td></tr>
                )}
                {filtered.map((r) => {
                  const results = r.results || [];
                  const testNames = results.map((res) => res.test_name).join(", ");
                  return (
                    <tr key={r.id}>
                      <td><strong>{fmtDate(r.order_date)}</strong></td>
                      <td><span className="badge text-bg-light border fs-6">{orderCode(r.lab_order)}</span></td>
                      <td>
                        <strong>{r.patient_name}</strong>
                      </td>
                      <td>{r.doctor_name}</td>
                      <td>
                        <span className="badge text-bg-light border me-1">{results.length} test{results.length !== 1 ? "s" : ""}</span>
                        <div className="small text-secondary text-truncate mt-1" style={{ maxWidth: 220 }} title={testNames}>
                          {testNames || "—"}
                        </div>
                      </td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => setOpenReport(r)}
                        >
                          View / print
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ReportModal
        show={!!openReport}
        onClose={() => setOpenReport(null)}
        report={openReport}
      />
    </>
  );
}
