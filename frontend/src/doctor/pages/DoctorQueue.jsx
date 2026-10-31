import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, formatId } from "../../admin/services/api";
import DoctorNavbar from "../components/DoctorNavbar";
import { getDoctorQueue, startConsultation } from "../services/doctorApi";

function DoctorQueue() {
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDoctorQueue(selectedDate);
      setQueue(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleStart = async (tokenId) => {
    setActionLoading(true);
    setError("");
    try {
      const result = await startConsultation(tokenId);
      navigate(`/doctor/consultation/${result.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setActionLoading(false);
    }
  };

  const filteredQueue = queue.filter((t) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const pat = t.patient;
    const patName = pat?.full_name?.toLowerCase() || "";
    const patPhone = pat?.phone?.toLowerCase() || "";
    const tokNum = String(t.token_number);
    return patName.includes(q) || patPhone.includes(q) || tokNum.includes(q);
  });

  // Calculate statistics
  const totalTokens = queue.length;
  const inProgressCount = queue.filter((t) => t.consultation_status === "In Progress").length;
  const completedCount = queue.filter(
    (t) => t.status === "Completed" || t.consultation_status === "Completed"
  ).length;
  const waitingCount = queue.filter(
    (t) => t.status === "Active" && (!t.consultation_status || t.consultation_status === "Waiting")
  ).length;

  return (
    <>
      <DoctorNavbar />
      <main className="container-xl admin-main pb-5">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
          <div>
            <h1 className="h3 mb-1">Patient Queue</h1>
            <p className="text-secondary mb-0">
              Manage patient consultations and daily appointments.
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: "160px" }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={loadQueue}
              disabled={loading || actionLoading}
            >
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            {error}
            <button type="button" className="btn-close" onClick={() => setError("")}></button>
          </div>
        )}

        {/* Stats Row */}
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0 border-start border-primary border-4">
              <div className="card-body">
                <div className="text-secondary small fw-semibold">Total in Queue</div>
                <div className="h3 mb-0 text-primary">{totalTokens}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0 border-start border-warning border-4">
              <div className="card-body">
                <div className="text-secondary small fw-semibold">Waiting</div>
                <div className="h3 mb-0 text-warning">{waitingCount}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0 border-start border-info border-4">
              <div className="card-body">
                <div className="text-secondary small fw-semibold">In Progress</div>
                <div className="h3 mb-0 text-info">{inProgressCount}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card shadow-sm border-0 border-start border-success border-4">
              <div className="card-body">
                <div className="text-secondary small fw-semibold">Completed</div>
                <div className="h3 mb-0 text-success">{completedCount}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Table Card */}
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white py-3">
            <div className="row align-items-center g-2">
              <div className="col-md-4">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search by patient name, phone, token..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="col-md-8 text-md-end text-secondary small">
                Showing {filteredQueue.length} patient(s)
              </div>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: "90px" }}>Token</th>
                  <th>Patient Details</th>
                  <th>Token Type</th>
                  <th>Consultation Status</th>
                  <th className="text-end" style={{ minWidth: "220px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="text-center py-4 text-secondary">
                      Loading queue...
                    </td>
                  </tr>
                ) : filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-4 text-secondary">
                      No patients in queue for {selectedDate}.
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((item) => {
                    const pat = item.patient;
                    const isCompleted =
                      item.consultation_status === "Completed" || item.status === "Completed";
                    const isInProgress = item.consultation_status === "In Progress";
                    const canStart = item.status === "Active" && !item.consultation_status;

                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="badge text-bg-primary fs-6 px-2 py-1">
                            #{item.token_number}
                          </span>
                        </td>
                        <td>
                          <div className="fw-semibold text-dark">
                            {pat?.full_name || "Unknown"}
                          </div>
                          <div className="small text-secondary">
                            {pat?.gender || "—"} · {pat?.age ? `${pat.age} yrs` : "—"} · {pat?.phone || "—"}
                          </div>
                          <div className="small text-muted" style={{ fontSize: "0.75rem" }}>
                            {formatId("PAT", pat?.id)}
                          </div>
                        </td>
                        <td>
                          <span className="badge text-bg-light border text-secondary">
                            {item.token_type || "Walk-In"}
                          </span>
                        </td>
                        <td>
                          {isInProgress ? (
                            <span className="badge text-bg-info">In Progress</span>
                          ) : isCompleted ? (
                            <span className="badge text-bg-success">Completed</span>
                          ) : item.status === "Active" ? (
                            <span className="badge text-bg-warning text-dark">Waiting</span>
                          ) : (
                            <span className="badge text-bg-secondary">{item.status}</span>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-2 align-items-center">
                            {isInProgress && item.consultation_id && (
                              <Link
                                to={`/doctor/consultation/${item.consultation_id}`}
                                className="btn btn-sm btn-primary"
                              >
                                Resume Consultation
                              </Link>
                            )}

                            {canStart && (
                              <button
                                type="button"
                                className="btn btn-sm btn-success"
                                onClick={() => handleStart(item.id)}
                                disabled={actionLoading}
                              >
                                Start Consultation
                              </button>
                            )}

                            {isCompleted && item.consultation_id && (
                              <Link
                                to={`/doctor/consultation/${item.consultation_id}`}
                                className="btn btn-sm btn-outline-secondary"
                              >
                                View Details
                              </Link>
                            )}

                            {pat && (
                              <Link
                                to={`/doctor/patient-history?patient=${pat.id}`}
                                className="btn btn-sm btn-outline-info"
                                title="View Patient Medical History"
                              >
                                History
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}

export default DoctorQueue;
