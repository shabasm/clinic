import { useEffect, useState } from "react";
import AdminNavbar from "../components/AdminNavbar";
import AdminModal from "../components/AdminModal";
import api, { badgeColor, collection, errorMessage, formatDate, formatId, formatMoney, validateForm } from "../services/api";

const emptyForm = {
  name: "",
  manufacturer: "",
  price: "",
  stock_quantity: 0,
  expiry_date: "",
  is_active: true,
};

function Medicines() {
  const [medicines, setMedicines] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [restockMedicine, setRestockMedicine] = useState(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockExpiry, setRestockExpiry] = useState("");
  const [pendingToggle, setPendingToggle] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadMedicines = async () => {
    try {
      const { data } = await api.get("medicines/");
      setMedicines(collection(data));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  useEffect(() => {
    Promise.all([api.get("medicines/"), api.get("settings/")])
      .then(([medicineResponse, settingsResponse]) => {
        setMedicines(collection(medicineResponse.data));
        const settings = collection(settingsResponse.data)[0];
        if (settings) setLowStockThreshold(Number(settings.low_stock_threshold));
      })
      .catch((requestError) => setError(errorMessage(requestError)));
  }, []);

  const stockState = (medicine) => {
    if (medicine.expiry_date < new Date().toISOString().slice(0, 10)) return "Expired";
    if (Number(medicine.stock_quantity) <= 0) return "Out of stock";
    if (Number(medicine.stock_quantity) <= lowStockThreshold) return "Low stock";
    return "In stock";
  };

  const startEdit = (medicine) => {
    setEditId(medicine.id);
    setForm({
      name: medicine.name,
      manufacturer: medicine.manufacturer || "",
      price: medicine.price,
      stock_quantity: medicine.stock_quantity,
      expiry_date: medicine.expiry_date,
      is_active: medicine.is_active,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  };

  const saveMedicine = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    const today = new Date().toISOString().slice(0, 10);
    const existingMedicine = medicines.find((medicine) => medicine.id === editId);
    if (form.expiry_date < today && (!existingMedicine || existingMedicine.expiry_date !== form.expiry_date)) {
      setError("Expiry date cannot be in the past.");
      return;
    }
    const medicineKey = `${form.name.trim()}|${form.manufacturer.trim()}`.toLowerCase();
    if (medicines.some((medicine) =>
      `${medicine.name.trim()}|${(medicine.manufacturer || "").trim()}`.toLowerCase() === medicineKey &&
      medicine.id !== editId
    )) {
      setError("Medicine already exists.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), manufacturer: form.manufacturer.trim(), price: Number(form.price), stock_quantity: Number(form.stock_quantity) };
      if (editId) await api.patch(`medicines/${editId}/`, payload);
      else await api.post("medicines/", payload);
      resetForm();
      await loadMedicines();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (medicine) => {
    setError("");
    try {
      await api.patch(`medicines/${medicine.id}/`, { is_active: !medicine.is_active });
      await loadMedicines();
      setPendingToggle(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const restock = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    if (!restockMedicine) return;
    setError("");
    setSaving(true);
    try {
      await api.patch(`medicines/${restockMedicine.id}/`, {
        stock_quantity: Number(restockMedicine.stock_quantity) + Number(restockQuantity),
        expiry_date: restockExpiry,
      });
      setRestockMedicine(null);
      setRestockQuantity("");
      setRestockExpiry("");
      await loadMedicines();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const filtered = medicines.filter((medicine) => {
    const state = stockState(medicine);
    const text = `${formatId("MED", medicine.id)} ${medicine.id} ${medicine.name} ${medicine.manufacturer}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (!stockFilter || state === stockFilter) &&
      (!statusFilter || String(medicine.is_active) === statusFilter);
  });

  return (
    <>
      <AdminNavbar />
      <main className="container admin-main">
        <header className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
          <div><h1 className="mb-1">Medicines</h1><p className="mb-0">Inventory, prices and expiry. Expired medicines should not be dispensed.</p></div>
          <button className="btn btn-primary" type="button" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>Add medicine</button>
        </header>
        {error && !showForm && !restockMedicine && !pendingToggle && <div className="alert alert-danger" role="alert">{error}</div>}
        {showForm && (
          <AdminModal title={editId ? "Edit medicine" : "Add medicine"} onClose={resetForm}>
            <form onSubmit={saveMedicine} noValidate>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label required" htmlFor="medicine_name">Medicine name</label><input id="medicine_name" className="form-control" required minLength="2" maxLength="80" pattern=".*\S.*" title="Enter 2-80 characters." value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                <div className="col-md-6"><label className="form-label" htmlFor="manufacturer">Manufacturer</label><input id="manufacturer" className="form-control" minLength="2" maxLength="80" pattern=".*\S.*" title="Enter 2-80 characters." value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></div>
                <div className="col-md-4"><label className="form-label required" htmlFor="medicine_price">Price (₹)</label><input id="medicine_price" className="form-control" type="number" min="0.01" step="0.01" title="Enter a positive amount with up to 2 decimals." required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div>
                <div className="col-md-4"><label className="form-label required" htmlFor="stock_quantity">Stock quantity</label><input id="stock_quantity" className="form-control" type="number" min="0" step="1" required disabled={Boolean(editId)} value={form.stock_quantity} onChange={(event) => setForm({ ...form, stock_quantity: event.target.value })} /><div className="form-text">{editId ? "Use Restock to add stock." : ""}</div></div>
                <div className="col-md-4"><label className="form-label required" htmlFor="expiry_date">Expiry date</label><input id="expiry_date" className="form-control" type="date" required value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} /></div>
                {editId && <div className="col-12"><div className="form-check"><input id="medicine_active" className="form-check-input" type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><label className="form-check-label" htmlFor="medicine_active">Active medicine</label></div></div>}
              </div>
              </div>
              <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={resetForm}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save medicine"}</button></div>
            </form>
          </AdminModal>
        )}
        <div className="d-flex flex-wrap toolbar mb-3">
          <div className="input-group w-auto flex-grow-1"><span className="input-group-text">Search</span><input className="form-control" type="search" placeholder="Name, ID or manufacturer" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="form-select w-auto" aria-label="All stock levels" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="">All stock levels</option><option>In stock</option><option>Low stock</option><option>Out of stock</option><option>Expired</option></select>
          <select className="form-select w-auto" aria-label="Filter medicine status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
        </div>
        <div className="card"><div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead><tr><th>ID</th><th>Medicine</th><th>Manufacturer</th><th>Price</th><th>Stock</th><th>Expiry</th><th>Stock level</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((medicine) => (
                <tr key={medicine.id}>
                  <td>{formatId("MED", medicine.id)}</td><td>{medicine.name}</td><td>{medicine.manufacturer || "—"}</td><td>{formatMoney(medicine.price)}</td><td>{medicine.stock_quantity}</td><td>{formatDate(medicine.expiry_date)}</td>
                  <td><span className={`badge text-bg-${badgeColor(stockState(medicine))}`}>{stockState(medicine)}</span></td>
                  <td><span className={`badge text-bg-${badgeColor(medicine.is_active ? "Active" : "Inactive")}`}>{medicine.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="text-end text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" type="button" onClick={() => startEdit(medicine)}>Edit</button><button className="btn btn-sm btn-outline-primary me-1" type="button" onClick={() => { setRestockMedicine(medicine); setRestockQuantity(""); setRestockExpiry(medicine.expiry_date >= new Date().toISOString().slice(0, 10) ? medicine.expiry_date : ""); }}>Restock</button><button className={`btn btn-sm btn-outline-${medicine.is_active ? "danger" : "success"}`} type="button" onClick={() => medicine.is_active ? setPendingToggle(medicine) : toggleActive(medicine)}>{medicine.is_active ? "Deactivate" : "Activate"}</button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td className="empty" colSpan="9">{medicines.length ? "No matching medicines." : "No medicines yet. Use “Add medicine” to create the first one."}</td></tr>}
            </tbody>
          </table>
        </div></div>
      </main>
      {restockMedicine && (
        <AdminModal title="Restock medicine" onClose={() => setRestockMedicine(null)}>
          <form onSubmit={restock} noValidate>
            <div className="modal-body">
              {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <div className="fw-semibold">{restockMedicine.name} ({formatId("MED", restockMedicine.id)})</div>
              <div className="small text-secondary mb-3">In stock: {restockMedicine.stock_quantity} · Expiry: {restockMedicine.expiry_date}</div>
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label required" htmlFor="restock_quantity">Quantity to add</label><input id="restock_quantity" className="form-control" type="number" min="1" step="1" required value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} /></div>
                <div className="col-md-6"><label className="form-label required" htmlFor="restock_expiry">Expiry date</label><input id="restock_expiry" className="form-control" type="date" required min={new Date().toISOString().slice(0, 10)} value={restockExpiry} onChange={(event) => setRestockExpiry(event.target.value)} /><div className="form-text">Applies to the whole stock of this medicine.</div></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={() => setRestockMedicine(null)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Add stock"}</button></div>
          </form>
        </AdminModal>
      )}
      {pendingToggle && (
        <AdminModal title="Deactivate medicine" onClose={() => setPendingToggle(null)}>
          <div className="modal-body">{error && <div className="alert alert-danger" role="alert">{error}</div>}Deactivate {pendingToggle.name}? It will no longer be available for prescriptions or dispensing.</div>
          <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={() => setPendingToggle(null)}>Cancel</button><button className="btn btn-danger" type="button" onClick={() => toggleActive(pendingToggle)}>Deactivate</button></div>
        </AdminModal>
      )}
    </>
  );
}

export default Medicines;
