/* pages/lab/LabBills.jsx: lab billing records and receipts (spec 13, 16.15).
   Mirrors the old lab/bills.html + bills.js. */
import { useCallback, useEffect, useMemo, useState } from "react";
import ReceiptModal from "../../components/ReceiptModal";
import StatusBadge from "../../components/StatusBadge";
import { errorMessage } from "../../services/api";
import { getBills, getOrders } from "../../services/labServices";
import { billCode, dayOf, fmtDate, fmtMoney, orderCode, patientCode } from "../../utils/format";

export default function LabBills() {
  const [bills, setBills] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", date: "" });
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const [b, o] = await Promise.all([getBills(), getOrders()]);
      setBills(b);
      setOrders(o);
    } catch (err) {
      setError(errorMessage(err, "Could not load lab bills."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...bills].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    [bills]
  );

  const filtered = sorted.filter((b) => {
    if (filters.date && dayOf(b.created_at) !== filters.date) return false;
    const q = filters.q.trim().toLowerCase();
    if (q) {
      const haystack = [billCode(b.id), b.patient_name, patientCode(b.patient), orderCode(b.lab_order)]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const open = bills.find((b) => b.id === openId) || null;
  // the bill doesn't carry the patient's phone; take it from the matching order
  const phone = open ? orders.find((o) => o.id === open.lab_order)?.patient_phone : "";

  return (
    <>
      <header className="page-header">
        <h1 className="mb-1">Laboratory Billing</h1>
        <p className="mb-0">Receipt records for all billed diagnostic laboratory orders.</p>
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
                placeholder="Bill ID, patient name, ID, or order ID…"
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
                  <th>Bill ID</th>
                  <th>Date &amp; time</th>
                  <th>Patient</th>
                  <th>Lab order ID</th>
                  <th className="text-center">Tests</th>
                  <th className="text-end">Total amount</th>
                  <th>Status</th>
                  <th className="text-end" style={{ width: 140 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="8" className="empty">Loading bills…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan="8" className="empty">No laboratory bills found.</td></tr>
                )}
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td><span className="badge text-bg-light border fs-6">{billCode(b.id)}</span></td>
                    <td>
                      <strong>{fmtDate(dayOf(b.created_at))}</strong>
                      <span className="text-secondary small d-block">
                        {new Date(b.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </td>
                    <td>
                      <strong>{b.patient_name}</strong>
                      <span className="text-secondary small d-block">{patientCode(b.patient)}</span>
                    </td>
                    <td><span className="badge text-bg-light border">{orderCode(b.lab_order)}</span></td>
                    <td className="text-center"><span className="badge text-bg-primary fs-6">{(b.items || []).length}</span></td>
                    <td className="text-end fw-bold text-primary">{fmtMoney(b.total)}</td>
                    <td><StatusBadge status={b.payment_status} /></td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOpenId(b.id)}>
                        View receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ReceiptModal show={!!open} onClose={() => setOpenId(null)} bill={open} phone={phone} />
    </>
  );
}
