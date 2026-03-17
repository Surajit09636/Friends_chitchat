// Axios instance used for all API requests.
import axios from "axios";

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://friends-chitchat-ypqb.onrender.com"
    : "http://127.0.0.1:8000";

const API_BASE_URL = (
  process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");
const API_TIMEOUT_MS = 30000;
const MAX_WAKE_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1200;

const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests
  500,
  502,
  503,
  504,
  522, // Connection timed out (proxy/CDN edge cases)
  523,
  524,
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getRetryDelay = (attempt) => BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);

const isRetryableError = (error) => {
  const status = error?.response?.status;
  const code = error?.code;

  if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
  if (code === "ECONNABORTED" || code === "ERR_NETWORK" || code === "ETIMEDOUT") {
    return true;
  }

  // Network-level failures often have no response object.
  return !error?.response;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// Attach the auth token to every outgoing request if available.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// If a token is expired/invalid, clear it and bounce to login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
      return Promise.reject(error);
    }

    const requestConfig = error.config;
    if (!requestConfig || requestConfig.skipRetry) {
      return Promise.reject(error);
    }

    if (!isRetryableError(error)) {
      return Promise.reject(error);
    }

    const retryCount = requestConfig.__retryCount || 0;
    if (retryCount >= MAX_WAKE_RETRIES) {
      return Promise.reject(error);
    }

    requestConfig.__retryCount = retryCount + 1;
    await sleep(getRetryDelay(requestConfig.__retryCount));
    return api(requestConfig);
  }
);

// Export the configured instance for reuse.
export default api;
