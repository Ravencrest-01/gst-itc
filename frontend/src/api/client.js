// API client for the FastAPI backend.
// Dev calls go through the Vite proxy (vite.config.js) -> no CORS issues.
// Set VITE_API_BASE in prod.
const BASE = import.meta.env.VITE_API_BASE ?? "";

export async function health() {
  const r = await fetch(`${BASE}/healthz`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}

// GET /api/v1/runs/{run_id}/results -> { run_id, count, database_rows: [MatchResult...] }
export async function getResults(runId) {
  const r = await fetch(`${BASE}/api/v1/runs/${runId}/results`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return Array.isArray(d.database_rows) ? d.database_rows : [];
}

// Two-step: POST reconcile (returns an object, NOT a list), then GET the saved rows.
// POST /api/v1/reconcile (multipart) -> { status, run_id, total_records_committed }
export async function reconcile(prFile, twobFile) {
  const fd = new FormData();
  fd.append("purchase_register", prFile);
  fd.append("gstr_2b", twobFile);
  const r = await fetch(`${BASE}/api/v1/reconcile`, { method: "POST", body: fd });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  const summary = await r.json(); // { status, run_id, total_records_committed }
  const runId = summary.run_id ?? null;

  let rows = [];
  if (runId) {
    try {
      rows = await getResults(runId); // pull the persisted MatchResult rows
    } catch {
      /* results fetch is best-effort; we still return the run + total */
    }
  }
  return { runId, rows, total: summary.total_records_committed ?? rows.length };
}
