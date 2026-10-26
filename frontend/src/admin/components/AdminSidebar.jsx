
import { NavLink } from "react-router-dom";

function AdminSidebar() {
  const menus = [
    { name: "Dashboard", path: "/admin/dashboard" },
    { name: "Staff", path: "/admin/staff" },
    { name: "Credentials", path: "/admin/credentials" },
    { name: "Doctors", path: "/admin/doctors" },
    { name: "Medicines", path: "/admin/medicines" },
    { name: "Lab Tests", path: "/admin/labtests" },
    { name: "Charges", path: "/admin/charges" },
    { name: "Stock Requests", path: "/admin/stock-requests" },
  ];

  return (
    <div
      className="bg-dark text-white p-3 min-vh-100"
      style={{ width: "240px", flexShrink: 0 }}
    >
      <h4 className="mb-4">CareFlow</h4>
      <h6 className="text-white-50 mb-3">ADMIN PANEL</h6>

      <nav className="nav flex-column gap-2">
        {menus.map((menu) => (
          <NavLink
            key={menu.path}
            to={menu.path}
            className={({ isActive }) =>
              `nav-link rounded ${
                isActive
                  ? "bg-primary text-white"
                  : "text-white"
              }`
            }
          >
            {menu.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default AdminSidebar;
