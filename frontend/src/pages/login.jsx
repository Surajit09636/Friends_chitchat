// React hooks and router utilities for login flow.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
// API and auth context.
import { loginUser } from "../api/authApi";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  // Navigation and context hooks.
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Form state.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  // Show a temporary success message after signup.
  useEffect(() => {
    const message = location.state?.emailVerified
      ? "Email verified. You can log in."
      : location.state?.signupSuccess
      ? "Your account has been created"
      : "";

    if (!message) return;

    setToastMessage(message);

    const timer = setTimeout(() => {
      setToastMessage("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [location.state]);

  // Submit the login form and store the auth token.
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      const res = await loginUser({ email: identifier, password });

      login(res.data.access_token, identifier);

      const destination = location.state?.from?.pathname || "/home";
      navigate(destination);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === "Email not verified") {
        setError("Email not verified. Please verify first.");
      } else {
        setError("Invalid email/username or password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* One-time signup success toast */}
      {toastMessage && (
        <div className="success-popup" role="alert">
          {toastMessage}
        </div>
      )}
      {/* Login form */}
      <form className="login-card" onSubmit={handleSubmit}>
        <h2>Welcome Back 👋</h2>

        {/* API error message */}
        {error && <p className="error">{error}</p>}

        {/* Identifier input */}
        <input
          type="text"
          placeholder="Email or username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />

        {/* Password input */}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {/* Submit button */}
        <button disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* Link to signup */}
        <p className="auth-footer">
          New here?{" "}
          <Link className="auth-link" to="/signup">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
