import { useNavigate } from "react-router-dom";

function RoleNavbar({ title }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("role");
    navigate("/login", { replace: true });
  };

  return (
    <nav className="navbar navbar-expand navbar-dark">
      <div className="container-xl">
        <span className="navbar-brand fw-bold">✚ CareFlow · {title}</span>
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
