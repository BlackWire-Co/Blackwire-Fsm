import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePortalAuth } from "./PortalAuthContext";

export default function PortalAcceptInvite() {
  const { acceptInvite } = usePortalAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await acceptInvite(token, password);
      navigate("/portal");
    } catch (err: any) {
      setError(err.message || "Could not set up your account");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Missing invite link</h1>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>This page needs an invite link from your email - please use the link we sent you.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <span className="tag">BlackWire FSM</span>
        <h1>Set up your account</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          Choose a password to finish setting up your customer portal access.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Password (min 8 characters)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
          </div>
          <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
            {busy ? "Setting up…" : "Set Password & Sign In"}
          </button>
          {error && <div className="error-text">{error}</div>}
        </form>
      </div>
    </div>
  );
}
