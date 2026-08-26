import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subject: "", bodyHtml: "", bodyText: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api("/email-templates").then(setTemplates);
  }
  useEffect(() => { load(); }, []);

  function startEdit(t: any) {
    setEditingKey(t.key);
    setDraft({ subject: t.subject, bodyHtml: t.bodyHtml, bodyText: t.bodyText || "" });
  }

  async function save(key: string) {
    setSaving(true);
    try {
      await api(`/email-templates/${key}`, { method: "PATCH", body: draft });
      setEditingKey(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Email Templates</h1>
          <div className="sub">
            Use <code>{"{{customerName}}"}</code>, <code>{"{{companyName}}"}</code>, and other variables shown per template.
            SMS uses the plain-text version when a customer prefers text and has a phone number on file.
          </div>
        </div>
      </div>

      {templates.map((t) => (
        <div key={t.key} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <strong>{t.name}</strong>
              <div className="jobnum">{t.key}</div>
            </div>
            {editingKey !== t.key && <button className="btn ghost" onClick={() => startEdit(t)}>Edit</button>}
          </div>

          {editingKey === t.key ? (
            <div>
              <div className="field">
                <label>Subject</label>
                <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div className="field">
                <label>Email body (HTML)</label>
                <textarea rows={5} value={draft.bodyHtml} onChange={(e) => setDraft({ ...draft, bodyHtml: e.target.value })} />
              </div>
              <div className="field">
                <label>SMS text (plain text, used only when SMS is sent)</label>
                <textarea rows={2} value={draft.bodyText} onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" disabled={saving} onClick={() => save(t.key)}>Save</button>
                <button className="btn ghost" onClick={() => setEditingKey(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="who" style={{ marginBottom: 6 }}>Subject: {t.subject}</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)" }} dangerouslySetInnerHTML={{ __html: t.bodyHtml }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
