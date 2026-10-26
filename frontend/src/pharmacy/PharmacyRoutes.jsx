import { Navigate, Route, Routes } from "react-router-dom";
import "./Pharmacy.css";
import BillDetails from "./pages/BillDetails";
import BillsPage from "./pages/BillsPage";
import InventoryPage from "./pages/InventoryPage";
import PharmacyDashboard from "./pages/PharmacyDashboard";
import PrescriptionDetails from "./pages/PrescriptionDetails";
import PrescriptionsPage from "./pages/PrescriptionsPage";
import StockRequestsPage from "./pages/StockRequestsPage";

function PharmacyRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<PharmacyDashboard />} />
      <Route path="prescriptions" element={<PrescriptionsPage />} />
      <Route path="prescriptions/:id" element={<PrescriptionDetails />} />
      <Route path="inventory" element={<InventoryPage />} />
      <Route path="stock-requests" element={<StockRequestsPage />} />
      <Route path="bills" element={<BillsPage />} />
      <Route path="bills/:id" element={<BillDetails />} />
      <Route path="*" element={<Navigate to="/pharmacy/dashboard" replace />} />
    </Routes>
  );
}

export default PharmacyRoutes;
