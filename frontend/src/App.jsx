import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  LayoutDashboard, ArrowLeftRight, UploadCloud, FileText, Settings as SettingsIcon,
  Bell, HelpCircle, Search, Download, Play, AlertTriangle, Check, X, Briefcase,
  ChevronRight, ChevronLeft, ChevronDown, Building2, Users, SlidersHorizontal,
  FileSpreadsheet, Trash2, CheckCircle2, Plus, Filter, Columns3, Landmark,
  CloudDownload, ShieldCheck, CalendarClock, CreditCard, Loader2, LogOut,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { health, reconcile, listClients, createClient, deleteClient, recentRuns, getRunResults, downloadReport, setActiveClient as apiSetActiveClient } from "./api/client";
import { useAuth } from "./auth/AuthContext";

/* Group raw backend match rows (keyed by `bucket`) into our five buckets. */
function summarize(rows) {
  const counts = { matched: 0, mismatched: 0, missing_in_portal: 0, missing_in_books: 0, probable: 0 };
  (rows || []).forEach((r) => {
    const s = String(r.bucket || "").toLowerCase().replace(/\s+/g, "_");
    if (s.includes("missing") && s.includes("portal")) counts.missing_in_portal++;
    else if (s.includes("missing") && s.includes("book")) counts.missing_in_books++;
    else if (s.includes("mismatch")) counts.mismatched++;
    else if (s.includes("probable")) counts.probable++;
    else if (s.includes("match")) counts.matched++;
    else counts.probable++;
  });
  return counts;
}

/* ============================================================
   ITC-Rec Engine — MVP frontend (M8) · multi-client edition
   A workspace (CA firm or in-house company) owns many clients
   (taxpayer companies). All reconciliation pages are scoped to
   the active client; the practice dashboard aggregates across
   clients. Mock data only — // API: marks the M7 swap points.
   ============================================================ */

const C = {
  navy: "#1F4E79", navyDark: "#163A5A", blue: "#2E75B6", green2: "#1B7A4B",
  bg: "#F5F7FA", surface: "#FFFFFF", inlay: "#F8FAFC",
  border: "#E3E8EF", borderLite: "#EEF2F6", zebra: "#FAFBFC",
  text: "#1A1C1F", textMute: "#6B7785", textFaint: "#8A93A0",
  green: "#2E7D46", greenBg: "#E8F3EC",
  amber: "#B8860B", amberBg: "#FBF3E0",
  red: "#C0392B", redBg: "#FBEAE8",
  slate: "#6B7785", slateBg: "#EEF1F4",
};
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const TNUM = { fontVariantNumeric: "tabular-nums" };

const inr = (n) => "\u20B9" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const inrPlain = (n) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n);
const inrShort = (n) => {
  const a = Math.abs(n);
  if (a >= 1e7) return "\u20B9" + (n / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return "\u20B9" + (n / 1e5).toFixed(2) + " L";
  return inr(n);
};

const BUCKET = {
  matched: { label: "Matched", fg: C.green, bg: C.greenBg },
  mismatched: { label: "Mismatched", fg: C.amber, bg: C.amberBg },
  missing_in_portal: { label: "Missing in Portal", fg: C.red, bg: C.redBg },
  missing_in_books: { label: "Missing in Books", fg: C.slate, bg: C.slateBg },
  probable: { label: "Probable", fg: C.amber, bg: C.amberBg },
};

/* ============================================================
   MOCK DATA
   ============================================================ */
const WORKSPACE = { name: "Sharma & Associates", type: "ca_firm" }; // type: ca_firm | in_house

// Companies are fetched live from GET /api/v1/clients (see App()).

// Per-client run detail (illustrative — same shape for every client).  API: GET /clients/:cid/runs/:id/*
const INVOICES = [
  { id: 1, gstin: "27AAACR1234F1Z5", name: "Reliance Industries Ltd.", inv: "INV/26/00123", date: "12 Apr 2026", taxable: 150000, tax: 27000, src: "PR", diff: 0, bucket: "matched" },
  { id: 2, gstin: "29AAACT1234F1Z5", name: "Tata Motors Limited", inv: "TM/26/4452", date: "15 Apr 2026", taxable: 820000, tax: 231000, src: "2B", diff: 1500, bucket: "mismatched" },
  { id: 3, gstin: "29AAACI1234F1Z5", name: "Infosys Limited", inv: "INF/04/9921", date: "05 Apr 2026", taxable: 450000, tax: 81000, src: "PR", diff: -81000, bucket: "missing_in_portal" },
  { id: 4, gstin: "27AAACL1234F1Z5", name: "Larsen & Toubro Ltd.", inv: "LT/26/8834", date: "20 Apr 2026", taxable: 1200000, tax: 216000, src: "PR", diff: 0, bucket: "matched" },
  { id: 5, gstin: "07AAACW1234F1Z5", name: "Wipro Enterprises", inv: "WP-0012/26", date: "22 Apr 2026", taxable: 55000, tax: 9900, src: "2B", diff: 0, bucket: "missing_in_books" },
  { id: 6, gstin: "33AAACB1234F1Z5", name: "Bharti Airtel Ltd.", inv: "AB/44/001", date: "02 Apr 2026", taxable: 25000, tax: 4500, src: "PR", diff: 1, bucket: "probable" },
  { id: 7, gstin: "08AAACH1234F1Z5", name: "HDFC Bank Ltd.", inv: "HDFC/CHG/99", date: "30 Apr 2026", taxable: 12500, tax: 2250, src: "2B", diff: 0, bucket: "matched" },
  { id: 8, gstin: "27AAACM1234F1Z5", name: "Mahindra & Mahindra", inv: "MM/SP/261", date: "18 Apr 2026", taxable: 400000, tax: 112000, src: "PR", diff: -112000, bucket: "missing_in_portal" },
  { id: 9, gstin: "06AAACS1234F1Z5", name: "Maruti Suzuki India", inv: "MSI-8812", date: "10 Apr 2026", taxable: 180000, tax: 50400, src: "PR", diff: -2000, bucket: "mismatched" },
  { id: 10, gstin: "27AAACT1234F1Z5", name: "TCS Limited", inv: "TCS/IT/26-1", date: "28 Apr 2026", taxable: 500000, tax: 90000, src: "PR", diff: 0, bucket: "matched" },
  { id: 11, gstin: "24AAACD1234F1Z5", name: "Adani Power Ltd.", inv: "AP/26/552", date: "08 Apr 2026", taxable: 96000, tax: 17280, src: "2B", diff: 0, bucket: "missing_in_books" },
  { id: 12, gstin: "27AAACZ1234F1Z5", name: "Zomato Hyperpure", inv: "ZHP/2627/77", date: "25 Apr 2026", taxable: 64000, tax: 11520, src: "PR", diff: 0, bucket: "probable" },
];
const SUMMARY = [
  { key: "matched", label: "Matched", value: 4520500, count: 142 },
  { key: "mismatched", label: "Mismatched", value: 215400, count: 18 },
  { key: "missing_in_portal", label: "Missing in Portal", value: 850000, count: 24 },
  { key: "missing_in_books", label: "Missing in Books", value: 112000, count: 5 },
  { key: "probable", label: "Probable", value: 45000, count: 3 },
];
const ITC_AT_RISK = 1065400;
const CLIENT_RUNS = [
  { period: "Apr 2026", status: "In progress", invoices: 192, matched: 88, risk: 1065400, created: "Today, 09:45" },
  { period: "Mar 2026", status: "Closed", invoices: 388, matched: 98, risk: 12500, created: "05 Apr, 14:15" },
  { period: "Feb 2026", status: "Closed", invoices: 401, matched: 99, risk: 4200, created: "02 Mar, 09:45" },
  { period: "Jan 2026", status: "Closed", invoices: 377, matched: 100, risk: 0, created: "04 Feb, 10:10" },
];
const PROBABLE = [
  { id: "p1", name: "Acme Corp India Pvt Ltd", gstin: "27AAACP1234A1Z5", date: "15-Apr-2026", taxable: 125000, tax: 22500, conf: 86, prInv: "INV/26-27/042", twoInv: "26-27-42" },
  { id: "p2", name: "Global Tech Solutions", gstin: "29AAGTS5678B1Z2", date: "11-Apr-2026", taxable: 45000, tax: 8100, conf: 82, prInv: "GT-2026-009", twoInv: "GT/2026/009" },
  { id: "p3", name: "Zenith Logistics", gstin: "24ZENLO9012C1Z9", date: "19-Apr-2026", taxable: 12500, tax: 2250, conf: 79, prInv: "ZL/992/26", twoInv: "ZL-992-26" },
  { id: "p4", name: "Apex Manufacturing", gstin: "07APEXM3456D1Z4", date: "03-Apr-2026", taxable: 890000, tax: 160200, conf: 75, prInv: "APX-04-12", twoInv: "APX/04/12" },
  { id: "p5", name: "Nova Services LLP", gstin: "33NOVAS7890E1Z1", date: "27-Apr-2026", taxable: 5000, tax: 900, conf: 71, prInv: "INV-991", twoInv: "991" },
];

/* ============================================================
   PRIMITIVES
   ============================================================ */
function Card({ children, style, className = "", onClick }) {
  return <div className={`rounded-md ${className}`} onClick={onClick} style={{ background: C.surface, border: `1px solid ${C.border}`, ...style }}>{children}</div>;
}
function Btn({ variant = "secondary", icon: Icon, children, onClick, disabled, style }) {
  const baseS = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, border: "1px solid transparent", whiteSpace: "nowrap", ...style };
  const v = {
    primary: { background: C.navy, color: "#fff" },
    secondary: { background: "#fff", color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: "transparent", color: C.navy },
    danger: { background: "#fff", color: C.red, border: `1px solid ${C.red}` },
    success: { background: C.green, color: "#fff" },
  }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ ...baseS, ...v }}>{Icon && <Icon size={15} strokeWidth={2} />} {children}</button>;
}
function Chip({ label, fg, bg, dot = true }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 4, fontSize: 11.5, fontWeight: 600, color: fg, background: bg, whiteSpace: "nowrap" }}>
    {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: fg }} />}{label}</span>;
}
function StatusChip({ bucket }) { const m = BUCKET[bucket]; return <Chip label={m.label} fg={m.fg} bg={m.bg} />; }
function SourceChip({ src }) {
  const blue = src === "2B";
  return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", padding: "1px 7px", borderRadius: 4, color: blue ? C.blue : C.slate, background: blue ? "#EAF2FB" : C.slateBg }}>{src}</span>;
}
function Label({ children }) { return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: C.textMute, textTransform: "uppercase" }}>{children}</div>; }
function runStatusChip(status) {
  const map = { "In progress": { fg: C.blue, bg: "#EAF2FB" }, Review: { fg: C.amber, bg: C.amberBg }, Pending: { fg: C.amber, bg: C.amberBg }, "Not started": { fg: C.slate, bg: C.slateBg }, Closed: { fg: C.slate, bg: C.slateBg }, Completed: { fg: C.green, bg: C.greenBg } }[status] || { fg: C.slate, bg: C.slateBg };
  return <Chip label={status} fg={map.fg} bg={map.bg} dot={false} />;
}
function PageHead({ title, subtitle, right }) {
  return <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16 }}>
    <div><h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h1>{subtitle && <div style={{ fontSize: 13, color: C.textMute, marginTop: 4 }}>{subtitle}</div>}</div>
    {right && <div style={{ display: "flex", gap: 10 }}>{right}</div>}</div>;
}

