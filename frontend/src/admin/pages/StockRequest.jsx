import { useEffect, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { badgeColor, collection, errorMessage, formatDate, formatId, validateForm } from "../services/api";

function StockRequest() {
  const [requests, setRequests] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedAction, setSelectedAction] = useState("");
  const [receivedQuantity, setReceivedQuantity] = useState("");

  const loadData = async () => {
    const [requestResponse, medicineResponse, staffResponse] = await Promise.all([
      api.get("stock-requests/"),
      api.get("medicines/"),
      api.get("staff/"),
    ]);
    setRequests(collection(requestResponse.data));
    setMedicines(collection(medicineResponse.data));
    setStaff(collection(staffResponse.data));
  };

  useEffect(() => {
    Promise.all([
      api.get("stock-requests/"),
      api.get("medicines/"),
      api.get("staff/"),
    ]).then(([requestResponse, medicineResponse, staffResponse]) => {
      setRequests(collection(requestResponse.data));
      setMedicines(collection(medicineResponse.data));
      setStaff(collection(staffResponse.data));
    }).catch((requestError) => {
      setError(errorMessage(requestError));
    });
  }, []);

  const processRequest = async (request, action) => {
    setError("");
    setNotice("");
    setProcessingId(request.id);
    try {
      if (action === "replenish" && request.status === "Pending") {
        await api.post(`stock-requests/${request.id}/approve/`);
      }
      await api.post(
        `stock-requests/${request.id}/${action}/`,
        action === "replenish" ? { quantity: Number(receivedQuantity) } : {},
      );
      await loadData();
      setNotice(
        action === "replenish"
          ? `${receivedQuantity} units added to medicine stock.`
          : action === "approve"
            ? "Stock request accepted. Replenish it after the stock arrives."
            : "Stock request ignored.",
      );
      setSelectedRequest(null);
      setSelectedAction("");
      setReceivedQuantity("");
    } catch (requestError) {
      try {
        await loadData();
        setError(errorMessage(requestError));
      } catch (loadError) {
        setError(`${errorMessage(requestError)} Could not refresh the request list: ${errorMessage(loadError)}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  const openAction = (request, action) => {
    setError("");
    setSelectedRequest(request);
    setSelectedAction(action);
    setReceivedQuantity(String(request.requested_quantity));
  };

  const submitAction = (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    processRequest(selectedRequest, selectedAction);
  };

  const medicineName = (id) => medicines.find((medicine) => medicine.id === id)?.name || formatId("MED", id);
  const staffName = (id) => staff.find((member) => member.id === id)?.full_name || formatId("STF", id);
  const filtered = requests.slice().sort((a, b) => Number(b.status === "Pending") - Number(a.status === "Pending")).filter((request) => {
    const text = `${formatId("REQ", request.id)} ${request.id} ${formatId("MED", request.medicine)} ${medicineName(request.medicine)}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (!statusFilter || request.status === statusFilter);
  });

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Stock requests</h1>
          <p className="mb-0">Requests sent by the pharmacist for low or out-of-stock medicines.</p>
        </header>
        {error && !selectedRequest && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1"><span className="input-group-text">Search</span><input className="form-control" type="search" placeholder="Medicine or request ID" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="form-select w-auto" aria-label="All statuses" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Replenished</option><option>Ignored</option>
          </select>
        </div>
        <div className="card"><div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead><tr><th>Request</th><th>Medicine</th><th>Requested by</th><th>Stock then</th><th>Requested</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((request) => (
                <tr key={request.id}>
                  <td>{formatId("REQ", request.id)}<br /><small className="text-secondary">{formatDate(request.created_at)}</small></td>
                  <td>{medicineName(request.medicine)}</td><td>{staffName(request.requested_by)}</td><td>{request.current_stock}</td><td>{request.requested_quantity}</td><td>{request.reason || "—"}</td>
                  <td className="text-nowrap">
                    <span className={`badge text-bg-${badgeColor(request.status)} me-2`}>{request.status}</span>
                    {request.status === "Pending" && (
                      <>
                        <button className="btn btn-sm btn-outline-danger me-1" type="button" disabled={processingId === request.id} onClick={() => openAction(request, "ignore")}>Ignore</button>
                        <button className="btn btn-sm btn-outline-primary me-1" type="button" disabled={processingId === request.id} onClick={() => openAction(request, "approve")}>Approve</button>
                        <button className="btn btn-sm btn-primary" type="button" disabled={processingId === request.id} onClick={() => openAction(request, "replenish")}>Replenish</button>
                      </>
                    )}
                    {request.status === "Approved" && (
                      <button className="btn btn-sm btn-primary" type="button" disabled={processingId === request.id} onClick={() => openAction(request, "replenish")}>Replenish</button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td className="empty" colSpan="7">{requests.length ? "No matching stock requests." : "No stock requests have been submitted yet."}</td></tr>}
            </tbody>
          </table>
        </div></div>
      </main>
      {selectedRequest && (
        <AdminModal title={`${selectedAction === "replenish" ? "Replenish stock" : selectedAction === "ignore" ? "Ignore request" : "Accept request"}`} onClose={() => { setSelectedRequest(null); setSelectedAction(""); setReceivedQuantity(""); }}>
          <form onSubmit={submitAction} noValidate>
          <div className="modal-body">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            <div className="fw-semibold">{medicineName(selectedRequest.medicine)} ({formatId("REQ", selectedRequest.id)})</div>
            <div className="small text-secondary mb-3">Requested: {selectedRequest.requested_quantity} · Stock when requested: {selectedRequest.current_stock}</div>
            {selectedAction === "replenish" && (
              <div className="mb-3">
                <label className="form-label required" htmlFor="received_quantity">Quantity received</label>
                <input
                  id="received_quantity"
                  className="form-control"
                  type="number"
                  min="1"
                  max={selectedRequest.requested_quantity}
                  step="1"
                  title="Enter a whole number up to the requested quantity."
                  required
                  value={receivedQuantity}
                  onChange={(event) => setReceivedQuantity(event.target.value)}
                />
                <div className="form-text">Cannot exceed the requested quantity.</div>
              </div>
            )}
            <p className="mb-0">
              {selectedAction === "replenish"
                ? `Add ${receivedQuantity || 0} received units to stock?`
                : selectedAction === "ignore"
                  ? "Ignore this request? It will be closed without any stock being added."
                  : "Accept this request. Stock will not change until it is replenished."}
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={() => { setSelectedRequest(null); setSelectedAction(""); setReceivedQuantity(""); }}>Cancel</button>
            <button
              className={`btn ${selectedAction === "ignore" ? "btn-danger" : "btn-primary"}`}
              type="submit"
              disabled={processingId === selectedRequest.id}
            >
              {processingId === selectedRequest.id ? "Saving..." : selectedAction === "replenish" ? "Replenish" : selectedAction === "ignore" ? "Ignore" : "Accept"}
            </button>
          </div>
          </form>
        </AdminModal>
      )}
    </>
  );
}

export default StockRequest;
