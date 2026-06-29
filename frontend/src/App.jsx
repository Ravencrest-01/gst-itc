import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  LayoutDashboard, ArrowLeftRight, UploadCloud, FileText, Settings as SettingsIcon,
  Bell, HelpCircle, Search, Download, Play, AlertTriangle, Check, X, Briefcase,
  ChevronRight, ChevronLeft, ChevronDown, Building2, Users, SlidersHorizontal,
  FileSpreadsheet, Trash2, CheckCircle2, Plus, Filter, Columns3, Landmark,
  CloudDownload, ShieldCheck, CalendarClock, CreditCard, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { health, requestOtp, register, login, getCurrentUser, getWorkspace, getClients, addClient, deleteClient, getClientRuns, getRunSummary, getRunInvoices, getRunResults, getRunProbable, submitReviewMatch, reconcile, updateWorkspace, inviteUser, getWorkspaceSettings, updateWorkspaceSettings, getClientSettings, updateClientSettings, getClientVendors, getDashboardKpis, updateClient, downloadReport, getWorkspaceUsers } from "./api/client";

export const AppContext = React.createContext({});

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

// API: GET /clients
const CLIENTS = [
  { id: "c1", name: "Acme Corp Pvt Ltd", gstin: "27AAAAA0000A1Z5", state: "Maharashtra", status: "In progress", invoices: 192, matched: 88, risk: 1065400, deadline: "20 May 2026", assignee: "Amit Jain" },
  { id: "c2", name: "Beta Textiles Ltd", gstin: "24BBBBB1111B1Z3", state: "Gujarat", status: "Review", invoices: 452, matched: 88, risk: 210400, deadline: "20 May 2026", assignee: "Priya Nair" },
  { id: "c3", name: "Gamma Logistics LLP", gstin: "29GGGGG2222C1Z1", state: "Karnataka", status: "Closed", invoices: 389, matched: 98, risk: 12500, deadline: "\u2014", assignee: "Rahul Mehta" },
  { id: "c4", name: "Delta Foods Pvt Ltd", gstin: "07DDDDD3333D1Z9", state: "Delhi", status: "Pending", invoices: 310, matched: 85, risk: 117900, deadline: "20 May 2026", assignee: "Priya Nair" },
  { id: "c5", name: "Epsilon Pharma Ltd", gstin: "33EEEEE4444E1Z7", state: "Tamil Nadu", status: "Not started", invoices: 0, matched: 0, risk: 0, deadline: "20 May 2026", assignee: "Amit Jain" },
  { id: "c6", name: "Zeta Motors Pvt Ltd", gstin: "06ZZZZZ5555Z1Z2", state: "Haryana", status: "Closed", invoices: 485, matched: 96, risk: 0, deadline: "\u2014", assignee: "Rahul Mehta" },
];

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
function Card({ children, style, className = "" }) {
  return <div className={`rounded-md ${className}`} style={{ background: C.surface, border: `1px solid ${C.border}`, ...style }}>{children}</div>;
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

function workspaceTypeLabel(type) {
  if (type === "ca_firm") return "CA Firm";
  if (type === "solo_ca") return "Solo CA";
  if (type === "in_house") return "In-house";
  return "CA";
}

function Sidebar({ page, setPage }) {
  const { workspace, currentUser } = React.useContext(AppContext);
  const WORKSPACE = workspace || { name: "Loading...", type: "ca_firm" };
  const name = currentUser?.name || "";
  const initials = name.split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "CA";
  return (
    <aside style={{ width: 240, background: C.navy, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
        <div style={{ width: 34, height: 34, borderRadius: 7, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}><Landmark size={18} /></div>
        <div><div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.1 }}>GST Reconciliation</div><div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{workspaceTypeLabel(WORKSPACE.type)}</div></div>
      </div>
      <nav style={{ padding: 10, flex: 1 }}>
        {NAV.map((n) => {
          const active = page === n.key || (page === "review" && n.key === "reconciliation");
          return <button key={n.key} onClick={() => setPage(n.key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 2, borderRadius: 7, fontSize: 13.5, fontWeight: active ? 600 : 500, cursor: "pointer", textAlign: "left", color: active ? "#fff" : "rgba(255,255,255,.78)", background: active ? C.blue : "transparent", border: "none" }}>
            <n.icon size={19} strokeWidth={2} /> {n.label}</button>;
        })}
      </nav>
      <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{name || "User"}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{WORKSPACE.name}</div></div>
      </div>
    </aside>
  );
}

function ClientSwitcher({ clients, activeId, onPick }) {
  const { workspace } = React.useContext(AppContext);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const active = clients.find((c) => c.id === activeId);
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.gstin.toLowerCase().includes(q.toLowerCase()));
  const isSolo = workspace?.type === "solo_ca";
  const singleClientSolo = isSolo && clients.length === 1;
  const practiceLabel = isSolo ? "All my clients" : "All clients";
  const practiceSubLabel = isSolo ? "Solo view" : "Practice view";
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", minWidth: 230 }}>
        <Briefcase size={16} color={C.navy} />
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.1 }}>{active ? active.name : practiceLabel}</div>
          <div style={{ ...TNUM, fontSize: 10.5, color: C.textMute }}>{active ? active.gstin : practiceSubLabel}</div>
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
            {!singleClientSolo && (
              <button onClick={() => { onPick(null); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 7, border: "none", cursor: "pointer", textAlign: "left", background: activeId === null ? "#EAF2FB" : "transparent" }}>
                <LayoutDashboard size={16} color={C.navy} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{practiceLabel} · {practiceSubLabel}</span>
              </button>
            )}
            {!singleClientSolo && <div style={{ height: 1, background: C.borderLite, margin: "6px 4px" }} />}
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

