import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, formatDate, formatMoney } from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import { getDashboard, getMedicines } from "../services/pharmacyApi";

function PharmacyDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    Promise.all([getDashboard(), getMedicines()])
      .then(([dashData, medicinesData]) => {
        if (!isMounted) return;
        setDashboard(dashData);
        const nonInStock = medicinesData.filter(
          (med) => med.stock_state && med.stock_state !== "In stock"
        );
        setAlerts(nonInStock);
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
  }, []);

  const statItems = [
    {
      label: "Pending Prescriptions",
      value: dashboard?.pending_prescriptions,
      link: "/pharmacy/prescriptions?status=Pending",
    },
    {
      label: "Partially Dispensed",
      value: dashboard?.partially_dispensed_prescriptions,
      link: "/pharmacy/prescriptions?status=Partially Dispensed",
    },
    {
      label: "Dispensed Today",
      value: dashboard?.dispensed_today,
      link: "/pharmacy/prescriptions?status=Dispensed",
    },
    {
      label: "Bills Today",
      value: dashboard?.bills_today,
      link: "/pharmacy/bills",
    },
    {
      label: "Daily Revenue",
      value: formatMoney(dashboard?.revenue_today ?? 0),
      link: "/pharmacy/bills",
    },
    {
      label: "Low Stock Medicines",
      value: dashboard?.low_stock_medicines,
      link: "/pharmacy/inventory?stock=low",
    },
    {
      label: "Out of Stock Medicines",
      value: dashboard?.out_of_stock_medicines,
      link: "/pharmacy/inventory?stock=out",
    },
    {
      label: "Expired Medicines",
      value: dashboard?.expired_medicines,
      link: "/pharmacy/inventory?stock=expired",
    },
  ];

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Pharmacy dashboard</h1>
        </header>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-muted">Loading ...</div>
        ) : (
          <>
            <div className="row g-3 mb-4">
              {statItems.map((item) => (
                <div className="col-6 col-lg-3" key={item.label}>
                  <Link to={item.link} className="text-decoration-none">
                    <div className="card stat-card h-100">
                      <div className="card-body">
                        <div className="small text-secondary">{item.label}</div>
                        <div className="stat-num">{item.value ?? "—"}</div>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>

            <section className="card">
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                  <h2 className="h5 mb-0">Stock alerts</h2>
                  <Link to="/pharmacy/stock-requests?status=Pending" className="small">
                    {dashboard?.pending_stock_requests
                      ? `${dashboard.pending_stock_requests} pending stock request${
                          dashboard.pending_stock_requests === 1 ? "" : "s"
                        }`
                      : ""}
                  </Link>
                </div>

                {alerts.length > 0 ? (
                  alerts.map((medicine) => (
                    <div
                      key={medicine.id}
                      className={`alert alert-${
                        medicine.stock_state === "Low stock" ? "warning" : "danger"
                      } py-2 mb-2`}
                    >
                      <strong>{medicine.name}</strong>: {medicine.stock_state} (
                      {medicine.stock_quantity} units, expiry {formatDate(medicine.expiry_date)})
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    All active medicines are in stock and within expiry.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default PharmacyDashboard;
