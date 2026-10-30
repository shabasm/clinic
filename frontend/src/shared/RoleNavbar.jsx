import { useNavigate } from "react-router-dom";

function RoleNavbar({ title }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const displayName = localStorage.getItem("displayName") || role || "Clinic staff";

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("role");
    localStorage.removeItem("displayName");
    navigate("/login", { replace: true });
  };

  return (
    <nav className="navbar navbar-expand navbar-dark" aria-label={title}>
      <div className="container-xl">
        <div className="d-flex align-items-center text-nowrap">
          <span className="navbar-brand fw-bold mb-0">✚ CareFlow</span>
          <span className="navbar-text text-white-50">{displayName}</span>
        </div>
        <div className="ms-auto d-flex gap-2 align-items-center">
          {role === "Admin" && (
            <button className="btn btn-outline-light btn-sm" type="button" onClick={() => navigate("/admin/dashboard")}>
              Admin workspace
            </button>
          )}
          <button className="btn btn-light btn-sm" type="button" onClick={logout}>Logout</button>
        </div>
      </div>
    </nav>
  );
}

export default RoleNavbar;
