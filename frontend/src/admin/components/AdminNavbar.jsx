
import { NavLink, useNavigate } from "react-router-dom";

function AdminNavbar() {
  const navigate = useNavigate();
  const menus = [
    { name: "Dashboard", path: "/admin/dashboard" },
    { name: "Staff", path: "/admin/staff" },
    { name: "Credentials", path: "/admin/credentials" },
    { name: "Departments", path: "/admin/departments" },
    { name: "Doctors", path: "/admin/doctors" },
    { name: "Medicines", path: "/admin/medicines" },
    { name: "Lab Tests", path: "/admin/labtests" },
    { name: "Charges", path: "/admin/charges" },
    { name: "Stock Requests", path: "/admin/stock-requests" },
  ];

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("role");
    localStorage.removeItem("displayName");
    navigate("/login", { replace: true });
  };

  return (
    <nav
      className="navbar navbar-expand-xl navbar-dark"
    >
      <div className="container-xl">
        <div className="d-flex align-items-center text-nowrap">
          <NavLink className="navbar-brand fw-bold mb-0" to="/admin/dashboard">
            ✚ CareFlow
          </NavLink>
          <span className="navbar-text text-white-50">
            {localStorage.getItem("displayName") || "Administrator"}
          </span>
        </div>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#adminNavbar"
          aria-controls="adminNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="adminNavbar">
          <div className="navbar-nav ms-xl-auto">
            {menus.map((menu) => (
              <NavLink
                key={menu.path}
                to={menu.path}
                className={({ isActive }) =>
                  `nav-link px-3 ${isActive ? "active fw-bold" : ""}`
                }
              >
                {menu.name}
              </NavLink>
            ))}
          </div>
          <button
            className="btn btn-light btn-sm ms-xl-3 mt-2 mt-xl-0"
            type="button"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

export default AdminNavbar;
