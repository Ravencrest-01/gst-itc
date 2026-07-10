import { apiClient, apiEvents } from "./client";
export { apiEvents };

// Auth
export const register = (data) => apiClient.post("/v1/auth/register", data);
export const login = (data) => apiClient.post("/v1/auth/login", data);
export const getMe = () => apiClient.get("/v1/auth/me");

// Clients
export const listClients = () => apiClient.get("/v1/clients");
export const createClient = (data) => apiClient.post("/v1/clients", data);
export const getClient = (id) => apiClient.get(`/v1/clients/${id}`);
export const deleteClient = (id) => apiClient.delete(`/v1/clients/${id}`);

// Files
export const listFiles = (clientId) => apiClient.get(`/v1/clients/${clientId}/files`);

// Reconciliation Runs
export const createRun = (formData) => apiClient.post("/v1/reconcile", formData, { headers: { "Content-Type": "multipart/form-data" } });
export const listRecentRuns = () => apiClient.get("/v1/runs/recent");
export const getRunResults = (id) => apiClient.get(`/v1/runs/${id}/results`);
export const getRunSummary = (id) => apiClient.get(`/v1/runs/${id}/summary`);
export const getRunProbableMatches = (id) => apiClient.get(`/v1/runs/${id}/probable`);
export const updateMatchStatus = (id, data) => apiClient.patch(`/v1/reconcile/matches/${id}`, data);

// Dashboard
export const getDashboardKpis = () => apiClient.get("/v1/dashboard/kpis");
