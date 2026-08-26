import { FormEvent, useEffect, useState } from "react";
import { portalApi } from "./api";

export default function PortalMessages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  function load() {
    portalApi("/messages").then(setMessages);
  }
  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await portalApi("/messages", { method: "POST", body: { body } });
      setBody("");
      load();
    } finally { setSending(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Messages</h1>
          <div className="sub">Send us a message any time — replies work like email, so check back rather than expecting an instant reply.</div>
        </div>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>

      <div className="card" style={{ marginBottom: 16, maxHeight: 420, overflowY: "auto" }}>
        {messages.length === 0 && <div className="empty-note">No messages yet — say hello!</div>}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 14, textAlign: m.fromCustomer ? "right" : "left" }}>
            <div
              style={{
                display: "inline-block",
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: 10,
                background: m.fromCustomer ? "var(--violet)" : "var(--surface-2)",
                color: m.fromCustomer ? "#fff" : "var(--ink)",
                textAlign: "left",
              }}
            >
              {m.body}
            </div>
            <div className="who" style={{ marginTop: 4 }}>{new Date(m.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message…" style={{ flex: 1 }} />
        <button className="btn primary" type="submit" disabled={sending}>Send</button>
      </form>
    </div>
  );
}
