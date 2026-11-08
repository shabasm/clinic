import { useNavigate } from "react-router-dom";

function RoleNavbar({ title, navItems = [], activeItem, onNavigate }) {
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
    <nav className="navbar navbar-expand-xl navbar-dark" aria-label={title}>
      <div className="container-xl">
        <div className="d-flex align-items-center text-nowrap">
          <span className="navbar-brand fw-bold mb-0">✚ CareFlow</span>
          <span className="navbar-text text-white-50">{displayName}</span>
        </div>
        {navItems.length > 0 && <button className="navbar-toggler ms-auto" type="button" data-bs-toggle="collapse" data-bs-target="#roleNavbar" aria-controls="roleNavbar" aria-expanded="false" aria-label="Toggle navigation"><span className="navbar-toggler-icon" /></button>}
        <div className={navItems.length ? "collapse navbar-collapse" : "navbar-collapse ms-auto"} id="roleNavbar">
          {navItems.length > 0 && <div className="navbar-nav ms-xl-auto">
            {navItems.map((item) => <button key={item} className={`nav-link px-3${activeItem === item ? " active fw-bold" : ""}`} type="button" aria-current={activeItem === item ? "page" : undefined} onClick={() => onNavigate?.(item)}>{item}</button>)}
          </div>}
          <div className={`d-flex gap-2 align-items-center${navItems.length ? " ms-xl-3" : " ms-auto"}`}>
          {role === "Admin" && (
            <button className="btn btn-outline-light btn-sm" type="button" onClick={() => navigate("/admin/dashboard")}>
              Admin workspace
            </button>
          )}
          <button className="btn btn-light btn-sm" type="button" onClick={logout}>Logout</button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default RoleNavbar;
