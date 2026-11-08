/* utils/format.js: dates, money, readable IDs and the order-status rule. */

export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

/* "2026-10-24" or a full timestamp -> "24 Oct 2026" */
export function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/* the local calendar day (YYYY-MM-DD) of a timestamp */
export const dayOf = (dateTime) => (dateTime ? new Date(dateTime).toLocaleDateString("en-CA") : "");

export function fmtMoney(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function ageOn(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthday =
    now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/* Readable IDs shown on screen (the database uses plain numbers) */
const code = (prefix, id) => `${prefix}${String(id).padStart(5, "0")}`;
export const orderCode = (id) => code("LOR", id);
export const patientCode = (id) => code("PAT", id);
export const billCode = (id) => code("LAB", id);
export const resultCode = (id) => code("RES", id);

/* The overall status of an order is worked out from its tests (spec 11.1). */
export function calculateOrderStatus(items) {
  if (!items || !items.length) return "Recommended";
  const active = items.filter((t) => t.status !== "Cancelled" && t.status !== "Declined");
  if (!active.length) {
    if (items.some((t) => t.status === "Declined")) return "Declined";
    return "Cancelled";
  }
  if (active.every((t) => t.status === "Completed")) return "Completed";
  if (active.some((t) => t.status === "In Progress")) return "In Progress";
  if (active.some((t) => t.status === "Paid")) return "Paid";
  if (active.some((t) => t.status === "Selected")) return "Selected";
  return "Recommended";
}
