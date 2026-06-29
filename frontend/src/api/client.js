// API client for the FastAPI backend.
// Dev calls go through the Vite proxy (vite.config.js) -> no CORS issues.
const BASE = import.meta.env.VITE_API_BASE ?? "";

function getHeaders() {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------
// AUTHENTICATION & OTP
// ---------------------------------------------------------
export async function health() {
  const r = await fetch(`${BASE}/healthz`);
  return handleResponse(r);
}

export async function requestOtp(email) {
  const r = await fetch(`${BASE}/api/v1/auth/request-otp`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ email }),
  });
  return handleResponse(r);
}

export async function register({ email, password, fullName, workspaceName, workspaceType, otp }) {
  const r = await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      email,
      password,
      full_name: fullName,
      workspace_name: workspaceName,
      workspace_type: workspaceType || "ca_firm",
      otp,
    }),
  });
  return handleResponse(r);
}

export async function login({ email, password, otp }) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ email, password, otp }),
  });
  return handleResponse(r);
}

export async function getCurrentUser() {
  const r = await fetch(`${BASE}/api/v1/auth/me`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

// ---------------------------------------------------------
// WORKSPACE & CLIENTS
// ---------------------------------------------------------
export async function getWorkspace() {
  const r = await fetch(`${BASE}/api/v1/workspace`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getClients() {
  const r = await fetch(`${BASE}/api/v1/clients`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function addClient({ legalName, gstin, stateCode }) {
  const r = await fetch(`${BASE}/api/v1/clients`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      legal_name: legalName,
      gstin,
      state_code: stateCode,
    }),
  });
  return handleResponse(r);
}

export async function getClientDetails(clientId) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

// ---------------------------------------------------------
// RECONCILIATION FLOW
// ---------------------------------------------------------
export async function getClientRuns(clientId) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}/runs`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getRunSummary(runId) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}/summary`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getRunInvoices(runId) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}/invoices`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getRunResults(runId) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}/results`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getRunProbable(runId) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}/probable`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function submitReviewMatch(runId, matchId, { status, overrideBucket }) {
  const r = await fetch(`${BASE}/api/v1/reconcile/matches/${matchId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({
      status,
      override_bucket: overrideBucket,
    }),
  });
  return handleResponse(r);
}

export async function reconcile(prFile, twobFile) {
  const fd = new FormData();
  fd.append("purchase_register", prFile);
  fd.append("gstr_2b", twobFile);
  
  const token = localStorage.getItem("token");
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const r = await fetch(`${BASE}/api/v1/reconcile`, {
    method: "POST",
    headers,
    body: fd,
  });
  return handleResponse(r);
}

export async function updateWorkspace({ name, type }) {
  const r = await fetch(`${BASE}/api/v1/workspace`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ name, type }),
  });
  return handleResponse(r);
}

export async function inviteUser({ fullName, email, role }) {
  const r = await fetch(`${BASE}/api/v1/users`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ fullName, email, role }),
  });
  return handleResponse(r);
}

export async function getWorkspaceSettings() {
  const r = await fetch(`${BASE}/api/v1/workspace/settings`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function updateWorkspaceSettings({ tax_tolerance, date_window_days, fuzzy_threshold }) {
  const r = await fetch(`${BASE}/api/v1/workspace/settings`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ tax_tolerance, date_window_days, fuzzy_threshold }),
  });
  return handleResponse(r);
}

export async function getClientSettings(clientId) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}/settings`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function updateClientSettings(clientId, { tax_tolerance, date_window_days, fuzzy_threshold }) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}/settings`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ tax_tolerance, date_window_days, fuzzy_threshold }),
  });
  return handleResponse(r);
}

export async function getClientVendors(clientId) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}/vendors`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getDashboardKpis() {
  const r = await fetch(`${BASE}/api/v1/dashboard/kpis`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function updateClient(clientId, { legalName, gstin, stateCode }) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ legal_name: legalName, gstin, state_code: stateCode }),
  });
  return handleResponse(r);
}

export async function downloadReport(runId, reportType) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}/reports/${reportType}`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function deleteClient(clientId) {
  const r = await fetch(`${BASE}/api/v1/clients/${clientId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return handleResponse(r);
}

export async function getWorkspaceUsers() {
  const r = await fetch(`${BASE}/api/v1/users`, {
    headers: getHeaders(),
  });
  return handleResponse(r);
}
