/* pages/lab/LabOrders.jsx: lab orders workbench: bill selected tests, start tests, enter results
   (spec 11.1, 13, 16.14). Mirrors the old lab/orders.html + orders.js. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "react-bootstrap";
import StatusBadge from "../../components/StatusBadge";
import ConfirmModal from "../../components/ConfirmModal";
import ReportModal from "../../components/ReportModal";
import { errorMessage } from "../../services/api";
import { billOrder, cancelItem, getOrders, saveResult, startItem } from "../../services/labServices";
import {
  ageOn, calculateOrderStatus, fmtDate, fmtMoney, orderCode, patientCode, today,
} from "../../utils/format";

const STATUSES = ["Recommended", "Selected", "Paid", "In Progress", "Completed", "Declined", "Cancelled"];
const EMPTY_RESULT = { result: "", reference_range: "", remarks: "" };

export default function LabOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "", date: "" });

  const [orderId, setOrderId] = useState(null); // order open in the manage modal
  const [picked, setPicked] = useState(() => new Set()); // test ids ticked for billing
  const [modalError, setModalError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [reportOrderId, setReportOrderId] = useState(null);

  const [resultItem, setResultItem] = useState(null); // test whose result is being entered
  const [form, setForm] = useState(EMPTY_RESULT);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPageError("");
      const o = await getOrders();
      setOrders(o);
    } catch (err) {
      setPageError(errorMessage(err, "Could not load lab orders."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => orders.map((o) => ({ ...o, status: calculateOrderStatus(o.items) })),
    [orders]
  );
  const order = rows.find((o) => o.id === orderId) || null;
  const reportOrder = rows.find((o) => o.id === reportOrderId) || null;

  /* ---------- filtering ---------- */
  const filtered = rows.filter((o) => {
    if (filters.status && o.status !== filters.status) return false;
    if (filters.date && o.date !== filters.date) return false;
    const q = filters.q.trim().toLowerCase();
    if (q) {
      const haystack = [o.patient_name, o.doctor_name, orderCode(o.id), patientCode(o.patient)]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  /* ---------- order modal ---------- */
  const openOrder = (id) => {
    setOrderId(id);
    setPicked(new Set());
    setModalError("");
  };

  const togglePick = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const pickedItems = order ? order.items.filter((i) => picked.has(i.id)) : [];
  const pickedTotal = pickedItems.reduce((sum, i) => sum + (Number(i.cost) || 0), 0);

  const activeItems = order ? order.items.filter((i) => i.status !== "Cancelled") : [];
  const allDone = activeItems.length > 0 && activeItems.every((i) => i.status === "Completed");

  const collectAndBill = () => {
    if (!pickedItems.length) return;
    setConfirm({
      title: "Confirm payment and bill tests",
      okText: "Payment received",
      body:
        `Confirm that ${fmtMoney(pickedTotal)} has been received from ${order.patient_name} ` +
        `for ${pickedItems.length} test(s)?\n\nSelected: ${pickedItems.map((i) => i.test_name).join(", ")}\n\n` +
        `This creates one lab bill and moves the tests to In Progress.`,
      onOk: async () => {
        await billOrder(order.id, pickedItems.map((i) => i.id));
        setPicked(new Set());
        await load();
        setNotice(`Lab bill created for ${fmtMoney(pickedTotal)}. ${pickedItems.length} test(s) are now In Progress.`);
      },
    });
  };

  const cancelTest = (item) =>
    setConfirm({
      title: "Cancel test",
      okText: "Cancel test",
      danger: true,
      body: `Cancel "${item.test_name}"?\n\nThe patient will not have this test or be billed for it.`,
      onOk: async () => {
        await cancelItem(item.id);
        setPicked((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        await load();
      },
    });

  const startTest = async (item) => {
    setModalError("");
    try {
      await startItem(item.id);
      await load();
    } catch (err) {
      setModalError(errorMessage(err));
    }
  };

  /* ---------- enter result modal ---------- */
  const openResult = (item) => {
    setResultItem(item);
    setForm({ ...EMPTY_RESULT, reference_range: item.normal_values || "" });
    setFormErrors({});
  };

  const submitResult = async (e) => {
    e.preventDefault();
    const result = form.result.trim();
    const range = form.reference_range.trim();
    const remarks = form.remarks.trim();
    const errs = {};
    if (result.length < 1 || result.length > 200) errs.result = "Result must be between 1 and 200 characters.";
    if (range.length < 1 || range.length > 200) errs.reference_range = "Reference range must be between 1 and 200 characters.";
    if (remarks.length > 300) errs.remarks = "Remarks must not exceed 300 characters.";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    const testName = resultItem.test_name;
    setSaving(true);
    try {
      await saveResult({ order_item: resultItem.id, result, reference_range: range, remarks });
      setResultItem(null);
      await load();
      setNotice(`Result for ${testName} saved.`);
    } catch (err) {
      setFormErrors({ _form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => setFilters({ q: "", status: "", date: "" });
  const age = order ? ageOn(order.patient_date_of_birth) : null;

  return (
    <>
      <header className="page-header">
        <h1 className="mb-1">Laboratory Orders</h1>
        <p className="mb-0">Process doctor recommendations, bill selected tests, and manage diagnostic workflows.</p>
      </header>

      {notice && (
        <div className="alert alert-success alert-dismissible" role="status">
          {notice}
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setNotice("")} />
        </div>
      )}
      {pageError && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>{pageError}</span>
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
                placeholder="Patient name, ID, or order ID…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select
                className="form-select w-auto"
                aria-label="Filter by status"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className="input-group w-auto">
                <span className="input-group-text">Date</span>
                <input
                  className="form-control"
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                />
              </div>
              <button className="btn btn-outline-secondary" type="button" onClick={resetFilters}>Reset</button>
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
                  <th>Date</th>
                  <th>Order ID</th>
                  <th>Patient</th>
                  <th>Prescribed by</th>
                  <th>Tests overview</th>
                  <th>Status</th>
                  <th className="text-end" style={{ width: 150 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="7" className="empty">Loading orders…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan="7" className="empty">No lab orders match the criteria.</td></tr>
                )}
                {filtered.map((o) => {
                  const names = (o.items || []).map((i) => i.test_name).join(", ");
                  return (
                    <tr key={o.id}>
                      <td><strong>{fmtDate(o.date)}</strong></td>
                      <td><span className="badge text-bg-light border fs-6">{orderCode(o.id)}</span></td>
                      <td>
                        <strong>{o.patient_name}</strong>
                        <span className="text-secondary small d-block">{patientCode(o.patient)}</span>
                      </td>
                      <td>{o.doctor_name}</td>
                      <td>
                        <span className="badge text-bg-light border">
                          {o.items.length} test{o.items.length === 1 ? "" : "s"}
                        </span>
                        <div className="small text-secondary text-truncate mt-1" style={{ maxWidth: 250 }} title={names}>
                          {names}
                        </div>
                      </td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => openOrder(o.id)}>
                          Manage order
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

      {/* ---------- Manage order ---------- */}
      <Modal show={!!order} onHide={() => setOrderId(null)} size="xl" centered scrollable>
        {order && (
          <>
            <Modal.Header closeButton>
              <div>
                <Modal.Title as="h2" className="fs-5 mb-0">Lab order: {orderCode(order.id)}</Modal.Title>
                <div className="small text-secondary">
                  Ordered by {order.doctor_name} on {fmtDate(order.date)}
                </div>
              </div>
            </Modal.Header>
            <Modal.Body>
              {modalError && <div className="alert alert-danger" role="alert">{modalError}</div>}

              <div className="card bg-light bg-opacity-50 mb-3">
                <div className="card-body p-3">
                  <div className="row g-2 small">
                    <div className="col-sm-4">
                      <strong>Patient:</strong> {order.patient_name} ({patientCode(order.patient)})<br />
                      <strong>Age / Gender:</strong> {age !== null ? `${age} yrs` : "—"} · {order.patient_gender || "—"}
                    </div>
                    <div className="col-sm-4">
                      <strong>Phone:</strong> {order.patient_phone || "—"}<br />
                      <strong>Doctor:</strong> {order.doctor_name}
                    </div>
                    <div className="col-sm-4 text-sm-end">
                      <strong>Order date:</strong> {fmtDate(order.date)}<br />
                      <strong>Overall status:</strong> <StatusBadge status={order.status} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="card mb-3">
                <div className="card-header bg-white fw-bold d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span>Order diagnostic tests</span>
                  <span className="d-flex align-items-center gap-3">
                    <span className="small text-secondary fw-normal">
                      Tick recommended tests to bill, or process paid tests
                    </span>
                    {allDone && (
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setReportOrderId(order.id)}>
                        Combined report
                      </button>
                    )}
                  </span>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: 40 }} className="text-center">Select</th>
                          <th>Test name</th>
                          <th>Reference range</th>
                          <th className="text-end" style={{ width: 100 }}>Cost</th>
                          <th>Status</th>
                          <th className="text-end" style={{ minWidth: 180 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.length === 0 && (
                          <tr><td colSpan="6" className="text-secondary small p-3 text-center">No tests in this order.</td></tr>
                        )}
                        {order.items.map((item) => (
                          <tr key={item.id} className={picked.has(item.id) ? "table-primary" : ""}>
                            <td className="text-center">
                              {item.status === "Recommended" ? (
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  aria-label={`Select ${item.test_name}`}
                                  checked={picked.has(item.id)}
                                  onChange={() => togglePick(item.id)}
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  disabled
                                  aria-label={`${item.test_name} already processed`}
                                  checked={["Paid", "In Progress", "Completed"].includes(item.status)}
                                  readOnly
                                />
                              )}
                            </td>
                            <td><strong>{item.test_name}</strong></td>
                            <td><span className="small text-secondary">{item.normal_values || "—"}</span></td>
                            <td className="text-end fw-semibold">{fmtMoney(item.cost)}</td>
                            <td><StatusBadge status={item.status} /></td>
                            <td className="text-end">
                              {item.status === "Recommended" && (
                                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => cancelTest(item)}>
                                  Opt out / cancel
                                </button>
                              )}
                              {item.status === "Paid" && (
                                <>
                                  <button type="button" className="btn btn-sm btn-info text-white me-1" onClick={() => startTest(item)}>
                                    Start test
                                  </button>
                                  <button type="button" className="btn btn-sm btn-primary" onClick={() => openResult(item)}>
                                    Enter result
                                  </button>
                                </>
                              )}
                              {item.status === "In Progress" && (
                                <button type="button" className="btn btn-sm btn-primary" onClick={() => openResult(item)}>
                                  Enter result
                                </button>
                              )}
                              {item.status === "Completed" && (
                                <Link to={`/lab/results?item=${item.id}`} className="btn btn-sm btn-outline-secondary">
                                  View result
                                </Link>
                              )}
                              {item.status === "Cancelled" && <span className="text-secondary small">Cancelled</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card border-primary bg-primary bg-opacity-10 p-3">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div>
                    <strong>Selected tests for billing:</strong>{" "}
                    <span className="ms-1 text-secondary">
                      {pickedItems.length
                        ? `${pickedItems.length} test(s) selected: ${pickedItems.map((i) => i.test_name).join(", ")}`
                        : "None selected yet"}
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <div className="fs-4 fw-bold text-primary">{fmtMoney(pickedTotal)}</div>
                    <button type="button" className="btn btn-primary" disabled={!pickedItems.length} onClick={collectAndBill}>
                      Collect payment &amp; bill
                    </button>
                  </div>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <button type="button" className="btn btn-secondary" onClick={() => setOrderId(null)}>Close</button>
            </Modal.Footer>
          </>
        )}
      </Modal>

      {/* ---------- Enter result ---------- */}
      <Modal show={!!resultItem} onHide={() => !saving && setResultItem(null)} centered>
        {resultItem && order && (
          <form onSubmit={submitResult} noValidate>
            <Modal.Header closeButton={!saving}>
              <Modal.Title as="h2" className="fs-5">Enter diagnostic result</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {formErrors._form && <div className="alert alert-danger" role="alert">{formErrors._form}</div>}

              <div className="card bg-light p-2 mb-3 small">
                <div><strong>Test:</strong> <span className="text-primary fw-bold">{resultItem.test_name}</span></div>
                <div><strong>Patient:</strong> {order.patient_name} ({patientCode(order.patient)})</div>
                <div><strong>Order ref:</strong> {orderCode(order.id)}</div>
              </div>

              <Field id="result" label="Result value" required error={formErrors.result}
                help="Diagnostic test finding (1 to 200 characters).">
                <input id="result" className={`form-control ${formErrors.result ? "is-invalid" : ""}`}
                  maxLength={200} placeholder="e.g. 13.8 g/dL or 95 mg/dL"
                  value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
              </Field>

              <Field id="range" label="Reference range" required error={formErrors.reference_range}
                help="Normal reference interval (filled in from the test's normal values).">
                <input id="range" className={`form-control ${formErrors.reference_range ? "is-invalid" : ""}`}
                  maxLength={200}
                  value={form.reference_range} onChange={(e) => setForm({ ...form, reference_range: e.target.value })} />
              </Field>

              <Field id="remarks" label="Remarks" error={formErrors.remarks} help="Optional (up to 300 characters).">
                <textarea id="remarks" rows="2" maxLength={300}
                  className={`form-control ${formErrors.remarks ? "is-invalid" : ""}`}
                  placeholder="Optional notes, methodology, or technician observations…"
                  value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </Field>

              <div className="form-text small">The result is dated today when it is saved.</div>
            </Modal.Body>
            <Modal.Footer>
              <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setResultItem(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save result & complete"}
              </button>
            </Modal.Footer>
          </form>
        )}
      </Modal>

      <ConfirmModal dialog={confirm} onClose={() => setConfirm(null)} />
      <ReportModal
        show={!!reportOrder}
        onClose={() => setReportOrderId(null)}
        order={reportOrder}
        items={reportOrder ? reportOrder.items.filter((i) => i.status === "Completed") : []}
      />
    </>
  );
}

function Field({ id, label, required, error, help, children }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className={`form-label ${required ? "required" : ""}`}>{label}</label>
      {children}
      {error ? <div className="invalid-feedback d-block">{error}</div> : <div className="form-text small">{help}</div>}
    </div>
  );
}
