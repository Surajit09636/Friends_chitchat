// Axios instance used for all API requests.
import axios from "axios";

// Configure the API base URL once.
const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

// Attach the auth token to every outgoing request if available.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Export the configured instance for reuse.
export default api;