/* ============================================================
   SHELL
   ============================================================ */
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "clients", label: "Clients", icon: Briefcase },
  { key: "reconciliation", label: "Reconciliation", icon: ArrowLeftRight },
  { key: "new", label: "New run", icon: UploadCloud },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

function Sidebar({ page, setPage, user, onLogout }) {
  const name = user?.name || "—";
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "U";
  return (
    <aside style={{ width: 240, background: C.navy, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
        <div style={{ width: 34, height: 34, borderRadius: 7, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}><Landmark size={18} /></div>
        <div><div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.1 }}>GST Reconciliation</div><div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>Practice Edition</div></div>
      </div>
      <nav style={{ padding: 10, flex: 1 }}>
        {NAV.map((n) => {
          const active = page === n.key || (page === "review" && n.key === "reconciliation");
          return <button key={n.key} onClick={() => setPage(n.key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 2, borderRadius: 7, fontSize: 13.5, fontWeight: active ? 600 : 500, cursor: "pointer", textAlign: "left", color: active ? "#fff" : "rgba(255,255,255,.78)", background: active ? C.blue : "transparent", border: "none" }}>
            <n.icon size={19} strokeWidth={2} /> {n.label}</button>;
        })}
      </nav>
      <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email || ""}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ width: "100%", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "rgba(255,255,255,.85)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  );
}

function ClientSwitcher({ clients, activeId, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const active = clients.find((c) => c.id === activeId);
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.gstin.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", minWidth: 230 }}>
        <Briefcase size={16} color={C.navy} />
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.1 }}>{active ? active.name : "All clients"}</div>
          <div style={{ ...TNUM, fontSize: 10.5, color: C.textMute }}>{active ? active.gstin : "Practice view"}</div>
        </div>
        <ChevronDown size={15} color={C.textMute} />
      </button>
      {open && <>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div style={{ position: "absolute", top: 42, left: 0, width: 300, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 28px rgba(20,40,70,.14)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: `1px solid ${C.borderLite}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px" }}>
              <Search size={14} color={C.textFaint} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" style={{ border: "none", outline: "none", fontSize: 13, width: "100%" }} />
            </div>
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", padding: 6 }}>
            <button onClick={() => { onPick(null); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left", background: activeId === null ? "#EAF2FB" : "transparent" }}>
              <LayoutDashboard size={16} color={C.navy} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>All clients · Practice view</span>
            </button>
            <div style={{ height: 1, background: C.borderLite, margin: "6px 4px" }} />
            {filtered.map((c) => {
              const sc = { "In progress": C.blue, Review: C.amber, Pending: C.amber, "Not started": C.slate, Closed: C.green }[c.status] || C.slate;
              return <button key={c.id} onClick={() => { onPick(c.id); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left", background: activeId === c.id ? "#EAF2FB" : "transparent" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: sc, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.name}</div>
                  <div style={{ ...TNUM, fontSize: 11, color: C.textMute }}>{c.gstin}</div>
                </span>
              </button>;
            })}
            {filtered.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: C.textMute, textAlign: "center" }}>No clients found.</div>}
          </div>
        </div>
      </>}
    </div>
  );
}

function Topbar({ clients, activeId, setActiveId, period, setPeriod, apiOk }) {
  const dot = apiOk === true ? C.green : apiOk === false ? C.textFaint : C.amber;
  const lbl = apiOk === true ? "API connected" : apiOk === false ? "API offline" : "Checking…";
  return (
    <header style={{ height: 56, background: "#fff", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Building2 size={17} color={C.navy} />
        <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{WORKSPACE.name}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: C.green2, background: "#E5F3EB", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>CA Firm</span>
      </div>
      <div style={{ width: 1, height: 24, background: C.border }} />
      <ClientSwitcher clients={clients} activeId={activeId} onPick={setActiveId} />
      <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...TNUM, fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", background: "#fff", cursor: "pointer" }}>
        <option>FY 2026–27 · Apr 2026</option><option>FY 2026–27 · May 2026</option><option>FY 2025–26 · Mar 2026</option>
      </select>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16, color: C.textMute }}>
        <span title={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: C.textMute }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: dot }} />{lbl}
        </span>
        <Bell size={18} /><HelpCircle size={18} />
        <div style={{ width: 30, height: 30, borderRadius: 999, background: C.navy, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>AJ</div>
      </div>
    </header>
  );
}

/* gate for client-scoped pages */
function ClientGate({ client, clients, onPick, children }) {
  if (client) return children;
  return (
    <Card style={{ padding: 28, maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Briefcase size={20} color={C.navy} />
        <div style={{ fontSize: 17, fontWeight: 700 }}>Select a client to continue</div>
      </div>
      <div style={{ fontSize: 13, color: C.textMute, marginBottom: 16 }}>This view is scoped to one client. Pick a client from your practice to open its reconciliation.</div>
      <div style={{ display: "grid", gap: 6 }}>
        {clients.slice(0, 5).map((c) => (
          <button key={c.id} onClick={() => onPick(c.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", textAlign: "left" }}>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
              <div style={{ ...TNUM, fontSize: 11.5, color: C.textMute }}>{c.gstin} · {c.state}</div>
            </span>
            {runStatusChip(c.status)}
            <ChevronRight size={16} color={C.textFaint} />
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ============================================================
   PAGE — Practice dashboard (no client selected)
   ============================================================ */
function PracticeDashboard({ clients, go, openClient, loading, err }) {
  if (loading) return <div style={{ padding: 60, textAlign: "center", color: C.textMute }}><Loader2 size={24} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Loading your practice…</div></div>;
  if (err) return <Card style={{ padding: 28, maxWidth: 460 }}><div style={{ color: C.red, fontWeight: 600 }}>Couldn't load data</div><div style={{ color: C.textMute, fontSize: 13, marginTop: 4 }}>{err}</div></Card>;
  if (clients.length === 0) return (
    <Card style={{ padding: 40, maxWidth: 480, textAlign: "center" }}>
      <Briefcase size={28} color={C.textFaint} />
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Welcome — add your first company</div>
      <div style={{ fontSize: 13, color: C.textMute, marginTop: 4 }}>Once you add a client company, its reconciliation overview shows here.</div>
      <Btn variant="primary" icon={Plus} style={{ marginTop: 16 }} onClick={() => go("clients")}>Go to Companies</Btn>
    </Card>
  );
  const totalRisk = clients.reduce((a, c) => a + c.risk, 0);
  const due = clients.filter((c) => ["In progress", "Pending", "Review", "Not started"].includes(c.status)).length;
  const flagged = clients.filter((c) => c.risk > 0).length;
  const riskByClient = clients.filter((c) => c.risk > 0).sort((a, b) => b.risk - a.risk).map((c) => ({ name: c.name.split(" ")[0], risk: c.risk }));
  const attention = clients.filter((c) => c.risk > 0 || ["Review", "Pending"].includes(c.status)).sort((a, b) => b.risk - a.risk).slice(0, 4);

  const stat = (label, value, color, Icon) => (
    <Card key={label} style={{ padding: 16, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><Label>{label}</Label><Icon size={16} color={C.textFaint} /></div>
      <div style={{ ...TNUM, fontSize: 26, fontWeight: 700, marginTop: 10, color: color || C.navy }}>{value}</div>
    </Card>
  );

  return (
    <div>
      <PageHead title="Practice overview" subtitle={`${WORKSPACE.name} · ${clients.length} clients · FY 2026–27`}
        right={<Btn variant="primary" icon={Plus} onClick={() => go("new")}>New reconciliation</Btn>} />
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        {stat("Active clients", String(clients.length), C.navy, Briefcase)}
        {stat("Runs due this period", String(due), C.navy, CalendarClock)}
        <Card style={{ padding: 16, flex: 1, borderLeft: `3px solid ${C.red}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><Label>ITC at risk (portfolio)</Label><AlertTriangle size={16} color={C.red} /></div>
          <div style={{ ...TNUM, fontSize: 26, fontWeight: 700, marginTop: 10, color: C.red }}>{inrShort(totalRisk)}</div>
        </Card>
        {stat("Clients flagged", String(flagged), C.navy, ShieldCheck)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Clients — Apr 2026</div>
            <button onClick={() => go("clients")} style={{ fontSize: 12.5, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}>View all clients</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: C.inlay, color: C.textMute }}>
              {["Client", "Status", "Matched %", "ITC at risk (\u20B9)", "Deadline", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 2 && i <= 3 ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 14px" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} onClick={() => openClient(c.id)} style={{ cursor: "pointer", borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                  <td style={{ padding: "9px 14px" }}><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ ...TNUM, fontSize: 11, color: C.textMute }}>{c.gstin}</div></td>
                  <td style={{ padding: "9px 14px" }}>{runStatusChip(c.status)}</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right" }}>{c.invoices ? c.matched + "%" : "–"}</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right", color: c.risk ? C.red : C.textMute, fontWeight: c.risk ? 600 : 400 }}>{c.risk ? inrPlain(c.risk) : "–"}</td>
                  <td style={{ padding: "9px 14px", color: C.textMute }}>{c.deadline}</td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}><ChevronRight size={16} color={C.textFaint} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textMute, marginBottom: 10, letterSpacing: ".03em" }}>ITC AT RISK BY CLIENT</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={riskByClient} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={C.borderLite} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.textMute }} axisLine={{ stroke: C.border }} tickLine={false} />
                <YAxis tickFormatter={(v) => (v >= 1e5 ? (v / 1e5).toFixed(0) + "L" : v)} tick={{ fontSize: 11, fill: C.textMute }} axisLine={false} tickLine={false} width={34} />
                <Tooltip formatter={(v) => inr(v)} cursor={{ fill: C.inlay }} contentStyle={{ fontSize: 12, borderRadius: 6, border: `1px solid ${C.border}` }} />
                <Bar dataKey="risk" radius={[3, 3, 0, 0]} maxBarSize={46}>{riskByClient.map((e, i) => <Cell key={i} fill={i === 0 ? C.red : C.blue} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 15, fontWeight: 700 }}>Needs attention</div>
          {attention.map((c, i) => (
            <button key={c.id} onClick={() => openClient(c.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderTop: i ? `1px solid ${C.borderLite}` : "none", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c.risk ? C.red : C.amber, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: C.textMute }}>{c.risk ? inr(c.risk) + " at risk" : c.status} · {c.assignee}</div>
              </span>
              <ChevronRight size={15} color={C.textFaint} />
            </button>
          ))}
          <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMute, letterSpacing: ".03em", marginBottom: 8 }}>UPCOMING DEADLINE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <CalendarClock size={16} color={C.amber} />
              <div style={{ fontSize: 12.5 }}><b>GSTR-3B</b> · 20 May 2026 · {due} clients pending</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE — Client dashboard (a client selected)
   ============================================================ */
