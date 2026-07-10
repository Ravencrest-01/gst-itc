import axios from "axios";

// Create custom event target for auth/client events
export const apiEvents = new EventTarget();

const baseURL = import.meta.env.VITE_API_BASE || "/api";

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for token and client ID
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  const activeClientId = localStorage.getItem("active_client_id");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (activeClientId) {
    config.headers["X-Client-Id"] = activeClientId;
  }
  return config;
}, (error) => Promise.reject(error));

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Handle network errors (offline)
    if (!error.response) {
      const offlineError = new Error("Network error. You may be offline or the server is unreachable.");
      offlineError.isOffline = true;
      return Promise.reject(offlineError);
    }

    const { status, data } = error.response;

    // Handle 401 Unauthorized globally
    if (status === 401) {
      apiEvents.dispatchEvent(new Event("unauthorized"));
    }

    // Extract detail message if present
    const message = data?.detail || data?.message || "An unexpected error occurred.";
    const formattedError = new Error(message);
    formattedError.status = status;
    formattedError.data = data;
    
    return Promise.reject(formattedError);
  }
);
