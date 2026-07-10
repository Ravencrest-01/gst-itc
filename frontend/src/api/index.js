import { apiClient, apiEvents } from "./client";
export { apiEvents };

// Auth
export const requestOtp = (data) => apiClient.post("/v1/auth/request-otp", data);
export const register = (data) => apiClient.post("/v1/auth/register", data);
export const login = (data) => apiClient.post("/v1/auth/login", data);
export const getMe = () => apiClient.get("/v1/auth/me");

// Clients
export const listClients = () => apiClient.get("/v1/clients");
export const createClient = (data) => apiClient.post("/v1/clients", data);
export const getClient = (id) => apiClient.get(`/v1/clients/${id}`);
export const updateClient = (id, data) => apiClient.patch(`/v1/clients/${id}`, data);
export const deleteClient = (id) => apiClient.delete(`/v1/clients/${id}`);
export const getClientSettings = (id) => apiClient.get(`/v1/clients/${id}/settings`);
export const updateClientSettings = (id, data) => apiClient.patch(`/v1/clients/${id}/settings`, data);

// Vendors
export const listVendors = (clientId) => apiClient.get(`/v1/clients/${clientId}/vendors`);
export const createVendor = (clientId, data) => apiClient.post(`/v1/clients/${clientId}/vendors`, data);
export const updateVendor = (clientId, vendorId, data) => apiClient.patch(`/v1/clients/${clientId}/vendors/${vendorId}`, data);
export const deleteVendor = (clientId, vendorId) => apiClient.delete(`/v1/clients/${clientId}/vendors/${vendorId}`);

// Files
export const listFiles = (clientId) => apiClient.get(`/v1/clients/${clientId}/files`);
export const uploadFile = (clientId, formData) => apiClient.post(`/v1/clients/${clientId}/files`, formData, { headers: { "Content-Type": "multipart/form-data" } });
export const downloadFile = (fileId) => apiClient.get(`/v1/files/${fileId}/download`, { responseType: 'blob' });
export const deleteFile = (fileId) => apiClient.delete(`/v1/files/${fileId}`);

// Reconciliation Runs
export const createRun = (formData) => apiClient.post("/v1/reconcile", formData, { headers: { "Content-Type": "multipart/form-data" } });
export const listRecentRuns = () => apiClient.get("/v1/runs/recent");
export const getClientRuns = (clientId) => apiClient.get(`/v1/clients/${clientId}/runs`);
export const getRunResults = (id) => apiClient.get(`/v1/runs/${id}/results`);
export const getRunSummary = (id) => apiClient.get(`/v1/runs/${id}/summary`);
export const getRunInvoices = (id) => apiClient.get(`/v1/runs/${id}/invoices`);
export const getRunProbableMatches = (id) => apiClient.get(`/v1/runs/${id}/probable`);
export const updateMatchStatus = (id, data) => apiClient.patch(`/v1/reconcile/matches/${id}`, data);
export const updateRunStatus = (id, status) => apiClient.patch(`/v1/runs/${id}/status?status=${status}`);
export const deleteRun = (id) => apiClient.delete(`/v1/runs/${id}`);

// Reports & Exports
export const getRunReport = (id, type) => apiClient.get(`/v1/runs/${id}/reports/${type}`);
export const exportToTally = (id) => apiClient.get(`/v1/runs/${id}/exports/tally`, { responseType: 'blob' });

// Integrations
export const importFromTally = (clientId, data) => apiClient.post(`/v1/clients/${clientId}/tally/import`, data);
export const updateGstnCredentials = (clientId, data) => apiClient.post(`/v1/clients/${clientId}/gstn/credentials`, data);
export const fetchGstr2b = (clientId, data) => apiClient.post(`/v1/clients/${clientId}/gstn/fetch-2b`, data);
export const getGstnJobStatus = (jobId) => apiClient.get(`/v1/gstn/jobs/${jobId}`);

// Team & Workspace
export const listUsers = () => apiClient.get("/v1/users");
export const inviteUser = (data) => apiClient.post("/v1/users", data);
export const getWorkspace = () => apiClient.get("/v1/workspace");
export const updateWorkspace = (data) => apiClient.patch("/v1/workspace", data);
export const getWorkspaceSettings = () => apiClient.get("/v1/workspace/settings");
export const updateWorkspaceSettings = (data) => apiClient.patch("/v1/workspace/settings", data);
export const getDashboardKpis = () => apiClient.get("/v1/dashboard/kpis");

// Subscription
export const getSubscription = () => apiClient.get("/v1/workspace/subscription");
export const createSubscription = (data) => apiClient.post("/v1/workspace/subscription", data);
export const updateSubscription = (data) => apiClient.patch("/v1/workspace/subscription", data);
