// Token-aware API client for the FastAPI backend.
// Dev calls go through the Vite proxy (vite.config.js) -> no CORS issues.
const BASE = import.meta.env.VITE_API_BASE ?? "";
const TOKEN_KEY = "itc_token";
const CLIENT_KEY = "itc_active_client";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const getActiveClient = () => localStorage.getItem(CLIENT_KEY);
export const setActiveClient = (id) => (id ? localStorage.setItem(CLIENT_KEY, id) : localStorage.removeItem(CLIENT_KEY));

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function req(path, { method = "GET", body, isForm } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const cid = getActiveClient();
  if (cid) headers["X-Client-Id"] = cid;

  let payload;
  if (isForm) payload = body;                      // FormData: let the browser set the boundary
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }

  const r = await fetch(`${BASE}${path}`, { method, headers, body: payload });

  if (r.status === 401) { setToken(null); onUnauthorized(); throw new Error("Session expired. Please log in again."); }
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const j = await r.json(); detail = j.detail || detail; } catch { /* non-JSON */ }
    throw new Error(detail);
  }
  if (r.status === 204) return null;
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? r.json() : r.text();
}

export const health = () =>
  fetch(`${BASE}/`).then((r) => { if (!r.ok) throw new Error("offline"); return r.json(); });

// ---- auth ----
export const requestOtp = (email) => req("/api/v1/auth/request-otp", { method: "POST", body: { email } });
export const register = (data) => req("/api/v1/auth/register", { method: "POST", body: data });
export const login = (email, password, otp) =>
  req("/api/v1/auth/login", { method: "POST", body: { email, password, ...(otp ? { otp } : {}) } });
export const me = () => req("/api/v1/auth/me");

// ---- clients (companies) ----
export const listClients = () => req("/api/v1/clients");
export const createClient = (data) => req("/api/v1/clients", { method: "POST", body: data }); // {gstin, legal_name, state_code}
export const deleteClient = (id) => req(`/api/v1/clients/${id}`, { method: "DELETE" });

// ---- runs ----
export const recentRuns = (limit = 10) => req(`/api/v1/runs/recent?limit=${limit}`); // { runs: [...] }

// ---- exports ----
// Streams a generated file back; we read it as a blob and trigger a browser download.
export async function downloadReport(runId, type, format = "csv") {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const cid = getActiveClient();
  if (cid) headers["X-Client-Id"] = cid;

  const r = await fetch(`${BASE}/api/v1/runs/${runId}/reports/${type}?format=${format}`, { headers });
  if (r.status === 401) { setToken(null); onUnauthorized(); throw new Error("Session expired."); }
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { const j = await r.json(); detail = j.detail || detail; } catch { /* non-JSON */ }
    throw new Error(detail);
  }
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const name = m ? m[1] : `${type}_${runId}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---- reconcile (kept) ----
export async function reconcile(prFile, twobFile) {
  const fd = new FormData();
  fd.append("purchase_register", prFile);
  fd.append("gstr_2b", twobFile);
  const summary = await req("/api/v1/reconcile", { method: "POST", body: fd, isForm: true });
  const runId = summary.run_id ?? null;
  let rows = [];
  if (runId) {
    try { const d = await req(`/api/v1/runs/${runId}/results`); rows = Array.isArray(d.database_rows) ? d.database_rows : []; }
    catch { /* best effort */ }
  }
  return { runId, rows, total: summary.total_records_committed ?? rows.length };
}
