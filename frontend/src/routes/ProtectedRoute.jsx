import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* Pages inside this route need a logged-in user.
   TODO: once the backend has a "current user" endpoint that returns the role,
   also check the role here (e.g. only "Lab Technician" may open /lab). */
export default function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}
