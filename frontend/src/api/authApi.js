// Auth-related API wrappers.
import api from "./axios";

// Log in with identifier and password.
export const loginUser = (data) =>
  api.post("/login", data);

// Register a new account.
export const registerUser = (data) =>
  api.post("/signup", data);

// Fetch the current authenticated user.
export const getMe = () =>
  api.get("/me");

// Request an email verification code.
export const requestEmailVerification = (email) =>
  api.post("/verification/request", { email });

// Confirm the email verification code.
export const confirmEmailVerification = (email, code) =>
  api.post("/verification/confirm", { email, code });
