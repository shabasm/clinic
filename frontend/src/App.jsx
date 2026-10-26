import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "./admin/pages/AdminDashboard";
import Charges from "./admin/pages/Charges";
import Credentials from "./admin/pages/Credentials";
import Departments from "./admin/pages/Departments";
import Doctors from "./admin/pages/Doctors";
import LabTests from "./admin/pages/LabTests";
import Login from "./admin/pages/Login";
import Medicines from "./admin/pages/Medicines";
import Staff from "./admin/pages/Staff";
import StockRequest from "./admin/pages/StockRequest";
import RoleNotice from "./shared/RoleNotice";

const roleRoutes = {
  Admin: "/admin/dashboard",
  Doctor: "/doctor/dashboard",
  Receptionist: "/reception/dashboard",
  Pharmacist: "/pharmacy/dashboard",
  "Lab Technician": "/lab/dashboard",
};

function RequireRole({ roles, children }) {
  const access = localStorage.getItem("access");
  const role = localStorage.getItem("role");
  if (!access || !role) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) {
    return <Navigate to={roleRoutes[role] || "/login"} replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  return <RequireRole roles={["Admin"]}>{children}</RequireRole>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to={roleRoutes[localStorage.getItem("role")] || "/login"} replace />} />
        <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/staff" element={<AdminRoute><Staff /></AdminRoute>} />
        <Route path="/admin/credentials" element={<AdminRoute><Credentials /></AdminRoute>} />
        <Route path="/admin/departments" element={<AdminRoute><Departments /></AdminRoute>} />
        <Route path="/admin/doctors" element={<AdminRoute><Doctors /></AdminRoute>} />
        <Route path="/admin/medicines" element={<AdminRoute><Medicines /></AdminRoute>} />
        <Route path="/admin/labtests" element={<AdminRoute><LabTests /></AdminRoute>} />
        <Route path="/admin/charges" element={<AdminRoute><Charges /></AdminRoute>} />
        <Route path="/admin/stock-requests" element={<AdminRoute><StockRequest /></AdminRoute>} />
        <Route path="/pharmacy/dashboard" element={<RequireRole roles={["Pharmacist"]}><RoleNotice title="Pharmacy workspace" message="Pharmacy workflows are outside the Admin module." /></RequireRole>} />
        <Route path="/lab/dashboard" element={<RequireRole roles={["Lab Technician"]}><RoleNotice title="Lab workspace" message="Lab workflows are outside the Admin module." /></RequireRole>} />
        <Route path="/doctor/dashboard" element={<RequireRole roles={["Doctor"]}><RoleNotice title="Doctor workspace" message="Doctor frontend and API workflows are not yet available in this project." /></RequireRole>} />
        <Route path="/reception/dashboard" element={<RequireRole roles={["Receptionist"]}><RoleNotice title="Reception workspace" message="Reception frontend and API workflows are not yet available in this project." /></RequireRole>} />
        <Route path="*" element={<Navigate to={roleRoutes[localStorage.getItem("role")] || "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
