import { useEffect, useState } from "react";
import AdminModal from "../../admin/components/AdminModal";
import { errorMessage, validateForm } from "../../admin/services/api";
import { createMedicineRequest, getMedicines } from "../services/pharmacyApi";

function StockRequestModal({ initialMedicineId = "", onClose, onSuccess }) {
  const [medicines, setMedicines] = useState([]);
  const [medicineId, setMedicineId] = useState(String(initialMedicineId || ""));
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getMedicines()
      .then((data) => {
        if (!isMounted) return;
        // List all ACTIVE medicines sorted by name
        const eligible = (data || [])
          .filter((m) => m.is_active)
          .sort((a, b) => a.name.localeCompare(b.name));
        setMedicines(eligible);
        if (initialMedicineId) {
          setMedicineId(String(initialMedicineId));
        } else if (eligible.length > 0) {
          setMedicineId((prev) => prev || String(eligible[0].id));
        }
      })
      .catch((err) => {
        if (isMounted) setError(errorMessage(err));
      });
    return () => {
      isMounted = false;
    };
  }, [initialMedicineId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) return;
    setError("");
    setSaving(true);
    try {
      await createMedicineRequest({
        medicine: Number(medicineId),
        requested_quantity: Number(quantity),
        reason: reason.trim(),
      });
      onSuccess();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title="Request medicine stock" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="modal-body">
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label required" htmlFor="request_medicine">
                Medicine
              </label>
              <select
                id="request_medicine"
                className="form-select"
                required
                value={medicineId}
                onChange={(e) => setMedicineId(e.target.value)}
              >
                {medicines.length === 0 ? (
                  <option value="">No active medicines available</option>
                ) : (
                  medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Stock: {m.stock_quantity}, {m.stock_state})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label required" htmlFor="requested_quantity">
                Quantity
              </label>
              <input
                id="requested_quantity"
                className="form-control"
                type="number"
                min="1"
                step="1"
                required
                title="Enter a whole number of at least 1."
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="request_reason">
                Reason
              </label>
              <input
                id="request_reason"
                className="form-control"
                type="text"
                minLength="3"
                maxLength="255"
                placeholder="Optional notes for Admin"
                title="If provided, enter at least 3 characters."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving || medicines.length === 0}
          >
            {saving ? "Saving..." : "Submit request"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

export default StockRequestModal;
