import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export default function CustomerMessages() {
  const { id } = useParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  function loadMessages() {
    api(`/customers/${id}/messages`).then(setMessages);
  }
  useEffect(() => {
    api(`/customers/${id}`).then(setCustomer);
    loadMessages();
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [id]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api(`/customers/${id}/messages`, { method: "POST", body: { body } });
      setBody("");
      loadMessages();
    } finally { setSending(false); }
  }

  return (
    <div>
      <Link className="link-back" to="/messages">← All conversations</Link>
      <div className="page-header">
        <div>
          <h1>{customer ? `${customer.firstName} ${customer.lastName}` : "Loading…"}</h1>
          <div className="sub">Customer portal conversation - updates like email, not instant chat</div>
        </div>
        <button className="btn ghost" onClick={loadMessages}>Refresh</button>
      </div>

      <div className="card" style={{ marginBottom: 16, maxHeight: 460, overflowY: "auto" }}>
        {messages.length === 0 && <div className="empty-note">No messages yet.</div>}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 14, textAlign: m.fromCustomer ? "left" : "right" }}>
            <div
              style={{
                display: "inline-block",
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: 10,
                border: m.fromCustomer ? "1px solid var(--line)" : "1px solid rgba(47,233,255,0.35)",
                background: m.fromCustomer ? "var(--surface-2)" : "var(--cyan-wash)",
                color: m.fromCustomer ? "var(--ink)" : "var(--cyan)",
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
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply…" style={{ flex: 1 }} />
        <button className="btn primary" type="submit" disabled={sending}>Send</button>
      </form>
    </div>
  );
}
