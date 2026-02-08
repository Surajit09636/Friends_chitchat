// Auth-related API wrappers.
import api from "./axios";

// Log in with identifier and password.
export const loginUser = (data) =>
  api.post("/login", data);

// Register a new account.
export const registerUser = (data) =>
  api.post("/register", data);

// Fetch the current authenticated user.
export const getMe = () =>
  api.get("/me");
