/* services/labServices.js: every call the Laboratory portal makes to the Django API. */
import api from "./api";

// Lists come back as a plain array, or as { results: [...] } if pagination is switched on.
const list = (res) => (Array.isArray(res.data) ? res.data : res.data.results ?? []);
const data = (res) => res.data;

/* orders, tests, bills, results, reports: GET */
export const getOrders = (params) => api.get("lab/orders/", { params }).then(list);
export const getBills = (params) => api.get("lab/bills/", { params }).then(list);
export const getResults = (params) => api.get("lab/results/", { params }).then(list);
export const getTests = () => api.get("lab/tests/").then(list);
export const getReports = (params) => api.get("lab/reports/", { params }).then(list);

/* one test inside an order */
export const startItem = (itemId) => api.post(`lab/items/${itemId}/start/`).then(data);
export const cancelItem = (itemId) => api.post(`lab/items/${itemId}/cancel/`).then(data);
export const selectItem = (itemId) => api.post(`lab/items/${itemId}/select/`).then(data);
export const declineItem = (itemId) => api.post(`lab/items/${itemId}/decline/`).then(data);

/* bill the selected tests of an order, in one bill (payment collected at the desk) */
export const billOrder = (orderId, itemIds) =>
  api.post(`lab/orders/${orderId}/bill/`, { item_ids: itemIds }).then(data);

/* results */
export const saveResult = (payload) => api.post("lab/results/", payload).then(data);

/* report release */
export const releaseReport = (reportId, payload) =>
  api.post(`lab/reports/${reportId}/release/`, payload).then(data);
