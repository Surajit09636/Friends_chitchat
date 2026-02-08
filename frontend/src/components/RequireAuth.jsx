import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const parseJwtPayload = (token) => {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "="
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const isTokenExpired = (token) => {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 < Date.now();
};

export default function RequireAuth({ children }) {
  const location = useLocation();
  const { logout } = useAuth();
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isTokenExpired(token)) {
    logout();
    return <Navigate to="/login" replace />;
  }

  return children;
}
