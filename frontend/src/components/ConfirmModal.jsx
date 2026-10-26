import { useState } from "react";
import { Modal } from "react-bootstrap";
import { errorMessage } from "../services/api";

/* A yes/no dialog. Pass dialog = { title, body, okText, danger, onOk } (or null to hide it).
   onOk may be async. If it throws, the error is shown here and the dialog stays open. */
export default function ConfirmModal({ dialog, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setError("");
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await dialog.onOk();
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={!!dialog} onHide={busy ? undefined : close} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2" className="fs-5">{dialog?.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="pre-line">{dialog?.body}</div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={busy}>Cancel</button>
        <button
          type="button"
          className={`btn ${dialog?.danger ? "btn-danger" : "btn-primary"}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? "Working…" : dialog?.okText || "Confirm"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
