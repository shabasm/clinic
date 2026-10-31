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
    <nav className="navbar navbar-expand-xl navbar-dark bg-dark d-print-none shadow-sm mb-4">
      <div className="container-xl">
        <div className="d-flex align-items-center text-nowrap">
          <NavLink className="navbar-brand fw-bold mb-0 text-white" to="/doctor/queue">
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
                  `nav-link px-3 ${isActive ? "active fw-semibold text-white" : "text-white-50"}`
                }
              >
                {menu.name}
              </NavLink>
            ))}
          </div>

          <div className="d-flex align-items-center ms-xl-3 mt-3 mt-xl-0">
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default DoctorNavbar;
