// WebSocket helpers for realtime message traffic.
// Override with REACT_APP_WS_BASE_URL when deploying.
const WS_BASE_URL =
  process.env.REACT_APP_WS_BASE_URL || "ws://127.0.0.1:8000";

export const createMessageSocket = (token) => {
  // Encode the token as a query param (browser WebSocket APIs block headers).
  const encoded = encodeURIComponent(token);
  return new WebSocket(`${WS_BASE_URL}/ws/messages?token=${encoded}`);
};
