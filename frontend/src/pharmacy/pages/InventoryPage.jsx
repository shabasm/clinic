import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  errorMessage,
  formatDate,
  formatId,
  formatMoney,
} from "../../admin/services/api";
import PharmacyNavbar from "../components/PharmacyNavbar";
import StockRequestModal from "../components/StockRequestModal";
import { badgeColor, getMedicines } from "../services/pharmacyApi";

function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState("");
  const stockFilter = searchParams.get("stock") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestMedicineId, setRequestMedicineId] = useState(null);

  const reloadMedicines = (stockParam) => {
    const params = {};
    if (["low", "out", "expired"].includes(stockParam?.toLowerCase())) {
      params.stock = stockParam.toLowerCase();
    }
    getMedicines(params)
      .then((data) => {
        setMedicines(data);
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
    if (["low", "out", "expired"].includes(stockFilter?.toLowerCase())) {
      params.stock = stockFilter.toLowerCase();
    }
    getMedicines(params)
      .then((data) => {
        if (!isMounted) return;
        setMedicines(data);
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
  }, [stockFilter]);

  const handleStockFilterChange = (val) => {
    const newParams = {};
    if (val) newParams.stock = val;
    setSearchParams(newParams);
  };

  // Filter client side: search text and client-side "In stock"
  const filtered = medicines.filter((m) => {
    const text = `${formatId("MED", m.id)} ${m.name} ${m.manufacturer || ""}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesStock =
      !stockFilter ||
      (stockFilter.toLowerCase() === "in stock"
        ? m.stock_state === "In stock"
        : stockFilter.toLowerCase() === "low" || stockFilter.toLowerCase() === "low stock"
        ? m.stock_state === "Low stock"
        : stockFilter.toLowerCase() === "out" || stockFilter.toLowerCase() === "out of stock"
        ? m.stock_state === "Out of stock"
        : stockFilter.toLowerCase() === "expired"
        ? m.stock_state === "Expired"
        : true);
    return matchesSearch && matchesStock;
  });

  return (
    <>
      <PharmacyNavbar />
      <main className="container admin-main">
        <header className="page-header">
          <h1 className="mb-1">Inventory</h1>
          <p className="mb-0">
            Stock, prices and expiry. Only the Admin can change medicines.
          </p>
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
              placeholder="Name, ID or manufacturer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select w-auto"
            aria-label="Filter stock level"
            value={stockFilter}
            onChange={(e) => handleStockFilterChange(e.target.value)}
          >
            <option value="">All stock levels</option>
            <option value="in stock">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Medicine</th>
                  <th>Manufacturer</th>
                  <th className="text-end">Price</th>
                  <th className="text-center">Stock</th>
                  <th>Expiry</th>
                  <th>Stock level</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="text-muted p-3">
                      Loading inventory...
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((m) => (
                    <tr key={m.id}>
                      <td className="fw-semibold">{formatId("MED", m.id)}</td>
                      <td>{m.name}</td>
                      <td>{m.manufacturer || "—"}</td>
                      <td className="text-end">{formatMoney(m.price)}</td>
                      <td className="text-center">{m.stock_quantity}</td>
                      <td>{formatDate(m.expiry_date)}</td>
                      <td>
                        <span className={`badge text-bg-${badgeColor(m.stock_state)}`}>
                          {m.stock_state}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge text-bg-${badgeColor(
                            m.is_active ? "Active" : "Inactive"
                          )}`}
                        >
                          {m.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="text-end text-nowrap">
                        {m.is_active ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                              setError("");
                              setSuccess("");
                              setRequestMedicineId(m.id);
                            }}
                          >
                            Request stock
                          </button>
                        ) : (
                          <span
                            className="d-inline-block"
                            tabIndex="0"
                            title="Inactive medicine"
                          >
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled
                              title="Inactive medicine"
                              style={{ pointerEvents: "none" }}
                            >
                              Request stock
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty" colSpan="9">
                      {medicines.length
                        ? "No matching medicines."
                        : "No active medicines in catalog."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {requestMedicineId && (
        <StockRequestModal
          initialMedicineId={requestMedicineId}
          onClose={() => setRequestMedicineId(null)}
          onSuccess={() => {
            setRequestMedicineId(null);
            setSuccess("Stock request submitted to Admin successfully.");
            reloadMedicines(stockFilter);
          }}
        />
      )}
    </>
  );
}

export default InventoryPage;
