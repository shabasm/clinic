import { Modal } from "react-bootstrap";
import StatusBadge from "./StatusBadge";
import { ageOn, fmtDate, fmtDateTime, orderCode, patientCode } from "../utils/format";

/*
 * Consolidated lab report modal.
 * Accepts a `report` object from GET /api/lab/reports/<id>/
 * which contains: lab_order, patient_name, patient_gender, patient_date_of_birth,
 * patient_phone, doctor_name, status, released_at, released_by_name,
 * summary_notes, results[]
 *
 * Also accepts an `order` + `items[]` (legacy path from LabOrders manage modal).
 */
export default function ReportModal({ show, onClose, report, order, items }) {
  // Consolidated report path (LabResults page)
  if (report) {
    const results = report.results || [];
    const technicians = [...new Set(results.map((r) => r.technician_name).filter(Boolean))];
    const lastDate = results.map((r) => r.result_date).filter(Boolean).sort().pop();
    const age = ageOn(report.patient_date_of_birth);

    return (
      <Modal show={show} onHide={onClose} centered size="lg">
        <Modal.Header closeButton className="d-print-none">
          <Modal.Title as="h2" className="fs-5">Laboratory Report</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          <div className="print-area">
            <div className="report-header text-center mb-3">
              <h4 className="text-primary mb-0">✚ CareFlow Diagnostic Lab</h4>
              <div className="small text-secondary">CareFlow Clinic · Laboratory Report</div>
              <div className="small mt-2">
                Order {orderCode(report.lab_order)} · Reported {fmtDate(lastDate)}
              </div>
            </div>

            <div className="card bg-light border-0 p-3 mb-3 small">
              <div className="row g-2">
                <div className="col-sm-6">
                  <div><strong>Patient:</strong> {report.patient_name} ({patientCode(report.lab_order)})</div>
                  <div><strong>Age / Gender:</strong> {age !== null ? `${age} yrs` : "—"} / {report.patient_gender || "—"}</div>
                </div>
                <div className="col-sm-6">
                  <div><strong>Phone:</strong> {report.patient_phone || "—"}</div>
                  <div><strong>Referred by:</strong> {report.doctor_name}</div>
                </div>
              </div>
            </div>

            <table className="table table-sm mb-3">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Result</th>
                  <th>Reference range</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 && (
                  <tr><td colSpan="4" className="text-secondary">No results recorded yet.</td></tr>
                )}
                {results.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.test_name}</strong></td>
                    <td className="fw-bold text-primary">{r.result}</td>
                    <td className="text-secondary">{r.reference_range || "—"}</td>
                    <td className="small">{r.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {report.summary_notes && (
              <div className="alert alert-light border small mb-3">
                <strong>Summary notes:</strong> {report.summary_notes}
              </div>
            )}

            <div className="border-top pt-2 small text-secondary d-flex justify-content-between flex-wrap gap-2">
              <span>Technician: {technicians.join(", ") || "—"}</span>
              {report.status === "Released" && report.released_at && (
                <span>Released: {fmtDateTime(report.released_at)} by {report.released_by_name || "—"}</span>
              )}
              <span>This is a computer-generated report.</span>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="d-print-none">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
          <span title="Available when the doctor module is ready to receive released reports.">
            <button type="button" className="btn btn-outline-success" disabled>
              Release to doctor
            </button>
          </span>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!results.length}>
            🖨 Print report
          </button>
        </Modal.Footer>
      </Modal>
    );
  }

  // Legacy path: called from LabOrders manage modal with order + items[]
  if (!order) return null;
  const done = (items || []).filter((i) => i.result_details);
  const technicians = [...new Set(done.map((i) => i.result_details.technician_name).filter(Boolean))];
  const lastDate = done.map((i) => i.result_details.result_date).filter(Boolean).sort().pop();
  const age = ageOn(order.patient_date_of_birth);

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton className="d-print-none">
        <Modal.Title as="h2" className="fs-5">Laboratory Report</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <div className="print-area">
          <div className="report-header text-center mb-3">
            <h4 className="text-primary mb-0">✚ CareFlow Diagnostic Lab</h4>
            <div className="small text-secondary">CareFlow Clinic · Laboratory Report</div>
            <div className="small mt-2">
              Order {orderCode(order.id)} · Reported {fmtDate(lastDate)}
            </div>
          </div>

          <div className="card bg-light border-0 p-3 mb-3 small">
            <div className="row g-2">
              <div className="col-sm-6">
                <div><strong>Patient:</strong> {order.patient_name} ({patientCode(order.patient)})</div>
                <div><strong>Age / Gender:</strong> {age !== null ? `${age} yrs` : "—"} / {order.patient_gender || "—"}</div>
              </div>
              <div className="col-sm-6">
                <div><strong>Phone:</strong> {order.patient_phone || "—"}</div>
                <div><strong>Referred by:</strong> {order.doctor_name}</div>
              </div>
            </div>
          </div>

          <table className="table table-sm mb-3">
            <thead>
              <tr>
                <th>Test</th>
                <th>Result</th>
                <th>Reference range</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {done.length === 0 && (
                <tr><td colSpan="4" className="text-secondary">No results entered yet.</td></tr>
              )}
              {done.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.test_name}</strong></td>
                  <td className="fw-bold">{i.result_details.result}</td>
                  <td className="text-secondary">{i.result_details.reference_range || "—"}</td>
                  <td className="small">{i.result_details.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-top pt-2 small text-secondary d-flex justify-content-between">
            <span>Technician: {technicians.join(", ") || "—"}</span>
            <span>This is a computer-generated report.</span>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="d-print-none">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!done.length}>
          🖨 Print report
        </button>
      </Modal.Footer>
    </Modal>
  );
}
