// Auth-related API wrappers.
import api from "./axios";

const toEmailPayload = (email) => ({ email: String(email || "").trim() });

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

// Send a friend request by user id.
export const sendFriendRequest = (friendId) =>
  api.post(`/friend-requests/${friendId}`);

// Fetch incoming/outgoing pending friend requests.
export const getFriendRequests = () =>
  api.get("/friend-requests");

// Accept a pending friend request.
export const acceptFriendRequest = (requestId) =>
  api.post(`/friend-requests/${requestId}/accept`);

// Decline a pending friend request.
export const declineFriendRequest = (requestId) =>
  api.post(`/friend-requests/${requestId}/decline`);

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

// Edit a message in a chat.
// Payload should include `{ ciphertext, iv }`.
export const editChatMessage = (friendId, messageId, payload) =>
  api.patch(`/chats/${friendId}/messages/${messageId}`, payload);

// Delete one message from your chat or from everyone.
// Scope should be either `me` or `everyone`.
export const deleteChatMessage = (friendId, messageId, scope = "me") =>
  api.delete(`/chats/${friendId}/messages/${messageId}`, { params: { scope } });

// Delete the full chat history with a friend for the current user.
export const deleteFriendChat = (friendId) =>
  api.delete(`/chats/${friendId}`);

// Remove a user from the friend list (both directions).
export const removeFriend = (friendId) =>
  api.delete(`/friends/${friendId}`);

// Fetch the current user's encrypted key bundle.
export const getCryptoProfile = () =>
  api.get("/crypto/profile");

// Save (or replace) the current user's encrypted key bundle.
export const saveCryptoProfile = (payload) =>
  api.post("/crypto/profile", payload);

// Request an email verification code.
export const requestEmailVerification = (email) =>
  api.post("/verification/request", toEmailPayload(email));

// Confirm the email verification code.
export const confirmEmailVerification = (email, code) =>
  api.post("/verification/confirm", {
    ...toEmailPayload(email),
    code: String(code || "").trim(),
  });

// Request a password reset code.
export const requestPasswordReset = (email) =>
  api.post("/password/forgot", toEmailPayload(email));

// Confirm a password reset with code + new password.
export const confirmPasswordReset = (email, code, new_password) =>
  api.post("/password/reset", {
    ...toEmailPayload(email),
    code: String(code || "").trim(),
    new_password,
  });
