# GST ITC Reconciler — Frontend

React + Vite single-page app for the ITC reconciliation engine. It runs
standalone on mock data, and the **New run** screen is wired to the backend's
`POST /api/v1/reconcile` endpoint (multipart CSV upload).

## Run it

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Talking to the backend

In dev, API calls go through the Vite proxy (`vite.config.js`) so there are no
CORS issues:

- `/api/*`   → `http://localhost:8000` (your FastAPI app)
- `/healthz` → `http://localhost:8000/` (root health check)

Start your backend first (from the project root):

```bash
uvicorn app.main:app --reload --port 8000
```

The top bar shows **API connected / offline** based on a health check.
On the **New run** page, pick a Purchase Register CSV and a GSTR-2B CSV and hit
**Start reconciliation** — it calls the engine and shows live bucket counts.

If your API runs somewhere else, either change the proxy target in
`vite.config.js`, or set `VITE_API_BASE` in a `.env` file (see `.env.example`).

## Structure

```
frontend/
├─ index.html
├─ vite.config.js        # dev server + API proxy
├─ package.json
├─ .env.example
└─ src/
   ├─ main.jsx
   ├─ index.css
   ├─ App.jsx            # the whole UI (sidebar, pages, client switcher)
   └─ api/client.js      # health() + reconcile() — the backend calls
```

## What's mock vs live

- **Live:** backend health indicator; New run → `reconcile()`; the results
  KPI bucket counts after a run.
- **Mock (until M7 endpoints exist):** dashboards, the per-invoice results
  table, review queue, reports, settings. Each list is a clearly-marked
  swap point for real API data.

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview     # serve the build locally
```
