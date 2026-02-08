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
  const [showSignupSuccess, setShowSignupSuccess] = useState(false);

  // Show a temporary success message after signup.
  useEffect(() => {
    if (!location.state?.signupSuccess) return;

    setShowSignupSuccess(true);

    const timer = setTimeout(() => {
      setShowSignupSuccess(false);
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

      navigate("/");
    } catch (err) {
      setError("Invalid email/username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* One-time signup success toast */}
      {showSignupSuccess && (
        <div className="success-popup" role="alert">
          Your account has been created
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
