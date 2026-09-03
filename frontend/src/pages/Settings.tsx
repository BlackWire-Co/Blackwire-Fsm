import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { applyCustomCss } from "../customCss";

export default function Settings() {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/settings").then(setForm);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api("/settings", {
        method: "PATCH",
        body: {
          companyName: form.companyName,
          companyAddress: form.companyAddress,
          companyPhone: form.companyPhone,
          companyEmail: form.companyEmail,
          defaultLaborRate: Number(form.defaultLaborRate),
          defaultTaxRate: Number(form.defaultTaxRate),
          jobNumberPrefix: form.jobNumberPrefix,
          estimateNumberPrefix: form.estimateNumberPrefix,
          invoiceNumberPrefix: form.invoiceNumberPrefix,
          autoSendReminders: form.autoSendReminders,
          reminderHoursBefore: Number(form.reminderHoursBefore),
          customCss: form.customCss || "",
        },
      });
      setForm(updated);
      applyCustomCss(updated.customCss || "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <div className="sub">Company info, rates, and document numbering — used across PDFs and invoicing</div>
        </div>
      </div>

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Company Info</h3>
          <div className="grid cols-2">
            <div className="field">
              <label>Company name</label>
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.companyPhone || ""} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <input value={form.companyAddress || ""} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={form.companyEmail || ""} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Rates</h3>
          <div className="grid cols-2">
            <div className="field">
              <label>Default labor rate ($/hour)</label>
              <input type="number" min="0" step="0.01" value={form.defaultLaborRate} onChange={(e) => setForm({ ...form, defaultLaborRate: e.target.value })} />
            </div>
            <div className="field">
              <label>Default tax rate (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={form.defaultTaxRate} onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Document Numbering</h3>
          <p className="who" style={{ marginBottom: 10 }}>Changes only apply to new documents going forward — existing numbers never change.</p>
          <div className="grid cols-3">
            <div className="field">
              <label>Job prefix</label>
              <input value={form.jobNumberPrefix} onChange={(e) => setForm({ ...form, jobNumberPrefix: e.target.value })} maxLength={10} />
            </div>
            <div className="field">
              <label>Estimate prefix</label>
              <input value={form.estimateNumberPrefix} onChange={(e) => setForm({ ...form, estimateNumberPrefix: e.target.value })} maxLength={10} />
            </div>
            <div className="field">
              <label>Invoice prefix</label>
              <input value={form.invoiceNumberPrefix} onChange={(e) => setForm({ ...form, invoiceNumberPrefix: e.target.value })} maxLength={10} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Appointment Reminders</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.autoSendReminders}
              onChange={(e) => setForm({ ...form, autoSendReminders: e.target.checked })}
              style={{ width: "auto" }}
            />
            Automatically email a reminder before each appointment
          </label>
          <p className="who" style={{ marginBottom: 10 }}>
            Off by default — reminders can always be sent manually from a job's page instead.
          </p>
          {form.autoSendReminders && (
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Hours before appointment</label>
              <input type="number" min="1" max="168" value={form.reminderHoursBefore} onChange={(e) => setForm({ ...form, reminderHoursBefore: e.target.value })} />
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Advanced: Custom CSS</h3>
          <p className="who" style={{ marginBottom: 10 }}>
            Paste CSS here to tweak how the app looks — colors, spacing, hover effects, anything you want overridden.
            It applies across the whole staff app (not the customer portal) for every user, right after you save.
            Leave blank to use the default styling. This isn't validated — a typo just won't do anything; it won't break the app.
          </p>
          <textarea
            rows={10}
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
            placeholder={".job-row:hover { background: #222; }"}
            value={form.customCss || ""}
            onChange={(e) => setForm({ ...form, customCss: e.target.value })}
          />
        </div>

        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Settings"}</button>
        {saved && <span className="who" style={{ marginLeft: 12, color: "var(--green)" }}>Saved.</span>}
      </form>
    </div>
  );
}
