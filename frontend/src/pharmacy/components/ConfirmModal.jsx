import AdminModal from "../../admin/components/AdminModal";

function ConfirmModal({
  title,
  message,
  children,
  confirmText = "Confirm",
  confirmVariant = "primary",
  onConfirm,
  onClose,
  loading = false,
  error = "",
}) {
  return (
    <AdminModal title={title} onClose={onClose}>
      <div className="modal-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {message && <p className="mb-0">{message}</p>}
        {children}
      </div>
      <div className="modal-footer">
        <button
          className="btn btn-outline-secondary"
          type="button"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          className={`btn btn-${confirmVariant}`}
          type="button"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Processing..." : confirmText}
        </button>
      </div>
    </AdminModal>
  );
}

export default ConfirmModal;
