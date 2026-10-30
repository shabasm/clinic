import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errorMessage, validateForm } from "../services/api";

const roleRoutes = {
  Admin: "/admin/dashboard",
  Doctor: "/doctor/dashboard",
  Receptionist: "/reception/dashboard",
  Pharmacist: "/pharmacy/dashboard",
  "Lab Technician": "/lab/dashboard",
};

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!validateForm(event.currentTarget)) return;
    setSaving(true);
    try {
      const { data } = await api.post("login/", { username: username.trim(), password });
      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      const { data: currentUser } = await api.get("me/");
      const destination = roleRoutes[currentUser.role];
      if (!destination) {
        throw new Error("This account does not have a supported clinic role.");
      }
      localStorage.setItem("role", currentUser.role);
      localStorage.setItem("displayName", currentUser.display_name);
      navigate(destination, { replace: true });
    } catch (requestError) {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      localStorage.removeItem("role");
      localStorage.removeItem("displayName");
      setError(
        !requestError.response
          ? "Cannot reach the clinic API. Check that Django is running."
          : requestError.response.status === 401
            ? "Invalid username or password."
          : requestError.response.status === 403
            ? "This account is inactive. Contact the Admin."
            : errorMessage(requestError),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="login-page">
      <section className="card login-card shadow-sm">
        <div className="card-body p-4 p-md-5">
          <div className="brand-mark mb-3" aria-hidden="true">✚</div>
          <h1 className="h3 fw-bold mb-1">CareFlow Clinic</h1>
          <p className="text-muted mb-4">Sign in to your clinic workspace.</p>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label className="form-label required" htmlFor="username">Username</label>
              <input
                id="username"
                className="form-control"
                autoComplete="username"
                placeholder="Enter username"
                data-trim-required="true"
                title="Username is required."
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label className="form-label required" htmlFor="password">Password</label>
              <div className="input-group">
                <input
                  id="password"
                  className="form-control"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button className="btn btn-outline-secondary" type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button className="btn btn-primary w-100" disabled={saving} type="submit">
              {saving ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default Login;
