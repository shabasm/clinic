import { Modal } from "react-bootstrap";
import { billCode, fmtDateTime, fmtMoney, orderCode, patientCode } from "../utils/format";

/* A printable lab bill receipt. `phone` is passed in because the bill itself doesn't carry it. */
export default function ReceiptModal({ show, onClose, bill, phone }) {
  if (!bill) return null;
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton className="d-print-none">
        <Modal.Title as="h2" className="fs-5">Laboratory Bill Receipt</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <div className="print-area">
          <div className="receipt-header text-center mb-3">
            <h4 className="text-primary mb-0">✚ CareFlow Diagnostic Lab</h4>
            <div className="small text-secondary">CareFlow Clinic · Official Laboratory Receipt</div>
            <div className="fw-bold mt-2 fs-5">{billCode(bill.id)}</div>
            <div className="small text-secondary">{fmtDateTime(bill.created_at)}</div>
          </div>

          <div className="card bg-light border-0 p-3 mb-3 small">
            <div><strong>Patient:</strong> {bill.patient_name} ({patientCode(bill.patient)})</div>
            <div><strong>Phone:</strong> {phone || "—"}</div>
            <div><strong>Lab order ref:</strong> {orderCode(bill.lab_order)}</div>
          </div>

          <table className="table table-sm small mb-3">
            <thead className="table-light">
              <tr>
                <th>Diagnostic test</th>
                <th className="text-end" style={{ width: 100 }}>Rate</th>
                <th className="text-end" style={{ width: 100 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(bill.items || []).map((it) => (
                <tr key={it.id}>
                  <td><strong>{it.test_name}</strong></td>
                  <td className="text-end">{fmtMoney(it.unit_price)}</td>
                  <td className="text-end fw-semibold">{fmtMoney(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-top pt-2 mb-3">
            <div className="d-flex justify-content-between mb-1">
              <span>Subtotal:</span>
              <span>{fmtMoney(bill.subtotal)}</span>
            </div>
            <div className="d-flex justify-content-between fs-5 fw-bold text-primary">
              <span>{bill.payment_status === "Paid" ? "Total paid:" : "Total due:"}</span>
              <span>{fmtMoney(bill.total)}</span>
            </div>
          </div>

          <div className="text-center pt-2 border-top small text-secondary">
            <div className="mb-1">
              <span className={`badge ${bill.payment_status === "Paid" ? "text-bg-success" : "text-bg-warning"}`}>
                {bill.payment_status.toUpperCase()}
              </span>{" "}
              {bill.paid_at ? `Paid at ${fmtDateTime(bill.paid_at)}` : ""}
            </div>
            <div>Please keep this receipt for your records.</div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="d-print-none">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>🖨 Print receipt</button>
      </Modal.Footer>
    </Modal>
  );
}
