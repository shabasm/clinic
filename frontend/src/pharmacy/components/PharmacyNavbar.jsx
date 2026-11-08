import { NavLink, useNavigate } from "react-router-dom";

function PharmacyNavbar() {
  const navigate = useNavigate();
  const menus = [
    { name: "Dashboard", path: "/pharmacy/dashboard" },
    { name: "Prescriptions", path: "/pharmacy/prescriptions" },
    { name: "Inventory", path: "/pharmacy/inventory" },
    { name: "Stock Requests", path: "/pharmacy/stock-requests" },
    { name: "Bills", path: "/pharmacy/bills" },
  ];

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("role");
    localStorage.removeItem("displayName");
    navigate("/login", { replace: true });
  };

  return (
    <nav className="navbar navbar-expand-xl navbar-dark pharmacy-no-print d-print-none">
      <div className="container-xl">
        <div className="d-flex align-items-center text-nowrap">
          <NavLink className="navbar-brand fw-bold mb-0" to="/pharmacy/dashboard">
            ✚ CareFlow
          </NavLink>
          <span className="navbar-text text-white-50">
            {localStorage.getItem("displayName") || "Pharmacist"}
          </span>
        </div>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#pharmacyNavbar"
          aria-controls="pharmacyNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="pharmacyNavbar">
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

export default PharmacyNavbar;
