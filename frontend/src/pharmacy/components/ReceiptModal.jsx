import { useRef } from "react";
import { formatId } from "../../admin/services/api";
import { printReceiptElement } from "./printReceipt";
import ReceiptPrint from "./ReceiptPrint";

function ReceiptModal({ bill, onClose }) {
  const receiptRef = useRef(null);

  if (!bill) return null;

  const handlePrint = () => {
    printReceiptElement(receiptRef.current, formatId("BILL", bill.id));
  };

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Receipt — {formatId("BILL", bill.id)}</h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body p-3">
            <ReceiptPrint ref={receiptRef} bill={bill} />
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
            >
              Print Receipt
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReceiptModal;
