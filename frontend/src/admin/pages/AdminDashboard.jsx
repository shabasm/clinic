import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNavbar from "../components/AdminNavbar";
import api, { collection, errorMessage } from "../services/api";

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [summaryResponse, medicineResponse, settingsResponse] = await Promise.all([
          api.get("dashboard/"),
          api.get("medicines/"),
          api.get("settings/"),
        ]);
        const settings = collection(settingsResponse.data)[0];
        const threshold = Number(settings?.low_stock_threshold ?? 10);
        const today = new Date().toISOString().slice(0, 10);
        setSummary(summaryResponse.data);
        setAlerts(
          collection(medicineResponse.data)
            .filter((medicine) => medicine.is_active)
            .map((medicine) => {
              const state = medicine.expiry_date < today
                ? "Expired"
                : Number(medicine.stock_quantity) <= 0
                  ? "Out of stock"
                  : Number(medicine.stock_quantity) <= threshold
                    ? "Low stock"
                    : "In stock";
              return { ...medicine, state };
            })
            .filter((medicine) => medicine.state !== "In stock"),
        );
      } catch (requestError) {
        setError(errorMessage(requestError));
      }
    };
    loadDashboard();
  }, []);

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Clinic dashboard</h1>
          <p className="mb-0">Live numbers from the clinic records.</p>
        </header>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <h2 className="h5 mb-3">Overview</h2>
        <div className="row g-3 mb-4">
          {[
            ["Active Staff", summary?.active_staff],
            ["Active Medicines", summary?.total_medicines],
          ].map(([label, value]) => (
            <div className="col-6 col-lg-4" key={label}>
              <div className="card stat-card h-100">
                <div className="card-body">
                  <div className="small text-secondary">{label}</div>
                  <div className="stat-num">{value ?? "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <section className="card">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 className="h5 mb-0">Stock alerts</h2>
              <Link to="/admin/stock-requests" className="small">
                {summary?.pending_stock_requests
                  ? `${summary.pending_stock_requests} pending stock request${summary.pending_stock_requests === 1 ? "" : "s"}`
                  : ""}
              </Link>
            </div>
            {alerts.length ? alerts.map((medicine) => (
              <div
                key={medicine.id}
                className={`alert alert-${medicine.state === "Low stock" ? "warning" : "danger"} py-2 mb-2`}
              >
                <strong>{medicine.name}</strong>: {medicine.state} ({medicine.stock_quantity} units, expiry {medicine.expiry_date})
              </div>
            )) : (
              <div className={summary ? "empty" : "text-muted"}>
                {summary ? "All active medicines are in stock and within expiry." : "Loading stock alerts..."}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export default AdminDashboard;
