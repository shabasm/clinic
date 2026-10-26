/* Status colours (spec 2.4) */
const COLORS = {
  success: ["Active", "Paid", "Completed", "Dispensed", "In stock", "Available", "Replenished"],
  warning: ["Pending", "Reserved", "Recommended", "Partially Dispensed", "Low stock"],
  info: ["Activated", "Selected", "In Progress", "Approved"],
  danger: ["No-show", "Skipped", "Expired", "Out of stock", "Unavailable"],
  secondary: ["Inactive", "Cancelled", "Declined", "Ignored"],
};

export default function StatusBadge({ status }) {
  const color = Object.keys(COLORS).find((c) => COLORS[c].includes(status)) || "secondary";
  return <span className={`badge text-bg-${color}`}>{status}</span>;
}
