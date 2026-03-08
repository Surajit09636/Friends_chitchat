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

// Search users for new chats.
export const searchUsers = (query) =>
  api.get("/users/search", { params: { q: query } });

// Add a friend by user id.
export const addFriend = (friendId) =>
  api.post(`/friends/${friendId}`);

// Fetch chat threads for the current user.
export const getChatThreads = () =>
  api.get("/chats");

// Fetch messages for a friend chat.
export const getChatMessages = (friendId) =>
  api.get(`/chats/${friendId}/messages`);

// Send a message to a friend (HTTP fallback; WebSocket is preferred).
// Payload should include `{ ciphertext, iv }`.
export const sendChatMessage = (friendId, payload) =>
  api.post(`/chats/${friendId}/messages`, payload);

// Fetch the current user's encrypted key bundle.
export const getCryptoProfile = () =>
  api.get("/crypto/profile");

// Save (or replace) the current user's encrypted key bundle.
export const saveCryptoProfile = (payload) =>
  api.post("/crypto/profile", payload);

// Request an email verification code.
export const requestEmailVerification = (email) =>
  api.post("/verification/request", { email });

// Confirm the email verification code.
export const confirmEmailVerification = (email, code) =>
  api.post("/verification/confirm", { email, code });

// Request a password reset code.
export const requestPasswordReset = (email) =>
  api.post("/password/forgot", { email });

// Confirm a password reset with code + new password.
export const confirmPasswordReset = (email, code, new_password) =>
  api.post("/password/reset", { email, code, new_password });
