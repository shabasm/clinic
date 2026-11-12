import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { errorMessage, formatId } from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import { printReceiptElement } from "../components/printReceipt";
import ReceiptPrint from "../components/ReceiptPrint";
import { getBill } from "../services/pharmacyApi";

function BillDetails() {
  const { id } = useParams();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const receiptRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    getBill(id)
      .then((data) => {
        if (!isMounted) return;
        setBill(data);
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
  }, [id]);

  const handlePrint = () => {
    printReceiptElement(receiptRef.current, formatId("BILL", bill?.id));
  };

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4 pharmacy-no-print">
          <div>
            <h1 className="mb-1">Pharmacy Receipt</h1>
            <p className="mb-0 text-secondary">
              {bill ? `Receipt for ${formatId("BILL", bill.id)}` : "Receipt details"}
            </p>
          </div>
          <div className="d-flex gap-2">
            <Link to="/pharmacy/bills" className="btn btn-outline-secondary">
              Back to Bills
            </Link>
            {bill && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrint}
              >
                Print Receipt
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="alert alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-muted p-4 text-center">Loading receipt...</div>
        ) : bill ? (
          <div className="card shadow-sm p-4">
            <ReceiptPrint ref={receiptRef} bill={bill} />
          </div>
        ) : (
          <div className="empty">Receipt not found.</div>
        )}
      </main>
    </>
  );
}

export default BillDetails;
