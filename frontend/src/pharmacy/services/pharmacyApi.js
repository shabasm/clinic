import api, { collection } from "../../admin/services/api";

export function getDashboard() {
  return api.get("pharmacy/dashboard/").then((res) => res.data);
}

export function getMedicines(params) {
  return api.get("pharmacy/medicines/", { params }).then((res) => collection(res.data));
}

export function getMedicineRequests(params) {
  return api.get("pharmacy/medicine-requests/", { params }).then((res) => collection(res.data));
}

export function createMedicineRequest(body) {
  return api.post("pharmacy/medicine-requests/", body).then((res) => res.data);
}

export function getPrescriptions(params) {
  return api.get("pharmacy/prescriptions/", { params }).then((res) => collection(res.data));
}

export function getPrescription(id) {
  return api.get(`pharmacy/prescriptions/${id}/`).then((res) => res.data);
}

export function createBill(id, items) {
  const payload = items ? { items } : {};
  return api.post(`pharmacy/prescriptions/${id}/create-bill/`, payload).then((res) => res.data);
}

export function dispensePrescription(id, items) {
  const payload = items ? { items } : {};
  return api.post(`pharmacy/prescriptions/${id}/dispense/`, payload).then((res) => res.data);
}

export function dispenseAndPay(id, items) {
  return api.post(`pharmacy/prescriptions/${id}/dispense-and-pay/`, { items }).then((res) => res.data);
}

export function declinePrescription(id) {
  return api.post(`pharmacy/prescriptions/${id}/decline/`).then((res) => res.data);
}

/**
 * Get pharmacy bills.
 * Supported params: payment_status, prescription, date (YYYY-MM-DD)
 */
export function getBills(params) {
  return api.get("pharmacy/bills/", { params }).then((res) => collection(res.data));
}

export function getBill(id) {
  return api.get(`pharmacy/bills/${id}/`).then((res) => res.data);
}

export function payBill(id) {
  return api.post(`pharmacy/bills/${id}/pay/`).then((res) => res.data);
}

export function cancelBill(id) {
  return api.post(`pharmacy/bills/${id}/cancel/`).then((res) => res.data);
}

export function badgeColor(status) {
  if (["Paid", "Dispensed", "Replenished", "In stock", "Active"].includes(status)) {
    return "success";
  }
  if (["Pending", "Low stock"].includes(status)) {
    return "warning";
  }
  if (["Partially Dispensed", "Approved"].includes(status)) {
    return "info";
  }
  if (["Declined", "Expired", "Out of stock"].includes(status)) {
    return "danger";
  }
  return "secondary";
}
