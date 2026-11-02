import { NavLink, useNavigate } from "react-router-dom";

function DoctorNavbar() {
  const navigate = useNavigate();
  const menus = [
    { name: "Patient Queue", path: "/doctor/queue" },
    { name: "Past Consultations", path: "/doctor/past-consultations" },
    { name: "Patient History", path: "/doctor/patient-history" },
  ];

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("role");
    localStorage.removeItem("displayName");
    navigate("/login", { replace: true });
  };

  const displayName = localStorage.getItem("displayName") || "Doctor";

  return (
    <nav className="navbar navbar-expand-xl navbar-dark d-print-none">
      <div className="container-xl">
        <div className="d-flex align-items-center text-nowrap">
          <NavLink className="navbar-brand fw-bold mb-0" to="/doctor/queue">
            ✚ CareFlow
          </NavLink>
          <span className="navbar-text text-white-50 ms-2">
            {displayName}
          </span>
        </div>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#doctorNavbar"
          aria-controls="doctorNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="doctorNavbar">
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
            type="button"
            className="btn btn-light btn-sm ms-xl-3 mt-2 mt-xl-0"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

export default DoctorNavbar;
