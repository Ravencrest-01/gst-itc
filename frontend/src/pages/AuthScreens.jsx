import React, { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { requestOtp } from "../api/client";

const C = {
  navy: "#1F4E79", navyDark: "#163A5A", blue: "#2E75B6", bg: "#F5F7FA",
  border: "#E3E8EF", text: "#1A1C1F", mute: "#6B7785", red: "#C0392B", redBg: "#FBEAE8",
  green: "#2E7D46", greenBg: "#E8F3EC",
};
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function Field({ label, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.mute }}>{label}</span>
      <input {...props} style={{ width: "100%", height: 40, marginTop: 5, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
    </label>
  );
}

function Shell({ title, subtitle, children, footer }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, fontFamily: FONT, padding: 20 }}>
      <div style={{ width: 400, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 18 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: C.navy, display: "grid", placeItems: "center" }}><Landmark size={20} color="#fff" /></div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.navy }}>GST Reconciliation</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 26, boxShadow: "0 10px 40px rgba(20,40,70,.06)" }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: C.mute, marginTop: 4, marginBottom: 18 }}>{subtitle}</div>}
          {children}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: C.mute }}>{footer}</div>
      </div>
    </div>
  );
}

function Btn({ children, disabled, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={disabled || busy}
      style={{ width: "100%", height: 42, marginTop: 6, border: "none", borderRadius: 8, background: C.navy, color: "#fff", fontSize: 14, fontWeight: 600, cursor: disabled || busy ? "not-allowed" : "pointer", opacity: disabled || busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {busy && <Loader2 size={16} className="spin" />}{children}
    </button>
  );
}

function ErrBox({ children }) {
  if (!children) return null;
  return <div style={{ background: C.redBg, color: C.red, border: "1px solid #F1C9C4", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>{children}</div>;
}
function OkBox({ children }) {
  if (!children) return null;
  return <div style={{ background: C.greenBg, color: C.green, border: "1px solid #BFE0CB", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>{children}</div>;
}

function Login({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr(""); setBusy(true);
    try { await login(email, password); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Sign in" subtitle="Access your reconciliation workspace."
      footer={<>No account? <button onClick={onSwitch} style={{ color: C.blue, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Create one</button></>}>
      <ErrBox>{err}</ErrBox>
      <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" />
      <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
        onKeyDown={(e) => e.key === "Enter" && submit()} />
      <Btn busy={busy} disabled={!email || !password} onClick={submit}>Sign in</Btn>
    </Shell>
  );
}

function Register({ onSwitch }) {
  const { register } = useAuth();
  const [step, setStep] = useState(1); // 1 = details, 2 = otp
  const [form, setForm] = useState({ full_name: "", email: "", password: "", workspace_name: "", workspace_type: "ca_firm" });
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const sendOtp = async () => {
    setErr(""); setOk(""); setBusy(true);
    try {
      await requestOtp(form.email);
      setOk("We sent a code. For this MVP it prints in the backend console.");
      setStep(2);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const submit = async () => {
    setErr(""); setBusy(true);
    try { await register({ ...form, otp }); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const detailsReady = form.full_name && form.email && form.password && form.workspace_name;

  return (
    <Shell title="Create your workspace" subtitle="Set up your firm and admin account."
      footer={<>Already have an account? <button onClick={onSwitch} style={{ color: C.blue, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Sign in</button></>}>
      <ErrBox>{err}</ErrBox>
      <OkBox>{ok}</OkBox>
      {step === 1 ? (
        <>
          <Field label="Full name" value={form.full_name} onChange={set("full_name")} placeholder="Amit Jain" />
          <Field label="Work email" type="email" value={form.email} onChange={set("email")} placeholder="you@firm.com" />
          <Field label="Password" type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
          <Field label="Workspace / firm name" value={form.workspace_name} onChange={set("workspace_name")} placeholder="Sharma & Associates" />
          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.mute }}>Account type</span>
            <select value={form.workspace_type} onChange={set("workspace_type")} style={{ width: "100%", height: 40, marginTop: 5, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, background: "#fff" }}>
              <option value="ca_firm">CA firm (multiple clients)</option>
              <option value="in_house">In-house (single company)</option>
            </select>
          </label>
          <Btn busy={busy} disabled={!detailsReady} onClick={sendOtp}>Send verification code</Btn>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.mute, marginBottom: 12 }}>Enter the 6-digit code sent to <b>{form.email}</b>.</div>
          <Field label="Verification code" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" maxLength={6} />
          <Btn busy={busy} disabled={otp.length < 6} onClick={submit}>Create workspace</Btn>
          <button onClick={() => setStep(1)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: C.mute, fontSize: 12.5, cursor: "pointer" }}>← Back to details</button>
        </>
      )}
    </Shell>
  );
}

export default function AuthScreens() {
  const [mode, setMode] = useState("login");
  return mode === "login"
    ? <Login onSwitch={() => setMode("register")} />
    : <Register onSwitch={() => setMode("login")} />;
}
