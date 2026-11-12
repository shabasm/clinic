import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
} from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import StockRequestModal from "../components/StockRequestModal";
import { badgeColor, getMedicineRequests } from "../services/pharmacyApi";

function StockRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState("");
  const statusFilter = searchParams.get("status") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showModal, setShowModal] = useState(false);

  const reloadRequests = (statusTerm) => {
    const params = {};
    if (statusTerm) params.status = statusTerm;
    getMedicineRequests(params)
      .then((data) => {
        setRequests(data);
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
    getMedicineRequests(params)
      .then((data) => {
        if (!isMounted) return;
        setRequests(data);
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

  const handleStatusFilterChange = (val) => {
    const newParams = {};
    if (val) newParams.status = val;
    setSearchParams(newParams);
  };

  const filtered = requests.filter((r) => {
    const text = `${formatId("REQ", r.id)} ${r.medicine_name || ""}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div>
            <h1 className="mb-1">Stock requests</h1>
            <p className="mb-0">
              Ask the Admin for more stock of medicines.
            </p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              setShowModal(true);
            }}
          >
            Request stock
          </button>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" role="status">
            {success}
          </div>
        )}

        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1">
            <span className="input-group-text">Search</span>
            <input
              className="form-control"
              type="search"
              placeholder="Request ID or medicine name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select w-auto"
            aria-label="Filter request status"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Replenished">Replenished</option>
            <option value="Ignored">Ignored</option>
          </select>
        </div>

        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Medicine</th>
                  <th className="text-center">Stock then</th>
                  <th className="text-center">Requested</th>
                  <th className="text-center">Processed</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="text-muted p-3">
                      Loading stock requests...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((req) => (
                    <tr key={req.id}>
                      <td className="fw-semibold">{formatId("REQ", req.id)}</td>
                      <td>{req.medicine_name || formatId("MED", req.medicine)}</td>
                      <td className="text-center">{req.current_stock}</td>
                      <td className="text-center">{req.requested_quantity}</td>
                      <td className="text-center">
                        {req.processed_quantity !== null && req.processed_quantity !== undefined
                          ? req.processed_quantity
                          : "—"}
                      </td>
                      <td>{req.reason || "—"}</td>
                      <td>
                        <span className={`badge text-bg-${badgeColor(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>{formatDate(req.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty" colSpan="8">
                      {requests.length
                        ? "No matching stock requests."
                        : "No stock requests have been submitted yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {showModal && (
        <StockRequestModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            setSuccess("Stock request submitted to Admin successfully.");
            reloadRequests(statusFilter);
          }}
        />
      )}
    </>
  );
}

export default StockRequestsPage;