function UserMenu({ onLogout, setPage }) {
  const { currentUser, workspace } = React.useContext(AppContext);
  const [open, setOpen] = useState(false);
  const name = currentUser?.name || "User";
  const email = currentUser?.email || "";
  const initials = name.split(" ").map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "CA";
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: 32, height: 32, borderRadius: 999, background: C.navy, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>{initials}</button>
      {open && <>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div style={{ position: "absolute", top: 40, right: 0, width: 230, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 28px rgba(20,40,70,.14)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderLite}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 12, color: C.textMute, marginTop: 2 }}>{email}</div>
          </div>
          <button onClick={() => { setPage("settings"); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "11px 16px", border: "none", cursor: "pointer", background: "transparent", fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
            <SettingsIcon size={15} color={C.textMute} /> Profile & settings
          </button>
          <div style={{ height: 1, background: C.borderLite, margin: "0 16px" }} />
          <button onClick={() => { setOpen(false); onLogout(); }} style={{ width: "100%", textAlign: "left", padding: "11px 16px", border: "none", cursor: "pointer", background: "transparent", fontSize: 13, color: C.red, display: "flex", alignItems: "center", gap: 8 }}>
            <X size={15} color={C.red} /> Log out
          </button>
        </div>
      </>}
    </div>
  );
}

