import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../api/authApi";
import PasswordInput from "../components/PasswordInput";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e) => {
    e.preventDefault();

    if (!email) {
      setError("Email is required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setInfo("");

      await requestPasswordReset(email);

      setInfo(`Reset code sent to ${email}.`);
      setStep("reset");
    } catch (err) {
      setError("Could not send reset code");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setInfo("");

      await confirmPasswordReset(email, code, newPassword);

      navigate("/login", { state: { passwordReset: true } });
    } catch (err) {
      setError("Invalid or expired reset code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={step === "request" ? handleRequest : handleReset}
      >
        <h2>Reset password</h2>

        {info && <p className="auth-footer">{info}</p>}
        {error && <p className="error">{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {step === "reset" && (
          <>
            <input
              type="text"
              placeholder="Reset code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <PasswordInput
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              name="newPassword"
            />
            <PasswordInput
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              name="confirmPassword"
            />
          </>
        )}

        <button disabled={loading}>
          {loading
            ? step === "request"
              ? "Sending code..."
              : "Updating password..."
            : step === "request"
            ? "Send reset code"
            : "Update password"}
        </button>

        {step === "reset" && (
          <button type="button" onClick={() => setStep("request")}>
            Send a new code
          </button>
        )}

        <p className="auth-footer">
          Remembered your password?{" "}
          <Link className="auth-link" to="/login">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
