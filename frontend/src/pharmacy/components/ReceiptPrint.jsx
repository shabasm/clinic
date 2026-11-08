import React from "react";
import { formatDate, formatId, formatMoney } from "../../admin/services/api";

const ReceiptPrint = React.forwardRef(function ReceiptPrint({ bill }, ref) {
  if (!bill) return null;

  const isPaid = bill.payment_status === "Paid";

  return (
    <div ref={ref} className="pharmacy-receipt-container print-area">
      <div className="pharmacy-receipt-header text-center">
        <h2 className="h4 fw-bold mb-1">✚ CareFlow Clinic</h2>
        <div className="text-secondary small">Pharmacy Dispensing & Payment Receipt</div>
      </div>

      {!isPaid && (
        <div className="pharmacy-receipt-unpaid-notice" role="alert">
          Unpaid — not a payment receipt
        </div>
      )}

      <div className="pharmacy-receipt-meta row g-2">
        <div className="col-6">
          <div>
            <strong className="text-secondary">Bill No:</strong> {formatId("BILL", bill.id)}
          </div>
          <div>
            <strong className="text-secondary">Prescription:</strong> {formatId("RX", bill.prescription)}
          </div>
          <div>
            <strong className="text-secondary">Date:</strong> {formatDate(bill.created_at)}
          </div>
        </div>
        <div className="col-6 text-end">
          <div>
            <strong className="text-secondary">Patient:</strong> {bill.patient_name || formatId("PAT", bill.patient)}
          </div>
          <div>
            <strong className="text-secondary">Status:</strong>{" "}
            <span className={isPaid ? "text-success fw-bold" : "text-warning fw-bold"}>
              {bill.payment_status}
            </span>
          </div>
          {isPaid && bill.paid_at && (
            <div>
              <strong className="text-secondary">Paid on:</strong> {formatDate(bill.paid_at)}
            </div>
          )}
        </div>
      </div>

      <div className="table-responsive my-3">
        <table className="table table-sm mb-0">
          <thead>
            <tr>
              <th>Medicine</th>
              <th className="text-center">Qty</th>
              <th className="text-end">Price</th>
              <th className="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(bill.items || []).map((item) => (
              <tr key={item.id}>
                <td>{item.medicine_name}</td>
                <td className="text-center">{item.quantity}</td>
                <td className="text-end">{formatMoney(item.unit_price)}</td>
                <td className="text-end">{formatMoney(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="3" className="text-end pt-3">
                Subtotal:
              </th>
              <td className="text-end pt-3">{formatMoney(bill.subtotal)}</td>
            </tr>
            <tr>
              <th colSpan="3" className="text-end fw-bold fs-6">
                Total:
              </th>
              <td className="text-end fw-bold fs-6 text-primary">{formatMoney(bill.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="pharmacy-receipt-footer">
        <div>Please retain this receipt for your personal health and billing records.</div>
        <div>CareFlow Health Management System</div>
      </div>
    </div>
  );
});

export default ReceiptPrint;
