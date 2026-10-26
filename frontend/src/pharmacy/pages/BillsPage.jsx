import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import { badgeColor, getBills } from "../services/pharmacyApi";

function BillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState("");
  const statusFilter = searchParams.get("payment_status") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const params = {};
    if (statusFilter) params.payment_status = statusFilter;
    getBills(params)
      .then((data) => {
        if (!isMounted) return;
        setBills(data);
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

  const handleStatusChange = (val) => {
    const newParams = {};
    if (val) newParams.payment_status = val;
    setSearchParams(newParams);
  };

  // Client-side search by patient or bill ID
  const filtered = bills.filter((b) => {
    const text = `${formatId("BILL", b.id)} ${b.patient_name || ""} ${formatId(
      "PAT",
      b.patient
    )} ${formatId("RX", b.prescription)}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Bills</h1>
          <p className="mb-0">
            Pharmacy bills. Payment status is separate from prescription status.
          </p>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1">
            <span className="input-group-text">Search</span>
            <input
              className="form-control"
              type="search"
              placeholder="Patient name or bill ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select w-auto"
            aria-label="Filter payment status"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="">All payment statuses</option>
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
          </select>
        </div>

        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Patient</th>
                  <th>Prescription</th>
                  <th>Date</th>
                  <th className="text-end">Total</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-muted p-3">
                      Loading bills...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((b) => (
                    <tr key={b.id}>
                      <td className="fw-semibold">{formatId("BILL", b.id)}</td>
                      <td>{b.patient_name || formatId("PAT", b.patient)}</td>
                      <td>
                        <Link to={`/pharmacy/prescriptions/${b.prescription}`}>
                          {formatId("RX", b.prescription)}
                        </Link>
                      </td>
                      <td>{formatDate(b.created_at)}</td>
                      <td className="text-end fw-semibold">{formatMoney(b.total)}</td>
                      <td>
                        <span className={`badge text-bg-${badgeColor(b.payment_status)}`}>
                          {b.payment_status}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        <Link
                          to={`/pharmacy/bills/${b.id}`}
                          className="btn btn-sm btn-outline-primary"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty" colSpan="7">
                      {bills.length ? "No matching bills." : "No pharmacy bills have been created yet."}
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

export default BillsPage;
