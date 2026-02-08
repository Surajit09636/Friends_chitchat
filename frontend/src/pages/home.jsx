import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Home() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>You are logged in</h2>
        {user?.identifier && (
          <p className="auth-footer">Signed in as {user.identifier}</p>
        )}

        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
