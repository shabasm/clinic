import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, formatDate, formatMoney } from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import { getBills, getDashboard, getMedicines } from "../services/pharmacyApi";

function PharmacyDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [paidBills, setPaidBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getDashboard(),
      getMedicines(),
      getBills({ payment_status: "Paid" }),
    ])
      .then(([dashData, medicinesData, billsData]) => {
        if (!isMounted) return;
        setDashboard(dashData);
        const nonInStock = medicinesData.filter(
          (med) => med.stock_state && med.stock_state !== "In stock"
        );
        setAlerts(nonInStock);
        setPaidBills(Array.isArray(billsData) ? billsData : []);
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

  // Monthly Sales Analysis: Last 6 months calculation
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const monthlySales = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const monthName = d.toLocaleString("en-US", { month: "short" });
    monthlySales.push({
      key,
      label: `${monthName} ${y}`,
      shortLabel: monthName,
      revenue: 0,
      billCount: 0,
      isCurrentMonth: key === currentMonthKey,
    });
  }

  // Accumulate revenue strictly from Paid bills, using consistent payment / creation date
  paidBills
    .filter((b) => b.payment_status === "Paid")
    .forEach((bill) => {
      const dateStr = bill.paid_at || bill.created_at;
      if (!dateStr) return;
      const billKey = dateStr.slice(0, 7); // "YYYY-MM"
      const entry = monthlySales.find((m) => m.key === billKey);
      if (entry) {
        entry.revenue += Number(bill.total || 0);
        entry.billCount += 1;
      }
    });

  const currentMonthEntry = monthlySales.find((m) => m.isCurrentMonth);
  const currentMonthRevenue = currentMonthEntry ? currentMonthEntry.revenue : 0;
  const maxRevenue = Math.max(...monthlySales.map((m) => m.revenue), 1);

  // 6 core operational widgets
  const statItems = [
    {
      label: "Pending Prescriptions",
      value: dashboard?.pending_prescriptions,
      link: "/pharmacy/prescriptions?status=Pending&date=all",
    },
    {
      label: "Partially Dispensed",
      value: dashboard?.partially_dispensed_prescriptions,
      link: "/pharmacy/prescriptions?status=Partially Dispensed&date=all",
    },
    {
      label: "Dispensed Today",
      value: dashboard?.dispensed_today,
      link: "/pharmacy/prescriptions?status=Dispensed&date=today",
    },
    {
      label: "Bills Today",
      value: dashboard?.bills_today,
      link: "/pharmacy/bills?date=today",
    },
    {
      label: "Daily Revenue",
      value: formatMoney(dashboard?.revenue_today ?? 0),
      link: "/pharmacy/bills?date=today",
    },
    {
      label: "Monthly Revenue",
      value: formatMoney(currentMonthRevenue),
      link: "/pharmacy/bills?date=all",
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
            {/* 6 Core Widgets */}
            <div className="row g-3 mb-4">
              {statItems.map((item) => (
                <div className="col-12 col-sm-6 col-md-4" key={item.label}>
                  <Link to={item.link} className="text-decoration-none">
                    <div className="card stat-card h-100 cursor-pointer">
                      <div className="card-body">
                        <div className="small text-secondary">{item.label}</div>
                        <div className="stat-num">{item.value ?? "—"}</div>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>

            {/* Stock alerts section (placed ABOVE monthly sales analysis) */}
            <section className="card mb-4">
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                  <h2 className="h5 mb-0">Stock alerts</h2>
                  <Link
                    to="/pharmacy/stock-requests?status=Pending"
                    className="small"
                  >
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
                        medicine.stock_state === "Low stock"
                          ? "warning"
                          : "danger"
                      } py-2 mb-2`}
                    >
                      <strong>{medicine.name}</strong>: {medicine.stock_state} (
                      {medicine.stock_quantity} units, expiry{" "}
                      {formatDate(medicine.expiry_date)})
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    All active medicines are in stock and within expiry.
                  </div>
                )}
              </div>
            </section>

            {/* Monthly Sales Analysis section */}
            <section className="card mb-4">
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 pb-2 border-bottom">
                  <div>
                    <h2 className="h5 mb-0">Monthly Sales Analysis</h2>
                    <div className="small text-secondary">
                      Revenue from paid pharmacy bills (Last 6 Months)
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="badge text-bg-light border py-2 px-3 fs-6">
                      Current Month Revenue:{" "}
                      <strong className="text-teal ms-1">
                        {formatMoney(currentMonthRevenue)}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="pharmacy-sales-chart-wrapper pt-2">
                  <div className="pharmacy-sales-chart">
                    {monthlySales.map((m) => {
                      const heightPercent =
                        maxRevenue > 0 && m.revenue > 0
                          ? Math.max(
                              Math.round((m.revenue / maxRevenue) * 100),
                              8
                            )
                          : 4;
                      return (
                        <div key={m.key} className="pharmacy-chart-col">
                          <div className="pharmacy-chart-value small text-muted">
                            {m.revenue > 0 ? formatMoney(m.revenue) : "—"}
                          </div>
                          <div className="pharmacy-chart-bar-track">
                            <div
                              className={`pharmacy-chart-bar ${
                                m.isCurrentMonth ? "current-month" : ""
                              }`}
                              style={{ height: `${heightPercent}%` }}
                              title={`${m.label}: ${formatMoney(
                                m.revenue
                              )} (${m.billCount} paid bill${
                                m.billCount === 1 ? "" : "s"
                              })`}
                            />
                          </div>
                          <div
                            className={`pharmacy-chart-label small ${
                              m.isCurrentMonth
                                ? "fw-bold text-teal"
                                : "text-secondary"
                            }`}
                          >
                            {m.shortLabel}
                            {m.isCurrentMonth && (
                              <span
                                className="d-block text-teal"
                                style={{ fontSize: "0.7rem" }}
                              >
                                Current
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default PharmacyDashboard;
