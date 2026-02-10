// React hooks and router utilities for verification flow.
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
// API wrapper for verification.
import {
  confirmEmailVerification,
  requestEmailVerification,
} from "../api/authApi";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialEmail = location.state?.email || "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState(
    location.state?.sendFailed
      ? "We could not send a verification code. Please resend."
      : initialEmail
      ? `We sent a verification code to ${initialEmail}.`
      : ""
  );
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleResend = async () => {
    if (!email) {
      setError("Email is required");
      return;
    }

    try {
      setSending(true);
      setError("");
      setInfo("");

      await requestEmailVerification(email);

      setInfo(`We sent a verification code to ${email}.`);
    } catch (err) {
      setError("Could not send verification code");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!email || !code) {
      setError("Email and code are required");
      return;
    }

    try {
      setVerifying(true);
      setError("");

      await confirmEmailVerification(email, code);

      navigate("/login", { state: { emailVerified: true } });
    } catch (err) {
      setError("Invalid or expired verification code");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="login-page">
      {/* Verification form */}
      <form className="login-card" onSubmit={handleVerify}>
        <h2>Verify your email</h2>

        {/* Info text */}
        {info && <p className="auth-footer">{info}</p>}

        {/* API error message */}
        {error && <p className="error">{error}</p>}

        {/* Email input */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {/* Code input */}
        <input
          type="text"
          placeholder="Verification code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />

        {/* Verify button */}
        <button disabled={verifying}>
          {verifying ? "Verifying..." : "Verify email"}
        </button>

        {/* Resend button */}
        <button type="button" onClick={handleResend} disabled={sending || !email}>
          {sending ? "Sending..." : "Resend code"}
        </button>

        {/* Link to login */}
        <p className="auth-footer">
          Already verified?{" "}
          <Link className="auth-link" to="/login">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