function ClientDashboard({ client, go }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    recentRuns(5).then(d => {
      setRuns(d?.runs || []);
    }).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [client.id]);

  const stat = (label, value, color, Icon) => (
    <Card key={label} style={{ padding: 16, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><Label>{label}</Label><Icon size={16} color={C.textFaint} /></div>
      <div style={{ ...TNUM, fontSize: 26, fontWeight: 700, marginTop: 10, color: color || C.navy }}>{value}</div>
    </Card>
  );
  return (
    <div>
      <PageHead title={client.name} subtitle={`${client.gstin} · ${client.state} · FY 2026–27`}
        right={<Btn variant="primary" icon={Plus} onClick={() => go("new")}>New reconciliation</Btn>} />
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        {stat("Open runs", runs.length > 0 ? "1" : "0", C.navy, LayoutDashboard)}
        {stat("ITC recovered (FY)", inrShort(2310000), C.navy, ShieldCheck)}
        <Card style={{ padding: 16, flex: 1, borderLeft: `3px solid ${C.red}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><Label>ITC at risk</Label><AlertTriangle size={16} color={C.red} /></div>
          <div style={{ ...TNUM, fontSize: 26, fontWeight: 700, marginTop: 10, color: C.red }}>{inrShort(client.risk || 0)}</div>
        </Card>
        {stat("Vendors flagged", "7", C.navy, Users)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Recent runs</div>
            <button onClick={() => go("reconciliation")} style={{ fontSize: 12.5, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}>Open latest</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: C.inlay, color: C.textMute }}>
              {["Tax period", "Status", "Invoices", "Matched %", "Created", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 2 && i <= 3 ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 14px" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.textMute }}>Loading runs...</td></tr>
              ) : err ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.red }}>Error: {err}</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.textMute }}>No runs yet. Click "New reconciliation" to start.</td></tr>
              ) : runs.map((r, i) => (
                <tr key={r.id} onClick={() => go("reconciliation")} style={{ cursor: "pointer", borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 600 }}>{r.tax_period || "Apr 2026"}</td>
                  <td style={{ padding: "9px 14px" }}>{runStatusChip(r.status || "Completed")}</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right" }}>{r.total_records_committed || "–"}</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right" }}>–</td>
                  <td style={{ padding: "9px 14px", color: C.textMute }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}><ChevronRight size={16} color={C.textFaint} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 15, fontWeight: 700 }}>Action needed</div>
          {[{ dot: C.amber, t: "32 probable matches to review", s: "Apr 2026", go: "review" }, { dot: C.red, t: inr(850000) + " missing in portal", s: "Apr 2026", go: "reconciliation" }, { dot: C.slate, t: "5 invoices missing in books", s: "Apr 2026", go: "reconciliation" }].map((a, i) => (
            <button key={i} onClick={() => go(a.go)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderTop: i ? `1px solid ${C.borderLite}` : "none", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, flexShrink: 0 }} />
              <span style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{a.t}</div><div style={{ fontSize: 11.5, color: C.textMute }}>{a.s}</div></span>
              <ChevronRight size={15} color={C.textFaint} />
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE — Clients portfolio
   ============================================================ */
function ClientsPage({ clients, openClient, loading, err, onChanged }) {
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ legal_name: "", gstin: "", state_code: "" });
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const rows = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.gstin.toLowerCase().includes(q.toLowerCase()));
  const th = (t, right) => <th style={{ textAlign: right ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: C.textMute, padding: "10px 14px", whiteSpace: "nowrap" }}>{t}</th>;

  const submitAdd = async () => {
    setAddErr(""); setBusy(true);
    try {
      await createClient({ legal_name: form.legal_name, gstin: form.gstin, state_code: form.state_code });
      setShowAdd(false); setForm({ legal_name: "", gstin: "", state_code: "" });
      onChanged && onChanged();
    } catch (e) { setAddErr(e.message); } finally { setBusy(false); }
  };
  const removeClient = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Remove ${c.name}? This deletes its runs and data.`)) return;
    setRemovingId(c.id);
    try { await deleteClient(c.id); onChanged && onChanged(); }
    catch (err2) { window.alert(err2.message); }
    finally { setRemovingId(null); }
  };

  return (
    <div>
      <PageHead title="Companies" subtitle={`${clients.length} ${clients.length === 1 ? "company" : "companies"} in ${WORKSPACE.name}`}
        right={<Btn variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>Add company</Btn>} />
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", width: 280 }}>
            <Search size={15} color={C.textFaint} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or GSTIN…" style={{ border: "none", outline: "none", fontSize: 13, width: "100%" }} />
          </div>
          <Btn icon={Filter} style={{ height: 32 }}>Filter</Btn>
        </div>

        {loading ? (
          <div style={{ padding: 50, textAlign: "center", color: C.textMute }}><Loader2 size={22} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Loading companies…</div></div>
        ) : err ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>Couldn't load companies</div>
            <div style={{ color: C.textMute, fontSize: 12.5, marginTop: 4 }}>{err}</div>
            <Btn style={{ marginTop: 14 }} onClick={onChanged}>Retry</Btn>
          </div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Briefcase size={26} color={C.textFaint} />
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>No companies yet</div>
            <div style={{ fontSize: 13, color: C.textMute, marginTop: 4 }}>Add your first client company to start reconciling.</div>
            <Btn variant="primary" icon={Plus} style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add company</Btn>
          </div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: C.inlay }}>{th("Company")}{th("GSTIN")}{th("State")}{th("Period status")}{th("Invoices", true)}{th("Matched %", true)}{th("ITC at risk (\u20B9)", true)}{th("Deadline")}{th("")}</tr></thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id} onClick={() => openClient(c.id)} style={{ cursor: "pointer", borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                    <td style={{ padding: "11px 14px", fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...TNUM, padding: "11px 14px" }}>{c.gstin}</td>
                    <td style={{ padding: "11px 14px", color: C.textMute }}>{c.state}</td>
                    <td style={{ padding: "11px 14px" }}>{runStatusChip(c.status)}</td>
                    <td style={{ ...TNUM, padding: "11px 14px", textAlign: "right" }}>{c.invoices || "–"}</td>
                    <td style={{ ...TNUM, padding: "11px 14px", textAlign: "right" }}>{c.invoices ? c.matched + "%" : "–"}</td>
                    <td style={{ ...TNUM, padding: "11px 14px", textAlign: "right", color: c.risk ? C.red : C.textMute, fontWeight: c.risk ? 600 : 400 }}>{c.risk ? inrPlain(c.risk) : "–"}</td>
                    <td style={{ padding: "11px 14px", color: C.textMute, whiteSpace: "nowrap" }}>{c.deadline}</td>
                    <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button title="Remove" onClick={(e) => removeClient(e, c)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textFaint, verticalAlign: "middle" }}>
                        {removingId === c.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: C.textMute }}>No companies match your search.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,40,70,.35)", display: "grid", placeItems: "center", zIndex: 60 }} onClick={() => !busy && setShowAdd(false)}>
          <Card style={{ width: 420, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Add company</div>
            <div style={{ fontSize: 12.5, color: C.textMute, marginBottom: 16 }}>Create a new client company in {WORKSPACE.name}.</div>
            {addErr && <div style={{ background: C.redBg, color: C.red, border: "1px solid #F1C9C4", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>{addErr}</div>}
            {[["Legal name", "legal_name", "Acme Corp Pvt Ltd"], ["GSTIN", "gstin", "27AAAAA0000A1Z5"], ["State code", "state_code", "27"]].map(([label, key, ph]) => (
              <label key={key} style={{ display: "block", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMute }}>{label}</span>
                <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                  style={{ ...TNUM, width: "100%", height: 38, marginTop: 5, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 12px", fontSize: 13.5, outline: "none", boxSizing: "border-box" }} />
              </label>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Btn onClick={() => setShowAdd(false)} disabled={busy}>Cancel</Btn>
              <Btn variant="primary" icon={busy ? Loader2 : Plus} disabled={busy || !form.legal_name || !form.gstin || !form.state_code} onClick={submitAdd}>{busy ? "Adding…" : "Add company"}</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PAGE — Reconciliation results (client-scoped)
   ============================================================ */
function Reconciliation({ client, go, live }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [fetchedLive, setFetchedLive] = useState(null);
  const [loading, setLoading] = useState(!live);

  useEffect(() => {
    if (live) { setLoading(false); return; }
    setLoading(true);
    recentRuns(1).then(async (d) => {
      if (d?.runs?.length > 0) {
        const run = d.runs[0];
        const res = await getRunResults(run.id);
        const rows = Array.isArray(res.database_rows) ? res.database_rows : [];
        setFetchedLive({ runId: run.id, rows, counts: summarize(rows), total: run.total_records_committed || rows.length });
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [live, client.id]);

  const effectiveLive = live || fetchedLive;

  const cards = SUMMARY.map((s) => ({ ...s, count: effectiveLive ? effectiveLive.counts[s.key] : 0, value: null }));
  const tabs = [{ key: "all", label: "All", n: effectiveLive ? effectiveLive.total : 0 }, ...cards.map((s) => ({ key: s.key, label: BUCKET[s.key].label, n: s.count, dot: s.key === "probable" ? C.amber : null }))];
  
  // Real persisted MatchResult rows (live). Only match metadata is stored by the
  // backend today — supplier/amount columns need M4 to persist invoice rows.
  const bucketKey = (b) => {
    const s = String(b || "").toLowerCase().replace(/\s+/g, "_");
    if (s.includes("missing") && s.includes("portal")) return "missing_in_portal";
    if (s.includes("missing") && s.includes("book")) return "missing_in_books";
    if (s.includes("mismatch")) return "mismatched";
    if (s.includes("probable")) return "probable";
    if (s.includes("match")) return "matched";
    return "probable";
  };
  const liveRows = useMemo(() => {
    const mapped = (effectiveLive?.rows || []).map((r, i) => ({
      id: i,
      bucket: bucketKey(r.bucket),
      pass: r.match_pass ?? r.matchPass ?? "—",
      conf: Number(r.confidence ?? 0),
      diff: Number(r.tax_diff ?? r.taxDiff ?? 0),
      prId: r.purchase_invoice_id ?? r.purchaseInvoiceId ?? null,
      twoId: r.portal_invoice_id ?? r.portalInvoiceId ?? null,
    }));
    let r = tab === "all" ? mapped : mapped.filter((x) => x.bucket === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((x) => String(x.prId).toLowerCase().includes(s) || String(x.twoId).toLowerCase().includes(s) || x.bucket.includes(s) || x.pass.toLowerCase().includes(s));
    }
    return r;
  }, [tab, q, effectiveLive]);
  const th = (txt, right) => <th style={{ textAlign: right ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: C.textMute, padding: "10px 14px", position: "sticky", top: 0, background: C.inlay, whiteSpace: "nowrap" }}>{txt}</th>;
  return (
    <div>
      <PageHead title={`${client.name} — Apr 2026`} subtitle={`${client.gstin} · last synced Today, 09:45`}
        right={<><Btn icon={Download} onClick={() => effectiveLive ? downloadReport(effectiveLive.runId, "reconciliation", "xlsx").catch((e) => alert(e.message)) : go("reports")}>Export report</Btn><Btn variant="primary" icon={Play} onClick={() => go("new")}>Run again</Btn></>} />
      
      {loading ? (
        <div style={{ padding: 50, textAlign: "center", color: C.textMute }}><Loader2 size={22} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Loading recent run data…</div></div>
      ) : (
        <>
          <div style={{ marginTop: -8, display: "flex", alignItems: "center", gap: 10 }}>
            {runStatusChip(effectiveLive ? "Completed" : "In progress")}
            {effectiveLive && <span style={{ ...TNUM, fontSize: 11.5, fontWeight: 700, color: C.green2, background: "#E5F3EB", padding: "2px 8px", borderRadius: 4 }}>
              ● LIVE · {effectiveLive.total} rows{effectiveLive.runId ? " · run " + String(effectiveLive.runId).slice(0, 8) : ""}
            </span>}
          </div>
          <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
            {cards.map((s) => (
              <Card key={s.key} style={{ padding: "12px 14px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: BUCKET[s.key].fg }} /><span style={{ fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>{s.label}</span></div>
                <div style={{ ...TNUM, fontSize: 19, fontWeight: 700, marginTop: 7 }}>{effectiveLive ? s.count : inr(s.value)}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: C.textFaint, marginTop: 3, textTransform: "uppercase" }}>{effectiveLive ? "invoices" : s.count + " invoices"}</div>
              </Card>
            ))}
            <Card style={{ padding: "12px 14px", flex: 1, background: C.redBg, border: `1px solid #F1C9C4` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} color={C.red} /><span style={{ fontSize: 12.5, color: C.red, fontWeight: 700 }}>ITC at risk</span></div>
              <div style={{ ...TNUM, fontSize: 19, fontWeight: 700, color: C.red, marginTop: 7 }}>{effectiveLive ? (effectiveLive.counts.missing_in_portal + effectiveLive.counts.mismatched) : inr(ITC_AT_RISK)}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: C.red, marginTop: 3, textTransform: "uppercase" }}>{effectiveLive ? "flagged invoices" : "Requires action"}</div>
            </Card>
          </div>
          {effectiveLive && <div style={{ marginBottom: 16, fontSize: 12, color: C.textMute }}>Showing live bucket counts returned by the engine. The detailed table below is illustrative until the per-invoice results endpoint (M7) is wired.</div>}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: active ? C.navy : C.textMute, background: active ? "#EAF2FB" : "transparent" }}>
              {t.dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: t.dot }} />}{t.label}
              <span style={{ ...TNUM, fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: active ? "#fff" : C.slateBg, color: active ? C.navy : C.textMute }}>{t.n}</span></button>;
          })}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", width: 250 }}>
              <Search size={15} color={C.textFaint} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GSTIN, name or invoice…" style={{ border: "none", outline: "none", fontSize: 13, width: "100%" }} />
            </div>
            <Btn icon={Columns3} style={{ height: 32 }}>Columns</Btn><Btn icon={Filter} style={{ height: 32 }}>Filter</Btn>
          </div>
        </div>
        <div style={{ overflow: "auto", maxHeight: 440 }}>
          {effectiveLive ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{th("Status")}{th("Match pass")}{th("Confidence", true)}{th("Tax diff (\u20B9)", true)}{th("PR invoice id")}{th("2B invoice id")}</tr></thead>
              <tbody>
                {liveRows.map((r, i) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                    <td style={{ padding: "10px 14px" }}><StatusChip bucket={r.bucket} /></td>
                    <td style={{ padding: "10px 14px", color: C.textMute }}>{r.pass}</td>
                    <td style={{ ...TNUM, padding: "10px 14px", textAlign: "right" }}>{(r.conf * (r.conf <= 1 ? 100 : 1)).toFixed(0)}%</td>
                    <td style={{ ...TNUM, padding: "10px 14px", textAlign: "right", fontWeight: r.diff ? 600 : 400, color: r.diff > 0 ? C.amber : r.diff < 0 ? C.red : C.textMute }}>{r.diff > 0 ? "+" : ""}{inrPlain(r.diff)}</td>
                    <td style={{ ...TNUM, padding: "10px 14px", color: r.prId ? C.text : C.textFaint }}>{r.prId ? String(r.prId).slice(0, 8) : "—"}</td>
                    <td style={{ ...TNUM, padding: "10px 14px", color: r.twoId ? C.text : C.textFaint }}>{r.twoId ? String(r.twoId).slice(0, 8) : "—"}</td>
                  </tr>
                ))}
                {liveRows.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: C.textMute }}>No rows in this bucket.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{th("Supplier GSTIN")}{th("Supplier name")}{th("Invoice no.")}{th("Invoice date")}{th("Taxable value (\u20B9)", true)}{th("Total tax (\u20B9)", true)}{th("Source")}{th("Tax diff (\u20B9)", true)}{th("Status")}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                    <td style={{ ...TNUM, padding: "10px 14px" }}>{r.gstin}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{r.name}</td>
                    <td style={{ ...TNUM, padding: "10px 14px" }}>{r.inv}</td>
                    <td style={{ padding: "10px 14px", color: C.textMute, whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ ...TNUM, padding: "10px 14px", textAlign: "right" }}>{inrPlain(r.taxable)}</td>
                    <td style={{ ...TNUM, padding: "10px 14px", textAlign: "right" }}>{inrPlain(r.tax)}</td>
                    <td style={{ padding: "10px 14px" }}><SourceChip src={r.src} /></td>
                    <td style={{ ...TNUM, padding: "10px 14px", textAlign: "right", fontWeight: r.diff ? 600 : 400, color: r.diff > 0 ? C.amber : r.diff < 0 ? C.red : C.textMute }}>{r.diff > 0 ? "+" : ""}{inrPlain(r.diff)}</td>
                    <td style={{ padding: "10px 14px" }}><StatusChip bucket={r.bucket} /></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: C.textMute }}>No invoices match this filter.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12.5, color: C.textMute }}>{effectiveLive ? `Showing ${liveRows.length} of ${effectiveLive.total} rows` : `Showing 1–${rows.length} of ${tab === "all" ? 192 : rows.length} rows`}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PagBtn><ChevronLeft size={15} /></PagBtn>{["1", "2", "3", "…", "20"].map((p, i) => <PagBtn key={i} active={p === "1"}>{p}</PagBtn>)}<PagBtn><ChevronRight size={15} /></PagBtn>
          </div>
        </div>
      </Card>
      </>
      )}
    </div>
  );
}
function PagBtn({ children, active }) {
  return <button style={{ ...TNUM, minWidth: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? C.navy : C.border}`, background: active ? C.navy : "#fff", color: active ? "#fff" : C.textMute, padding: "0 6px" }}>{children}</button>;
}

/* ============================================================
   PAGE — New run (client-scoped)
   ============================================================ */
function humanSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function NewRun({ client, go, onReconciled }) {
  const [pr, setPr] = useState(null);   // { file, name, size }
  const [two, setTwo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const prRef = useRef(null);
  const twoRef = useRef(null);
  const ready = pr && two && !busy;

  const onFile = (setter) => (e) => {
    const f = e.target.files?.[0];
    if (f) setter({ file: f, name: f.name, size: humanSize(f.size) });
    e.target.value = ""; // allow re-selecting the same file
  };

  const start = async () => {
    setErr("");
    setBusy(true);
    try {
      const { runId, rows, total } = await reconcile(pr.file, two.file);
      onReconciled({ runId, rows, counts: summarize(rows), total });
    } catch (e) {
      setErr(
        "Could not reach the reconciliation API. Make sure the backend is running on " +
        "http://localhost:8000 and that both files are CSV. (" + e.message + ")"
      );
    } finally {
      setBusy(false);
    }
  };

  const FileRow = ({ f, onRemove }) => (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <FileSpreadsheet size={22} color={C.blue} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
          <div style={{ ...TNUM, fontSize: 11.5, color: C.textMute }}>{f.size}</div>
        </div>
        <CheckCircle2 size={18} color={C.green} />
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: C.textFaint }}><Trash2 size={17} /></button>
      </div>
    </div>
  );

  const Dropzone = ({ kind, onPick }) => (
    <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 8, padding: "28px 16px", textAlign: "center", background: C.inlay }}>
      <div style={{ width: 44, height: 44, borderRadius: 999, background: "#fff", border: `1px solid ${C.border}`, display: "grid", placeItems: "center", margin: "0 auto 10px" }}><UploadCloud size={20} color={C.textMute} /></div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Choose a CSV file</div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.textFaint, margin: "4px 0 12px", textTransform: "uppercase" }}>Supported: CSV</div>
      <Btn onClick={onPick}>Browse files</Btn>
      {kind === "2B" && <><div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px auto", maxWidth: 180, color: C.textFaint, fontSize: 11 }}><span style={{ flex: 1, height: 1, background: C.border }} /> OR <span style={{ flex: 1, height: 1, background: C.border }} /></div>
        <button style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.blue, fontWeight: 600, fontSize: 12.5, background: "none", border: "none", cursor: "pointer" }}><CloudDownload size={15} /> Fetch from GSTN portal</button></>}
    </div>
  );

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHead title="New reconciliation" subtitle="Upload the Purchase Register and GSTR-2B (CSV) to run the engine." />
      {/* hidden native file inputs */}
      <input ref={prRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFile(setPr)} />
      <input ref={twoRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFile(setTwo)} />
      <Card>
        <div style={{ padding: 20, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Reconciliation parameters</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div><Label>Tax period</Label>
              <select style={{ marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13.5, background: "#fff" }}><option>April 2026</option><option>May 2026</option></select>
            </div>
            <div><Label>Client / GSTIN</Label>
              <div style={{ marginTop: 6, height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, background: C.inlay, color: C.text, fontSize: 13.5 }}>
                <Briefcase size={15} color={C.navy} /> {client.name} · {client.gstin}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Source datasets</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13.5, fontWeight: 600 }}>Purchase Register</span><Chip label="Required" fg={C.textMute} bg={C.slateBg} dot={false} /></div>
              {pr ? <FileRow f={pr} onRemove={() => setPr(null)} /> : <Dropzone kind="PR" onPick={() => prRef.current?.click()} />}
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13.5, fontWeight: 600 }}>GSTR-2B</span><Chip label="Required" fg={C.textMute} bg={C.slateBg} dot={false} /></div>
              {two ? <FileRow f={two} onRemove={() => setTwo(null)} /> : <Dropzone kind="2B" onPick={() => twoRef.current?.click()} />}
            </div>
          </div>
          {err && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: C.redBg, border: `1px solid #F1C9C4`, color: C.red, fontSize: 12.5 }}>{err}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", background: C.inlay, borderTop: `1px solid ${C.border}` }}>
          <Btn onClick={() => go("dashboard")} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" icon={busy ? Loader2 : Play} disabled={!ready} onClick={start}>{busy ? "Reconciling…" : "Start reconciliation"}</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
   PAGE — Review (client-scoped)
   ============================================================ */
function Review({ client, go }) {
  const [idx, setIdx] = useState(0);
  const [reviewed, setReviewed] = useState(12);
  const total = 32;
  const queue = PROBABLE;
  const cur = queue[idx];
  const next = () => { setReviewed((r) => Math.min(total, r + 1)); setIdx((i) => (i + 1) % queue.length); };
  const Side = ({ title, tag, tagColor, gstin, name, inv }) => (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: tagColor }} /> {title}</div>
        <Chip label={tag} fg={C.textMute} bg={C.slateBg} dot={false} />
      </div>
      {[["Supplier GSTIN", gstin], ["Name", name], ["Invoice no.", inv, true]].map(([k, v, hl]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
          <span style={{ color: C.textMute }}>{k}</span>
          <span style={{ ...TNUM, fontWeight: 600, textDecoration: hl ? "underline" : "none", textDecorationColor: C.amber, textUnderlineOffset: 3, background: hl ? C.amberBg : "transparent", padding: hl ? "1px 6px" : 0, borderRadius: 4 }}>{v}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${C.borderLite}`, marginTop: 8, paddingTop: 8 }}>
        {[["Date", cur.date], ["Taxable value", inr(cur.taxable)], ["Total tax", inr(cur.tax)]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13 }}><span style={{ color: C.textMute }}>{k}</span><span style={{ ...TNUM, fontWeight: 600 }}>{v}</span></div>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      <PageHead title="Review probable matches" subtitle={`${client.name} · Apr 2026 · ${reviewed} of ${total} reviewed`}
        right={<div style={{ textAlign: "right" }}><div style={{ fontSize: 12.5, fontWeight: 700, color: C.blue }}>Match confidence: {cur.conf}%</div>
          <div style={{ width: 150, height: 5, borderRadius: 999, background: C.borderLite, marginTop: 6 }}><div style={{ width: `${cur.conf}%`, height: "100%", borderRadius: 999, background: C.blue }} /></div></div>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", gap: 40 }}>
            <Side title="Purchase Register" tag="Books" tagColor={C.navy} gstin={cur.gstin} name={cur.name} inv={cur.prInv} />
            <div style={{ width: 1, background: C.border }} />
            <Side title="GSTR-2B" tag="Portal" tagColor={C.amber} gstin={cur.gstin} name={cur.name} inv={cur.twoInv} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 26, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <Btn onClick={next}>Skip</Btn><Btn variant="danger" icon={X} onClick={next}>Reject</Btn><Btn variant="success" icon={Check} onClick={next}>Confirm match</Btn>
          </div>
        </Card>
        <Card>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700 }}>Queue ({total - reviewed} remaining)</div>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {queue.map((p, i) => (
              <button key={p.id} onClick={() => setIdx(i)} style={{ width: "100%", textAlign: "left", padding: "12px 16px", border: "none", borderTop: i ? `1px solid ${C.borderLite}` : "none", cursor: "pointer", background: i === idx ? "#EAF2FB" : "#fff", borderLeft: i === idx ? `3px solid ${C.blue}` : "3px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span><span style={{ ...TNUM, fontSize: 11.5, fontWeight: 700, color: C.blue, background: "#EAF2FB", padding: "1px 6px", borderRadius: 4 }}>{p.conf}%</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span style={{ ...TNUM, fontSize: 12, color: C.textMute }}>{inr(p.taxable)}</span><span style={{ ...TNUM, fontSize: 11, color: C.textFaint }}>{p.prInv}</span></div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE — Reports (client-scoped)
   ============================================================ */
function Reports({ client }) {
  const reports = [
    { type: "reconciliation", t: "Invoice-level reconciliation statement", d: "Every variance between books and portal, ready for ASMT-10." },
    { type: "safe-to-claim", t: "Safe-to-claim summary (GSTR-3B)", d: "Matched + eligible ITC cleared for the 3B draft." },
    { type: "at-risk", t: "ITC at risk", d: "Mismatched, missing-in-portal and probable invoices." },
    { type: "notices", t: "Discrepancy notices (per vendor)", d: "Flagged invoices grouped by supplier." },
    { type: "vendor-scorecard", t: "Vendor compliance scorecard", d: "Filing reliability and defaulted value by vendor." },
    { type: "annual-ledger", t: "Annual reconciliation ledger (GSTR-9/9C)", d: "Monthly runs rolled up for the annual return." },
  ];
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [runId, setRunId] = useState("");
  const [format, setFormat] = useState("xlsx");
  const [busyType, setBusyType] = useState("");
  const [dlErr, setDlErr] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    recentRuns(20)
      .then((d) => {
        const list = (d && d.runs) || [];
        setRuns(list);
        if (list.length) setRunId(list[0].id);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [client.id]);

  const download = async (type) => {
    if (!runId) return;
    setDlErr(""); setBusyType(type);
    try { await downloadReport(runId, type, format); }
    catch (e) { setDlErr(e.message); }
    finally { setBusyType(""); }
  };

  return (
    <div>
      <PageHead title="Reports & exports" subtitle={`${client.name} · ${client.gstin}`} />

      {loading ? (
        <div style={{ padding: 50, textAlign: "center", color: C.textMute }}><Loader2 size={22} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Loading runs…</div></div>
      ) : err ? (
        <Card style={{ padding: 24, maxWidth: 460 }}><div style={{ color: C.red, fontWeight: 600 }}>Couldn't load runs</div><div style={{ color: C.textMute, fontSize: 13, marginTop: 4 }}>{err}</div></Card>
      ) : runs.length === 0 ? (
        <Card style={{ padding: 40, maxWidth: 480, textAlign: "center" }}>
          <FileText size={26} color={C.textFaint} />
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>No runs to export yet</div>
          <div style={{ fontSize: 13, color: C.textMute, marginTop: 4 }}>Run a reconciliation for this company, then export its statements here.</div>
        </Card>
      ) : (
        <>
          {/* run + format selector */}
          <Card style={{ padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.textMute }}>Run</span>
              <select value={runId} onChange={(e) => setRunId(e.target.value)} style={{ ...TNUM, height: 36, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13, background: "#fff" }}>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.tax_period} · {r.status} · {r.created_on}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.textMute }}>Format</span>
              {["xlsx", "csv"].map((f) => (
                <button key={f} onClick={() => setFormat(f)} style={{ height: 32, padding: "0 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textTransform: "uppercase",
                  border: `1px solid ${format === f ? C.navy : C.border}`, background: format === f ? C.navy : "#fff", color: format === f ? "#fff" : C.textMute }}>{f}</button>
              ))}
            </div>
            {dlErr && <span style={{ color: C.red, fontSize: 12.5 }}>{dlErr}</span>}
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {reports.map((r) => (
              <Card key={r.type} style={{ padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "#EAF2FB", display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={20} color={C.blue} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{r.t}</div>
                  <div style={{ fontSize: 12.5, color: C.textMute, margin: "4px 0 12px", lineHeight: 1.45 }}>{r.d}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <Btn icon={busyType === r.type ? Loader2 : Download} style={{ height: 30 }} disabled={!!busyType} onClick={() => download(r.type)}>
                      {busyType === r.type ? "Exporting…" : "Export"}
                    </Btn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   PAGE — Settings (practice + client groups)
   ============================================================ */
function Field({ label, value, readOnly }) {
  return <div><Label>{label}</Label><input defaultValue={value} readOnly={readOnly} style={{ ...TNUM, marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, background: readOnly ? C.inlay : "#fff", color: readOnly ? C.textMute : C.text, boxSizing: "border-box" }} /></div>;
}
function SectionTitle({ children }) { return <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{children}</div>; }
function SaveBar() { return <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}><Btn>Cancel</Btn><Btn variant="primary">Save changes</Btn></div>; }
function Toggle({ on }) { const [v, setV] = useState(on); return <button onClick={() => setV(!v)} style={{ width: 38, height: 22, borderRadius: 999, border: "none", cursor: "pointer", background: v ? C.green : C.border, position: "relative" }}><span style={{ position: "absolute", top: 2, left: v ? 18 : 2, width: 18, height: 18, borderRadius: 999, background: "#fff" }} /></button>; }

function Settings({ client }) {
  const [tab, setTab] = useState("practice");
  const groups = [
    { title: "Practice", items: [{ key: "practice", label: "Practice profile", icon: Building2 }, { key: "team", label: "Team & roles", icon: Users }, { key: "defrules", label: "Default matching", icon: SlidersHorizontal }, { key: "billing", label: "Plan & billing", icon: CreditCard }] },
    { title: "Client", items: [{ key: "client", label: "Client details", icon: Briefcase }, { key: "vendors", label: "Vendors", icon: ArrowLeftRight }, { key: "matching", label: "Matching overrides", icon: SlidersHorizontal }, { key: "notify", label: "Notifications", icon: Bell }] },
  ];
  const clientTabs = ["client", "vendors", "matching", "notify"];
  const needsClient = clientTabs.includes(tab) && !client;
  return (
    <div>
      <PageHead title="Settings" subtitle="Practice-wide settings, plus per-client configuration for the active client." />
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 18 }}>
        <Card style={{ padding: 8, alignSelf: "start" }}>
          {groups.map((g) => (
            <div key={g.title} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", color: C.textFaint, padding: "8px 12px 4px", textTransform: "uppercase" }}>{g.title}{g.title === "Client" && client ? " · " + client.name.split(" ")[0] : ""}</div>
              {g.items.map((t) => {
                const active = tab === t.key;
                return <button key={t.key} onClick={() => setTab(t.key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 6, marginBottom: 2, border: "none", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: active ? 600 : 500, color: active ? C.navy : C.textMute, background: active ? "#EAF2FB" : "transparent" }}>
                  <t.icon size={16} /> {t.label}</button>;
              })}
            </div>
          ))}
        </Card>
        <Card style={{ padding: 22 }}>
          {needsClient ? (
            <div style={{ padding: "30px 10px", textAlign: "center" }}>
              <Briefcase size={26} color={C.textFaint} />
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>Select a client first</div>
              <div style={{ fontSize: 12.5, color: C.textMute, marginTop: 4 }}>Client settings apply to one client. Choose a client from the switcher to edit these.</div>
            </div>
          ) : (
            <>
              {tab === "practice" && <PracticeProfile />}
              {tab === "team" && <TeamRoles />}
              {tab === "defrules" && <MatchingRules scope="practice" />}
              {tab === "billing" && <Billing />}
              {tab === "client" && <ClientDetails client={client} />}
              {tab === "vendors" && <Vendors />}
              {tab === "matching" && <MatchingRules scope="client" client={client} />}
              {tab === "notify" && <Notify />}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function PracticeProfile() {
  return <div><SectionTitle>Practice profile</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Field label="Firm name" value="Sharma & Associates" />
      <Field label="Account type" value="CA Firm" readOnly />
      <Field label="Primary contact" value="Amit Jain" />
      <Field label="Contact email" value="amit@caassociates.in" />
      <Field label="Firm PAN" value="AAAFS1234K" />
      <Field label="Membership no. (ICAI)" value="123456" />
    </div><SaveBar /></div>;
}
function TeamRoles() {
  const users = [{ n: "Amit Jain", e: "amit@caassociates.in", r: "Admin", c: "All clients" }, { n: "Priya Nair", e: "priya@caassociates.in", r: "Reviewer", c: "4 clients" }, { n: "Rahul Mehta", e: "rahul@caassociates.in", r: "Analyst", c: "2 clients" }];
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><SectionTitle>Team & roles</SectionTitle><Btn variant="primary" icon={Plus} style={{ height: 32 }}>Invite member</Btn></div>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead><tr style={{ background: C.inlay, color: C.textMute }}>{["Name", "Email", "Role", "Client access", ""].map((h, i) => <th key={i} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "9px 12px" }}>{h}</th>)}</tr></thead>
      <tbody>{users.map((u, i) => (
        <tr key={u.e} style={{ borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.n}</td><td style={{ padding: "10px 12px", color: C.textMute }}>{u.e}</td>
          <td style={{ padding: "10px 12px" }}><Chip label={u.r} fg={C.navy} bg="#EAF2FB" dot={false} /></td>
          <td style={{ padding: "10px 12px", color: C.textMute }}>{u.c}</td>
          <td style={{ padding: "10px 12px", textAlign: "right" }}><button style={{ color: C.blue, background: "none", border: "none", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>Edit</button></td>
        </tr>))}</tbody>
    </table>
    <div style={{ marginTop: 14, fontSize: 12.5, color: C.textMute }}>Client access is governed by <b>client_membership</b> — assign each member only the clients they should see.</div>
  </div>;
}
function Billing() {
  return <div><SectionTitle>Plan & billing</SectionTitle>
    <Card style={{ padding: 16, marginBottom: 16, background: C.inlay }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 14, fontWeight: 700 }}>Practice plan</div><div style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}>Up to 25 clients · 3 team members</div></div>
        <Btn variant="primary">Manage plan</Btn>
      </div>
    </Card>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Field label="Clients used" value="6 of 25" readOnly /><Field label="Billing email" value="accounts@caassociates.in" />
    </div></div>;
}
function ClientDetails({ client }) {
  return <div><SectionTitle>Client details — {client.name}</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Field label="Legal name" value={client.name} /><Field label="GSTIN" value={client.gstin} readOnly />
      <Field label="State" value={client.state} /><Field label="Filing frequency" value="Monthly" />
      <Field label="Contact email" value="finance@client.in" /><Field label="Assigned to" value={client.assignee} />
    </div><SaveBar /></div>;
}
function Vendors() {
  const v = [{ n: "Reliance Industries Ltd.", g: "27AAACR1234F1Z5", s: "Reliable", c: C.green, bg: C.greenBg }, { n: "Infosys Limited", g: "29AAACI1234F1Z5", s: "Frequent defaults", c: C.amber, bg: C.amberBg }, { n: "TechServe Pvt Ltd", g: "27TECHS1234F1Z5", s: "Inactive", c: C.slate, bg: C.slateBg }];
  return <div><SectionTitle>Vendor master</SectionTitle>
    <div style={{ fontSize: 13, color: C.textMute, marginBottom: 14 }}>Vendors are per client, derived from invoice GSTINs. Add contact details so discrepancy notices can be dispatched automatically.</div>
    {v.map((x, i) => (
      <div key={x.g} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C.borderLite}` : "none" }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{x.n}</div><div style={{ ...TNUM, fontSize: 12, color: C.textMute }}>{x.g}</div></div>
        <Chip label={x.s} fg={x.c} bg={x.bg} dot={false} /><button style={{ color: C.blue, background: "none", border: "none", fontWeight: 600, cursor: "pointer", fontSize: 12.5 }}>Manage</button>
      </div>))}
  </div>;
}
function MatchingRules({ scope, client }) {
  const row = (title, desc, control) => (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: `1px solid ${C.borderLite}` }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}>{desc}</div></div>{control}
    </div>);
  const num = (val, suffix) => <div style={{ display: "flex", alignItems: "center", gap: 6 }}><input defaultValue={val} style={{ ...TNUM, width: 70, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13, textAlign: "right" }} /><span style={{ fontSize: 12.5, color: C.textMute }}>{suffix}</span></div>;
  return <div>
    <SectionTitle>{scope === "practice" ? "Default matching rules" : `Matching overrides — ${client.name}`}</SectionTitle>
    <div style={{ fontSize: 13, color: C.textMute, marginBottom: 4 }}>
      {scope === "practice"
        ? "Firm-wide defaults applied to every new client. Individual clients can override these."
        : "Overrides for this client only. Leave as default to inherit the firm-wide rules."}
    </div>
    {row("Tax tolerance", "Treat as matched if tax differs by at most this amount.", num("1.00", "\u20B9"))}
    {row("Date window", "Allow invoice dates to differ by up to this many days.", num("0", "days"))}
    {row("Fuzzy confidence threshold", "Minimum score for an invoice to surface as a probable match.", num("70", "%"))}
    {row("Pass 2 — normalized invoice no.", "Strip delimiters & leading zeros before comparing.", <Toggle on />)}
    {row("Pass 4 — fuzzy text", "Proximity matching on supplier name + invoice no.", <Toggle on />)}
    <SaveBar />
  </div>;
}
function Notify() {
  const row = (title, desc, on) => (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: `1px solid ${C.borderLite}` }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}>{desc}</div></div><Toggle on={on} />
    </div>);
  return <div><SectionTitle>Notifications</SectionTitle>
    {row("Reconciliation complete", "Email me when a run finishes processing.", true)}
    {row("ITC at risk threshold", "Alert when at-risk credit for a period exceeds \u20B91,00,000.", true)}
    {row("Section 16(4) deadline", "Remind me 30 days before unclaimed ITC lapses.", true)}
    {row("Vendor discrepancy notices", "Notify me when notices are dispatched to vendors.", false)}
    <div style={{ marginTop: 18, padding: 14, borderRadius: 8, background: C.inlay, border: `1px solid ${C.border}`, fontSize: 12.5, color: C.textMute }}>WhatsApp & SMS channels are part of a later release. The MVP sends email and generates PDF notices.</div>
  </div>;
}

