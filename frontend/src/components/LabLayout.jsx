import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

const LINKS = [
  { to: "/lab/orders", label: "Lab Orders" },
  { to: "/lab/results", label: "Results & Reports" },
  { to: "/lab/bills", label: "Billing" },
];

/* The navbar and page frame shared by all Laboratory pages. */
export default function LabLayout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const displayName = localStorage.getItem("displayName") || "Lab Technician";

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("role");
    localStorage.removeItem("displayName");
    navigate("/login", { replace: true });
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark d-print-none">
        <div className="container-xl">
          <div className="d-flex align-items-center text-nowrap">
            <NavLink className="navbar-brand mb-0" to="/lab/orders">✚ CareFlow</NavLink>
            <span className="navbar-text text-white-50">{displayName}</span>
          </div>
          <button
            className="navbar-toggler"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className={`collapse navbar-collapse ${open ? "show" : ""}`}>
            <ul className="navbar-nav ms-lg-auto">
              {LINKS.map((l) => (
                <li className="nav-item" key={l.to}>
                  <NavLink
                    to={l.to}
                    className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <button className="btn btn-light btn-sm ms-lg-3 mt-2 mt-lg-0" type="button" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="container pb-5">
        <Outlet />
      </main>
    </>
  );
}
