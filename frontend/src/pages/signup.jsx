// React hooks and router utilities for signup flow.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
// API wrapper for registration.
import { registerUser, requestEmailVerification } from "../api/authApi";
import PasswordInput from "../components/PasswordInput";

export default function Signup() {
  // Navigation hook.
  const navigate = useNavigate();

  // Form state.
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Submit the signup form and redirect to verification on success.
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic client-side check for matching passwords.
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await registerUser({ name, username, email, password });

      let sendFailed = false;
      try {
        await requestEmailVerification(email);
      } catch (err) {
        sendFailed = true;
      }

      navigate("/verify-email", { state: { email, sendFailed } });
    } catch (err) {
      const statusCode = err.response?.status;
      const detail = err.response?.data?.detail;

      if (statusCode === 409 && detail) {
        setError(detail);
      } else {
        setError("Could not create account");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Signup form */}
      <form className="login-card" onSubmit={handleSubmit}>
        <h2>Create Account</h2>

        {/* API error message */}
        {error && <p className="error">{error}</p>}

        {/* Name input */}
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        {/* Username input */}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        {/* Email input */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {/* Password input */}
        <PasswordInput
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          name="password"
        />

        {/* Confirm password input */}
        <PasswordInput
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          name="confirmPassword"
        />

        {/* Submit button */}
        <button disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>

        {/* Link to login */}
        <p className="auth-footer">
          Already have an account?{" "}
          <Link className="auth-link" to="/login">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