/* ============================================================
   ROOT
   ============================================================ */
export default function App() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState("dashboard");
  const [activeClientId, setActiveClientId] = useState(null); // null = practice view
  const [period, setPeriod] = useState("FY 2026–27 · Apr 2026");
  const [apiOk, setApiOk] = useState(null);
  const [live, setLive] = useState(null);

  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsErr, setClientsErr] = useState("");

  const client = clients.find((c) => c.id === activeClientId) || null;
  const go = (p) => setPage(p);

  // selecting a company sets the X-Client-Id header used by company-scoped calls
  const chooseClient = (id) => { setActiveClientId(id); apiSetActiveClient(id); };
  const openClient = (id) => { chooseClient(id); setPage("dashboard"); };

  const loadClients = () => {
    setClientsLoading(true); setClientsErr("");
    listClients()
      .then((rows) => setClients(Array.isArray(rows) ? rows : []))
      .catch((e) => setClientsErr(e.message))
      .finally(() => setClientsLoading(false));
  };

  useEffect(() => {
    let alive = true;
    health().then(() => alive && setApiOk(true)).catch(() => alive && setApiOk(false));
    loadClients();
    return () => { alive = false; };
  }, []);

  const onReconciled = (result) => { setLive(result); setPage("reconciliation"); };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: FONT, color: C.text, background: C.bg, overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} user={user} onLogout={logout} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar clients={clients} activeId={activeClientId} setActiveId={chooseClient} period={period} setPeriod={setPeriod} apiOk={apiOk} />
        <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {page === "dashboard" && (client ? <ClientDashboard client={client} go={go} /> : <PracticeDashboard clients={clients} go={go} openClient={openClient} loading={clientsLoading} err={clientsErr} />)}
          {page === "clients" && <ClientsPage clients={clients} openClient={openClient} loading={clientsLoading} err={clientsErr} onChanged={loadClients} />}
          {page === "reconciliation" && <ClientGate client={client} clients={clients} onPick={chooseClient}><Reconciliation client={client} go={go} live={live} /></ClientGate>}
          {page === "new" && <ClientGate client={client} clients={clients} onPick={chooseClient}><NewRun client={client} go={go} onReconciled={onReconciled} /></ClientGate>}
          {page === "review" && <ClientGate client={client} clients={clients} onPick={chooseClient}><Review client={client} go={go} /></ClientGate>}
          {page === "reports" && <ClientGate client={client} clients={clients} onPick={chooseClient}><Reports client={client} /></ClientGate>}
          {page === "settings" && <Settings client={client} />}
        </main>
      </div>
    </div>
  );
}