function Topbar({ clients, activeId, setActiveId, period, setPeriod, apiOk, onLogout, setPage }) {
  const { workspace } = React.useContext(AppContext);
  const WORKSPACE = workspace || { name: "Loading...", type: "ca_firm" };
  const dot = apiOk === true ? C.green : apiOk === false ? C.textFaint : C.amber;
  const lbl = apiOk === true ? "API connected" : apiOk === false ? "API offline" : "Checking…";
  const typeLabel = workspaceTypeLabel(WORKSPACE.type);
  const typeBadgeColor = WORKSPACE.type === "solo_ca" ? { color: "#5B4FCF", bg: "#EDE9FE" } : WORKSPACE.type === "in_house" ? { color: C.navy, bg: "#EAF2FB" } : { color: C.green2, bg: "#E5F3EB" };
  return (
    <header style={{ height: 56, background: "#fff", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Building2 size={17} color={C.navy} />
        <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{WORKSPACE.name}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: typeBadgeColor.color, background: typeBadgeColor.bg, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>{typeLabel}</span>
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
        <Bell size={18} />
        <UserMenu onLogout={onLogout} setPage={setPage} />
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
function PracticeDashboard({ clients, go, openClient }) {
  const { workspace, clientRuns, summary, itcAtRisk } = React.useContext(AppContext);
  const WORKSPACE = workspace || { name: "Loading...", type: "ca_firm" };
  const CLIENT_RUNS = clientRuns || [];
  const SUMMARY = summary || [];
  const ITC_AT_RISK = itcAtRisk || 0;
  const isSolo = WORKSPACE.type === "solo_ca";
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
      <PageHead title={isSolo ? "My reconciliations" : "Practice overview"} subtitle={`${WORKSPACE.name} · ${clients.length} ${isSolo ? "clients" : "clients"} · FY 2026–27`}
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
  const { clientRuns, summary } = React.useContext(AppContext);
  const [kpis, setKpis] = useState({ open_runs: 0, itc_recovered: 0, itc_at_risk: client.risk || 0, vendors_flagged: 0 });

  useEffect(() => {
    getDashboardKpis().then(res => {
      setKpis(res);
    }).catch(() => {});
  }, [client]);

  const stat = (label, value, color, Icon) => (
    <Card key={label} style={{ padding: 16, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><Label>{label}</Label><Icon size={16} color={C.textFaint} /></div>
      <div style={{ ...TNUM, fontSize: 26, fontWeight: 700, marginTop: 10, color: color || C.navy }}>{value}</div>
    </Card>
  );

  const attention = [
    { dot: C.amber, t: `${summary.find(s => s.key === "probable")?.count || 0} probable matches to review`, s: "Apr 2026", go: "review" },
    { dot: C.red, t: `${inr(summary.find(s => s.key === "missing_in_portal")?.value || 0)} missing in portal`, s: "Apr 2026", go: "reconciliation" },
    { dot: C.slate, t: `${summary.find(s => s.key === "missing_in_books")?.count || 0} invoices missing in books`, s: "Apr 2026", go: "reconciliation" }
  ];

  return (
    <div>
      <PageHead title={client.name} subtitle={`${client.gstin} · ${client.state} · FY 2026–27`}
        right={<Btn variant="primary" icon={Plus} onClick={() => go("new")}>New reconciliation</Btn>} />
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        {stat("Open runs", String(kpis.open_runs), C.navy, LayoutDashboard)}
        {stat("ITC recovered (FY)", inrShort(kpis.itc_recovered), C.navy, ShieldCheck)}
        <Card style={{ padding: 16, flex: 1, borderLeft: `3px solid ${C.red}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><Label>ITC at risk</Label><AlertTriangle size={16} color={C.red} /></div>
          <div style={{ ...TNUM, fontSize: 26, fontWeight: 700, marginTop: 10, color: C.red }}>{inrShort(kpis.itc_at_risk)}</div>
        </Card>
        {stat("Vendors flagged", String(kpis.vendors_flagged), C.navy, Users)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Recent runs</div>
            <button onClick={() => go("reconciliation")} style={{ fontSize: 12.5, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}>Open latest</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: C.inlay, color: C.textMute }}>
              {["Tax period", "Status", "Invoices", "Matched %", "ITC at risk (\u20B9)", "Created", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 2 && i <= 4 ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "8px 14px" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {clientRuns.map((r, i) => (
                <tr key={r.id} onClick={() => go("reconciliation")} style={{ cursor: "pointer", borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 600 }}>{r.period}</td>
                  <td style={{ padding: "9px 14px" }}>{runStatusChip(r.status)}</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right" }}>{r.invoices}</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right" }}>{r.matched}%</td>
                  <td style={{ ...TNUM, padding: "9px 14px", textAlign: "right", color: r.risk ? C.red : C.textMute, fontWeight: r.risk ? 600 : 400 }}>{r.risk ? inrPlain(r.risk) : "–"}</td>
                  <td style={{ padding: "9px 14px", color: C.textMute }}>{r.created}</td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}><ChevronRight size={16} color={C.textFaint} /></td>
                </tr>
              ))}
              {clientRuns.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: C.textMute }}>No recent runs for this client.</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 15, fontWeight: 700 }}>Action needed</div>
          {attention.map((a, i) => (
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
/* ============================================================
   MODAL — Add Client
   ============================================================ */
const INDIAN_STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu & Kashmir","Ladakh","Puducherry","Chandigarh"];

function AddClientModal({ onClose, onAdded }) {
  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const gstinValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
  const ready = legalName.trim().length >= 2 && gstinValid && state;
  const inp = (val, set, placeholder, mono) => <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={{ ...mono ? TNUM : {}, marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, boxSizing: "border-box", outline: "none" }} />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await addClient({ legalName: legalName.trim(), gstin: gstin.trim().toUpperCase(), stateCode: state });
      onAdded();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" }} />
      <div style={{ position: "relative", width: 480, background: "#fff", borderRadius: 12, boxShadow: "0 16px 48px rgba(20,40,70,.18)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Add client</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMute }}><X size={20} /></button>
        </div>
        <form onSubmit={submit} style={{ padding: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Legal / Trade Name</Label>
              {inp(legalName, setLegalName, "e.g. Acme Corp Pvt Ltd", false)}
            </div>
            <div>
              <Label>GSTIN</Label>
              {inp(gstin, setGstin, "27AAAAA0000A1Z5", true)}
              {gstin.length > 0 && !gstinValid && <div style={{ fontSize: 11.5, color: C.red, marginTop: 4 }}>Invalid GSTIN format</div>}
            </div>
            <div>
              <Label>State</Label>
              <select value={state} onChange={e => setState(e.target.value)} style={{ marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, boxSizing: "border-box", background: "#fff" }}>
                <option value="">Select state…</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {err && <div style={{ marginTop: 14, padding: 10, borderRadius: 7, background: C.redBg, color: C.red, fontSize: 12.5 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn variant="primary" disabled={!ready || busy}>{busy ? "Adding…" : "Add client"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteClientModal({ client, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await deleteClient(client.id); onDeleted(); }
    catch (e) { alert("Delete failed: " + e.message); setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" }} />
      <div style={{ position: "relative", width: 440, background: "#fff", borderRadius: 12, boxShadow: "0 16px 48px rgba(20,40,70,.18)", padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: C.redBg, display: "grid", placeItems: "center", flexShrink: 0 }}><Trash2 size={20} color={C.red} /></div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Delete client?</div>
        </div>
        <div style={{ fontSize: 13.5, color: C.textMute, marginBottom: 22, lineHeight: 1.6 }}>
          <b style={{ color: C.text }}>{client.name}</b> and all its reconciliation runs, invoices, and match data will be permanently removed. This cannot be undone.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="danger" icon={Trash2} onClick={confirm} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</Btn>
        </div>
      </div>
    </div>
  );
}

function ClientsPage({ clients, openClient, onClientsChanged }) {
  const { workspace } = React.useContext(AppContext);
  const WORKSPACE = workspace || { name: "Loading...", type: "ca_firm" };
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const rows = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.gstin.toLowerCase().includes(q.toLowerCase()));
  const th = (t, right) => <th style={{ textAlign: right ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: C.textMute, padding: "10px 14px", whiteSpace: "nowrap" }}>{t}</th>;
  const isSolo = WORKSPACE.type === "solo_ca";
  const pageTitle = isSolo ? "My clients" : "Clients";
  return (
    <div>
      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); onClientsChanged(); }} />}
      {deleteTarget && <DeleteClientModal client={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); onClientsChanged(); }} />}
      <PageHead title={pageTitle} subtitle={`${clients.length} client companies in ${WORKSPACE.name}`}
        right={<Btn variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>Add client</Btn>} />
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", width: 280 }}>
            <Search size={15} color={C.textFaint} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client or GSTIN…" style={{ border: "none", outline: "none", fontSize: 13, width: "100%" }} />
          </div>
          <Btn icon={Filter} style={{ height: 32 }}>Filter</Btn>
        </div>
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: C.inlay }}>{th("Client")}{th("GSTIN")}{th("State")}{th("Period status")}{th("Invoices", true)}{th("Matched %", true)}{th("ITC at risk (\u20B9)", true)}{th("Deadline")}{th("Assigned to")}{th("")}</tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
                  <td onClick={() => openClient(c.id)} style={{ padding: "11px 14px", fontWeight: 600, cursor: "pointer" }}>{c.name}</td>
                  <td onClick={() => openClient(c.id)} style={{ ...TNUM, padding: "11px 14px", cursor: "pointer" }}>{c.gstin}</td>
                  <td onClick={() => openClient(c.id)} style={{ padding: "11px 14px", color: C.textMute, cursor: "pointer" }}>{c.state}</td>
                  <td onClick={() => openClient(c.id)} style={{ padding: "11px 14px", cursor: "pointer" }}>{runStatusChip(c.status)}</td>
                  <td onClick={() => openClient(c.id)} style={{ ...TNUM, padding: "11px 14px", textAlign: "right", cursor: "pointer" }}>{c.invoices || "–"}</td>
                  <td onClick={() => openClient(c.id)} style={{ ...TNUM, padding: "11px 14px", textAlign: "right", cursor: "pointer" }}>{c.invoices ? c.matched + "%" : "–"}</td>
                  <td onClick={() => openClient(c.id)} style={{ ...TNUM, padding: "11px 14px", textAlign: "right", color: c.risk ? C.red : C.textMute, fontWeight: c.risk ? 600 : 400, cursor: "pointer" }}>{c.risk ? inrPlain(c.risk) : "–"}</td>
                  <td onClick={() => openClient(c.id)} style={{ padding: "11px 14px", color: C.textMute, whiteSpace: "nowrap", cursor: "pointer" }}>{c.deadline}</td>
                  <td onClick={() => openClient(c.id)} style={{ padding: "11px 14px", color: C.textMute, cursor: "pointer" }}>{c.assignee}</td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4, color: C.textFaint }} title="Delete client">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} style={{ padding: 30, textAlign: "center", color: C.textMute }}>No clients found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
   PAGE — Reconciliation results (client-scoped)
   ============================================================ */
function Reconciliation({ client, go, live }) {
  const { summary, invoices, itcAtRisk } = React.useContext(AppContext);
  const SUMMARY = summary || [];
  const INVOICES = invoices || [];
  const ITC_AT_RISK = itcAtRisk || 0;
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  // KPI cards: live counts (from a real backend run) override the mock totals.
  const cards = SUMMARY.map((s) => ({ ...s, count: live ? live.counts[s.key] : s.count, value: live ? null : s.value }));
  const tabs = [{ key: "all", label: "All", n: live ? live.total : INVOICES.length }, ...cards.map((s) => ({ key: s.key, label: BUCKET[s.key].label, n: s.count, dot: s.key === "probable" ? C.amber : null }))];
  const rows = useMemo(() => {
    let r = tab === "all" ? INVOICES : INVOICES.filter((i) => i.bucket === tab);
    if (q.trim()) { const s = q.toLowerCase(); r = r.filter((i) => i.gstin.toLowerCase().includes(s) || i.name.toLowerCase().includes(s) || i.inv.toLowerCase().includes(s)); }
    return r;
  }, [tab, q]);
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
    const mapped = (live?.rows || []).map((r, i) => ({
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
  }, [tab, q, live]);
  const th = (txt, right) => <th style={{ textAlign: right ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: C.textMute, padding: "10px 14px", position: "sticky", top: 0, background: C.inlay, whiteSpace: "nowrap" }}>{txt}</th>;
  return (
    <div>
      <PageHead title={`${client.name} — Apr 2026`} subtitle={`${client.gstin} · last synced Today, 09:45`}
        right={<><Btn icon={Download}>Export report</Btn><Btn variant="primary" icon={Play} onClick={() => go("new")}>Run again</Btn></>} />
      <div style={{ marginTop: -8, display: "flex", alignItems: "center", gap: 10 }}>
        {runStatusChip(live ? "Completed" : "In progress")}
        {live && <span style={{ ...TNUM, fontSize: 11.5, fontWeight: 700, color: C.green2, background: "#E5F3EB", padding: "2px 8px", borderRadius: 4 }}>
          ● LIVE · {live.total} rows{live.runId ? " · run " + String(live.runId).slice(0, 8) : ""}
        </span>}
      </div>
      <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
        {cards.map((s) => (
          <Card key={s.key} style={{ padding: "12px 14px", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: BUCKET[s.key].fg }} /><span style={{ fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>{s.label}</span></div>
            <div style={{ ...TNUM, fontSize: 19, fontWeight: 700, marginTop: 7 }}>{live ? s.count : inr(s.value)}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: C.textFaint, marginTop: 3, textTransform: "uppercase" }}>{live ? "invoices" : s.count + " invoices"}</div>
          </Card>
        ))}
        <Card style={{ padding: "12px 14px", flex: 1, background: C.redBg, border: `1px solid #F1C9C4` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} color={C.red} /><span style={{ fontSize: 12.5, color: C.red, fontWeight: 700 }}>ITC at risk</span></div>
          <div style={{ ...TNUM, fontSize: 19, fontWeight: 700, color: C.red, marginTop: 7 }}>{live ? (live.counts.missing_in_portal + live.counts.mismatched) : inr(ITC_AT_RISK)}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: C.red, marginTop: 3, textTransform: "uppercase" }}>{live ? "flagged invoices" : "Requires action"}</div>
        </Card>
      </div>
      {live && <div style={{ marginBottom: 16, fontSize: 12, color: C.textMute }}>Showing live bucket counts returned by the engine. The detailed table below is illustrative until the per-invoice results endpoint (M7) is wired.</div>}
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
          {live ? (
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
          <div style={{ fontSize: 12.5, color: C.textMute }}>{live ? `Showing ${liveRows.length} of ${live.total} rows` : `Showing 1–${rows.length} of ${tab === "all" ? 192 : rows.length} rows`}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PagBtn><ChevronLeft size={15} /></PagBtn>{["1", "2", "3", "…", "20"].map((p, i) => <PagBtn key={i} active={p === "1"}>{p}</PagBtn>)}<PagBtn><ChevronRight size={15} /></PagBtn>
          </div>
        </div>
      </Card>
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
    e.preventDefault();
    const f = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (f) setter({ file: f, name: f.name, size: humanSize(f.size) });
    if (e.target.value) e.target.value = ""; // allow re-selecting the same file
  };

  const start = async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await reconcile(pr.file, two.file);
      const runId = res.run_id;
      const resultsData = await getRunResults(runId);
      const rows = resultsData.database_rows || [];
      onReconciled({ runId, rows, counts: summarize(rows), total: res.total_records_committed || rows.length });
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

  const Dropzone = ({ kind, onPick, onDrop }) => (
    <div 
      onDragOver={(e) => e.preventDefault()} 
      onDrop={onDrop}
      style={{ border: `1.5px dashed ${C.border}`, borderRadius: 8, padding: "28px 16px", textAlign: "center", background: C.inlay }}>
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
              {pr ? <FileRow f={pr} onRemove={() => setPr(null)} /> : <Dropzone kind="PR" onPick={() => prRef.current?.click()} onDrop={onFile(setPr)} />}
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 13.5, fontWeight: 600 }}>GSTR-2B</span><Chip label="Required" fg={C.textMute} bg={C.slateBg} dot={false} /></div>
              {two ? <FileRow f={two} onRemove={() => setTwo(null)} /> : <Dropzone kind="2B" onPick={() => twoRef.current?.click()} onDrop={onFile(setTwo)} />}
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
  const { probable } = React.useContext(AppContext);
  const PROBABLE = probable || [];
  const [idx, setIdx] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const queue = PROBABLE;
  const cur = queue[idx];
  const total = queue.length;
  const next = () => { setReviewed((r) => Math.min(total, r + 1)); setIdx((i) => (i + 1) % queue.length); };

  const handleDecision = async (status, overrideBucket) => {
    if (!cur) return;
    try {
      await submitReviewMatch(null, cur.id, { status, overrideBucket });
      next();
    } catch (e) {
      alert("Failed to submit review: " + e.message);
    }
  };

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

  if (!cur) {
    return (
      <div>
        <PageHead title="Review probable matches" subtitle={`${client.name} · No matches to review`} />
        <Card style={{ padding: 40, textAlign: "center", color: C.textMute }}>
          All caught up! No probable matches remaining for review.
        </Card>
      </div>
    );
  }

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
            <Btn onClick={next}>Skip</Btn>
            <Btn variant="danger" icon={X} onClick={() => handleDecision("rejected", "Mismatched")}>Reject</Btn>
            <Btn variant="success" icon={Check} onClick={() => handleDecision("confirmed", "Matched")}>Confirm match</Btn>
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
  const { clientRuns } = React.useContext(AppContext);
  const reports = [
    { t: "Invoice-level reconciliation statement", d: "Every variance between books and portal, ready for ASMT-10.", fmt: "XLSX · PDF", type: "invoice_level" },
    { t: "Safe-to-claim summary (GSTR-3B)", d: "Matched + eligible ITC cleared for the 3B draft.", fmt: "XLSX", type: "safe_to_claim" },
    { t: "Discrepancy notices (per vendor)", d: "Mismatched and missing-in-portal invoices, grouped by supplier.", fmt: "PDF", type: "vendor_discrepancies" },
    { t: "ITC at risk — ageing", d: "Unmatched credit by ageing bucket against Section 16(4).", fmt: "XLSX · PDF", type: "ageing" },
    { t: "Vendor compliance scorecard", d: "Filing reliability and defaulted value by vendor.", fmt: "XLSX", type: "vendor_scorecard" },
    { t: "Annual reconciliation ledger (GSTR-9/9C)", d: "Monthly runs rolled up for the annual return.", fmt: "XLSX", type: "annual_ledger" },
  ];

  const handleGenerate = async (type) => {
    const runId = clientRuns[0]?.id;
    if (!runId) return alert("Please run a reconciliation first to generate reports.");
    try {
      const res = await downloadReport(runId, type);
      if (res.url) {
        window.open(res.url, "_blank");
      } else {
        alert("Failed to generate report");
      }
    } catch (e) {
      alert("Error generating report: " + e.message);
    }
  };

  return (
    <div>
      <PageHead title="Reports" subtitle={`${client.name} · ${client.gstin} · Apr 2026`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {reports.map((r) => (
          <Card key={r.t} style={{ padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "#EAF2FB", display: "grid", placeItems: "center", flexShrink: 0 }}><FileText size={20} color={C.blue} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.t}</div>
              <div style={{ fontSize: 12.5, color: C.textMute, margin: "4px 0 12px", lineHeight: 1.45 }}>{r.d}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.textFaint }}>{r.fmt}</span><Btn icon={Download} onClick={() => handleGenerate(r.type)} style={{ height: 30 }}>Generate</Btn></div>
            </div>
          </Card>
        ))}
      </div>
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
  const { workspace } = React.useContext(AppContext);
  const [name, setName] = useState(workspace?.name || "");
  const [type, setType] = useState(workspace?.type || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateWorkspace({ name, type });
      alert("Practice profile updated successfully!");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle>Practice profile</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div><Label>Firm name</Label><input value={name} onChange={e => setName(e.target.value)} style={{ ...TNUM, marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, background: "#fff", color: C.text, boxSizing: "border-box" }} /></div>
        <div><Label>Account type</Label><input value={type} onChange={e => setType(e.target.value)} style={{ ...TNUM, marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, background: "#fff", color: C.text, boxSizing: "border-box" }} /></div>
        <Field label="Primary contact" value="Amit Jain" readOnly />
        <Field label="Contact email" value="amit@caassociates.in" readOnly />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <Btn variant="primary" disabled={busy} onClick={save}>Save changes</Btn>
      </div>
    </div>
  );
}

function TeamRoles() {
  const [users, setUsers] = useState([]);
  
  const { workspace } = React.useContext(AppContext);
  const isSolo = workspace?.type === "solo_ca";

  useEffect(() => {
    getWorkspaceUsers().then(res => setUsers(res)).catch(() => {});
  }, []);

  const handleInvite = async () => {
    const email = prompt("Enter email of the team member to invite:");
    if (!email) return;
    const fullName = prompt("Enter full name:");
    if (!fullName) return;
    try {
      await inviteUser({ fullName, email, role: "admin" });
      const fresh = await getWorkspaceUsers();
      setUsers(fresh);
      alert("User invited successfully!");
    } catch (e) {
      alert("Invitation failed: " + e.message);
    }
  };

  if (isSolo) {
    return (
      <div>
        <SectionTitle>Team & roles</SectionTitle>
        <div style={{ padding: "20px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: "#EDE9FE", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Users size={20} color="#5B4FCF" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Solo account</div>
            <div style={{ fontSize: 13, color: C.textMute, marginTop: 4, lineHeight: 1.6 }}>Team collaboration is available on CA Firm accounts. Upgrade your plan to invite colleagues, assign roles, and manage client access.</div>
            <Btn variant="primary" style={{ marginTop: 12 }}>Upgrade to CA Firm</Btn>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: C.inlay, color: C.textMute }}>{["Name", "Email", "Role"].map((h, i) => <th key={i} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "9px 12px" }}>{h}</th>)}</tr></thead>
          <tbody>{users.map((u, i) => (
            <tr key={u.id} style={{ borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
              <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.name}</td>
              <td style={{ padding: "10px 12px", color: C.textMute }}>{u.email}</td>
              <td style={{ padding: "10px 12px" }}><Chip label={u.role || "Admin"} fg={C.navy} bg="#EAF2FB" dot={false} /></td>
            </tr>))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionTitle>Team & roles</SectionTitle>
        <Btn variant="primary" icon={Plus} onClick={handleInvite} style={{ height: 32 }}>Invite member</Btn>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ background: C.inlay, color: C.textMute }}>{["Name", "Email", "Role", "Client access"].map((h, i) => <th key={i} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "9px 12px" }}>{h}</th>)}</tr></thead>
        <tbody>{users.map((u, i) => (
          <tr key={u.id} style={{ borderTop: `1px solid ${C.borderLite}`, background: i % 2 ? C.zebra : "#fff" }}>
            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.name}</td>
            <td style={{ padding: "10px 12px", color: C.textMute }}>{u.email}</td>
            <td style={{ padding: "10px 12px" }}><Chip label={u.role || "Admin"} fg={C.navy} bg="#EAF2FB" dot={false} /></td>
            <td style={{ padding: "10px 12px", color: C.textMute }}>All clients</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
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
  const [legalName, setLegalName] = useState(client?.name || "");
  const [stateCode, setStateCode] = useState(client?.state || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateClient(client.id, { legalName, gstin: client.gstin, stateCode });
      alert("Client details updated successfully!");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle>Client details — {client.name}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div><Label>Legal name</Label><input value={legalName} onChange={e => setLegalName(e.target.value)} style={{ ...TNUM, marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, background: "#fff", color: C.text, boxSizing: "border-box" }} /></div>
        <Field label="GSTIN" value={client.gstin} readOnly />
        <div><Label>State</Label><input value={stateCode} onChange={e => setStateCode(e.target.value)} style={{ ...TNUM, marginTop: 6, width: "100%", height: 38, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 12px", fontSize: 13.5, background: "#fff", color: C.text, boxSizing: "border-box" }} /></div>
        <Field label="Filing frequency" value="Monthly" readOnly />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <Btn variant="primary" disabled={busy} onClick={save}>Save changes</Btn>
      </div>
    </div>
  );
}

function Vendors() {
  const { activeClientId } = React.useContext(AppContext);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    if (activeClientId) {
      getClientVendors(activeClientId).then(res => setVendors(res)).catch(() => {});
    }
  }, [activeClientId]);

  return (
    <div>
      <SectionTitle>Vendor master</SectionTitle>
      <div style={{ fontSize: 13, color: C.textMute, marginBottom: 14 }}>Vendors are per client, derived from invoice GSTINs. Add contact details so discrepancy notices can be dispatched automatically.</div>
      {vendors.map((x, i) => (
        <div key={x.gstin} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C.borderLite}` : "none" }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{x.name}</div><div style={{ ...TNUM, fontSize: 12, color: C.textMute }}>{x.gstin}</div></div>
          <Chip label={x.status} fg={x.color === "green" ? C.green : C.amber} bg={x.color === "green" ? C.greenBg : C.amberBg} dot={false} />
        </div>
      ))}
      {vendors.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.textMute }}>No vendors found. Try running a reconciliation first.</div>}
    </div>
  );
}

function MatchingRules({ scope, client }) {
  const [tolerance, setTolerance] = useState("1.00");
  const [window, setWindow] = useState("2");
  const [threshold, setThreshold] = useState("80");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = scope === "practice" ? await getWorkspaceSettings() : await getClientSettings(client.id);
        setTolerance(String(res.tax_tolerance));
        setWindow(String(res.date_window_days));
        setThreshold(String(res.fuzzy_threshold));
      } catch (e) {}
    };
    loadSettings();
  }, [scope, client]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        tax_tolerance: parseFloat(tolerance),
        date_window_days: parseFloat(window),
        fuzzy_threshold: parseFloat(threshold)
      };
      if (scope === "practice") {
        await updateWorkspaceSettings(payload);
      } else {
        await updateClientSettings(client.id, payload);
      }
      alert("Matching rules saved successfully!");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const row = (title, desc, control) => (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: `1px solid ${C.borderLite}` }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 12.5, color: C.textMute, marginTop: 2 }}>{desc}</div></div>{control}
    </div>
  );

  return (
    <div>
      <SectionTitle>{scope === "practice" ? "Default matching rules" : `Matching overrides — ${client.name}`}</SectionTitle>
      <div style={{ fontSize: 13, color: C.textMute, marginBottom: 4 }}>
        {scope === "practice" ? "Firm-wide defaults applied to every new client." : "Overrides for this client only."}
      </div>
      {row("Tax tolerance", "Treat as matched if tax differs by at most this amount.", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><input value={tolerance} onChange={e => setTolerance(e.target.value)} style={{ ...TNUM, width: 70, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13, textAlign: "right" }} /><span style={{ fontSize: 12.5, color: C.textMute }}>₹</span></div>)}
      {row("Date window", "Allow invoice dates to differ by up to this many days.", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><input value={window} onChange={e => setWindow(e.target.value)} style={{ ...TNUM, width: 70, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13, textAlign: "right" }} /><span style={{ fontSize: 12.5, color: C.textMute }}>days</span></div>)}
      {row("Fuzzy confidence threshold", "Minimum score for an invoice to surface as a probable match.", <div style={{ display: "flex", alignItems: "center", gap: 6 }}><input value={threshold} onChange={e => setThreshold(e.target.value)} style={{ ...TNUM, width: 70, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13, textAlign: "right" }} /><span style={{ fontSize: 12.5, color: C.textMute }}>%</span></div>)}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <Btn variant="primary" disabled={busy} onClick={save}>Save changes</Btn>
      </div>
    </div>
  );
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
   AUTH: Login & Register screen with OTP
   ============================================================ */
function AuthScreen({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceType, setWorkspaceType] = useState("ca_firm");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email) return setError("Email is required");
    setError("");
    setLoading(true);
    try {
      await requestOtp(email);
      setOtpSent(true);
    } catch (err) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let res;
      if (isRegister) {
        res = await register({ email, password, fullName, workspaceName, workspaceType, otp });
      } else {
        res = await login({ email, password, otp });
      }
      localStorage.setItem("token", res.access_token);
      onAuthSuccess(res.access_token);
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
      <div style={{ width: 420, padding: 32, background: "#fff", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.08)", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: C.navy, display: "grid", placeItems: "center" }}><Landmark size={20} color="#fff" /></div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>GST Reconciliation</div>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6, textAlign: "center" }}>
          {isRegister ? "Create your account" : "Welcome back"}
        </h2>
        <p style={{ fontSize: 13, color: C.textMute, textAlign: "center", marginBottom: 22 }}>
          {isRegister ? "Set up your workspace to get started" : "Sign in to your reconciliation workspace"}
        </p>

        {error && <div style={{ padding: "10px 12px", background: C.redBg, color: C.red, borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <form onSubmit={otpSent ? handleSubmit : handleSendOtp}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Email Address</label>
            <input disabled={otpSent} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%", height: 38, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }} />
          </div>

          {!otpSent ? (
            <button type="submit" disabled={loading} style={{ width: "100%", height: 40, background: C.blue, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              {loading ? "Sending..." : "Send OTP"}
            </button>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>OTP Code (printed to console)</label>
                <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} required style={{ width: "100%", height: 38, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", height: 38, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }} />
              </div>
              {isRegister && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Full Name</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required style={{ width: "100%", height: 38, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Workspace / Practice Name</label>
                    <input type="text" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required style={{ width: "100%", height: 38, padding: "0 12px", border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 22 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>Account type</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[{v: "ca_firm", label: "CA Firm", desc: "Team · multiple clients"}, {v: "solo_ca", label: "Solo CA", desc: "Individual · streamlined"}].map(opt => (
                        <button key={opt.v} type="button" onClick={() => setWorkspaceType(opt.v)} style={{ padding: "10px 12px", borderRadius: 8, border: `2px solid ${workspaceType === opt.v ? C.navy : C.border}`, background: workspaceType === opt.v ? "#EAF2FB" : "#fff", cursor: "pointer", textAlign: "left" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: workspaceType === opt.v ? C.navy : C.text }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: C.textMute, marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <button type="submit" disabled={loading} style={{ width: "100%", height: 40, background: C.green, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
                {loading ? "Authenticating..." : isRegister ? "Create Workspace" : "Log In"}
              </button>
            </>
          )}
        </form>

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button onClick={() => { setIsRegister(!isRegister); setOtpSent(false); setError(""); }} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            {isRegister ? "Already have an account? Log In" : "Need an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ROOT
   ============================================================ */
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [page, setPage] = useState("dashboard");
  const [activeClientId, setActiveClientId] = useState(null); // null = practice view
  const [period, setPeriod] = useState("FY 2026\u201327 \u00b7 Apr 2026");
  const [apiOk, setApiOk] = useState(null); // null = checking, true/false = result
  const [live, setLive] = useState(null);   // last real reconcile result
  const [currentUser, setCurrentUser] = useState(null);

  const [data, setData] = useState({
    workspace: null,
    clients: [],
    clientRuns: [],
    summary: [],
    invoices: [],
    probable: [],
    itcAtRisk: 0
  });

  const go = (p) => setPage(p);
  const openClient = (id) => { setActiveClientId(id); setPage("dashboard"); };

  useEffect(() => {
    let alive = true;
    health().then(() => alive && setApiOk(true)).catch(() => alive && setApiOk(false));
    return () => { alive = false; };
  }, []);

  const bootstrap = () => {
    if (!token) return;
    Promise.all([
      getWorkspace().catch(() => ({ name: "CA Firm Workspace", type: "ca_firm" })),
      getClients().catch(() => []),
      getCurrentUser().catch(() => null)
    ]).then(([ws, cl, me]) => {
      setData(prev => ({ ...prev, workspace: ws, clients: cl }));
      if (me) setCurrentUser(me);
    });
  };

  useEffect(() => {
    bootstrap();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (activeClientId) {
      getClientRuns(activeClientId).then((runs) => {
        const latestRun = runs[0];
        if (latestRun) {
          Promise.all([
            getRunSummary(latestRun.id).catch(() => ({ summary: [], itc_at_risk: 0 })),
            getRunResults(latestRun.id).catch(() => ({ database_rows: [] })),
            getRunProbable(latestRun.id).catch(() => [])
          ]).then(([sum, inv, prob]) => {
            setData(prev => ({
              ...prev,
              clientRuns: runs,
              summary: sum.summary || [],
              invoices: inv.database_rows || [],
              probable: prob || [],
              itcAtRisk: sum.itc_at_risk || 0
            }));
          });
        } else {
          setData(prev => ({
            ...prev,
            clientRuns: [],
            summary: [],
            invoices: [],
            probable: [],
            itcAtRisk: 0
          }));
        }
      }).catch(() => {});
    } else {
      setData(prev => ({ ...prev, clientRuns: [], summary: [], invoices: [], probable: [], itcAtRisk: 0 }));
    }
  }, [activeClientId, token]);

  const onReconciled = (result) => { setLive(result); setPage("reconciliation"); };
  const onClientsChanged = () => {
    getClients().catch(() => []).then(cl => setData(prev => ({ ...prev, clients: cl })));
  };
  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setCurrentUser(null);
    setData({ workspace: null, clients: [], clientRuns: [], summary: [], invoices: [], probable: [], itcAtRisk: 0 });
    setActiveClientId(null);
    setPage("dashboard");
  };

  if (!token) {
    return <AuthScreen onAuthSuccess={(t) => setToken(t)} />;
  }

  const CLIENTS = data.clients || [];
  const client = CLIENTS.find((c) => c.id === activeClientId) || null;

  return (
    <AppContext.Provider value={{ ...data, activeClientId, currentUser }}>
    <div style={{ display: "flex", height: "100vh", fontFamily: FONT, color: C.text, background: C.bg, overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar clients={CLIENTS} activeId={activeClientId} setActiveId={setActiveClientId} period={period} setPeriod={setPeriod} apiOk={apiOk} onLogout={handleLogout} setPage={setPage} />
        <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {page === "dashboard" && (client ? <ClientDashboard client={client} go={go} /> : <PracticeDashboard clients={CLIENTS} go={go} openClient={openClient} />)}
          {page === "clients" && <ClientsPage clients={CLIENTS} openClient={openClient} onClientsChanged={onClientsChanged} />}
          {page === "reconciliation" && <ClientGate client={client} clients={CLIENTS} onPick={setActiveClientId}><Reconciliation client={client} go={go} live={live} /></ClientGate>}
          {page === "new" && <ClientGate client={client} clients={CLIENTS} onPick={setActiveClientId}><NewRun client={client} go={go} onReconciled={onReconciled} /></ClientGate>}
          {page === "review" && <ClientGate client={client} clients={CLIENTS} onPick={setActiveClientId}><Review client={client} go={go} /></ClientGate>}
          {page === "reports" && <ClientGate client={client} clients={CLIENTS} onPick={setActiveClientId}><Reports client={client} /></ClientGate>}
          {page === "settings" && <Settings client={client} />}
        </main>
      </div>
    </div>
    </AppContext.Provider>
  );
}