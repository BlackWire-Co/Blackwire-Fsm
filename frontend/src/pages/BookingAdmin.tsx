import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minutesToTime(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

type Tab = "general" | "services" | "providers" | "blocks";

export default function BookingAdmin() {
  const [tab, setTab] = useState<Tab>("general");
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Online Booking</h1>
          <div className="sub">Public self-scheduling page - services, availability, and the rules customers book against</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["general", "services", "providers", "blocks"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "btn primary" : "btn ghost"} onClick={() => setTab(t)}>
            {t === "general" ? "General Settings" : t === "services" ? "Services" : t === "providers" ? "Providers" : "Blocked Time"}
          </button>
        ))}
      </div>

      {/* Every tab stays mounted the whole time - only hidden via CSS - so
          switching tabs never wipes out an unsaved edit. (Previously each
          tab was conditionally rendered, which unmounted it entirely on
          switch and silently discarded anything not yet saved - e.g.
          flipping "enabled" on, then leaving to set up a provider before
          hitting Save, would quietly reset the checkbox back off.) */}
      <div hidden={tab !== "general"}><GeneralSettings /></div>
      <div hidden={tab !== "services"}><Services /></div>
      <div hidden={tab !== "providers"}><Providers /></div>
      <div hidden={tab !== "blocks"}><Blocks /></div>
    </div>
  );
}

function GeneralSettings() {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api("/booking-admin/settings").then(setForm); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const updated = await api("/booking-admin/settings", {
        method: "PATCH",
        body: {
          enabled: form.enabled,
          timezone: form.timezone,
          arrivalWindowMin: Number(form.arrivalWindowMin),
          bufferMin: Number(form.bufferMin),
          minNoticeHours: Number(form.minNoticeHours),
          maxAdvanceDays: Number(form.maxAdvanceDays),
          slotIntervalMin: Number(form.slotIntervalMin),
          requireAddress: form.requireAddress,
          requirePhone: form.requirePhone,
          requireEmail: form.requireEmail,
          requireNotes: form.requireNotes,
          confirmationNote: form.confirmationNote || "",
        },
      });
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      // Surface a failed save instead of silently leaving the on-screen
      // form out of sync with what's actually stored - a save that didn't
      // take should never look identical to one that did.
      setError(err.message || "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p>Loading…</p>;

  return (
    <form onSubmit={save}>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Status</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} style={{ width: "auto" }} />
          Online booking page is live
        </label>
        <p className="who" style={{ marginTop: 8 }}>
          When off, the public booking page tells visitors booking isn't available right now. Set up at least one service and one provider before turning this on.
        </p>
        {form.enabled && (
          <p className="who" style={{ marginTop: 4 }}>
            Public booking link: <code style={{ fontFamily: "var(--font-mono)" }}>{window.location.origin}/book</code>
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Scheduling Rules</h3>
        <div className="grid cols-3">
          <div className="field">
            <label>Time zone (IANA name)</label>
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/Los_Angeles" />
          </div>
          <div className="field">
            <label>Arrival window (minutes)</label>
            <input type="number" min="0" value={form.arrivalWindowMin} onChange={(e) => setForm({ ...form, arrivalWindowMin: e.target.value })} />
          </div>
          <div className="field">
            <label>Buffer between jobs (minutes)</label>
            <input type="number" min="0" value={form.bufferMin} onChange={(e) => setForm({ ...form, bufferMin: e.target.value })} />
          </div>
          <div className="field">
            <label>Minimum notice (hours)</label>
            <input type="number" min="0" value={form.minNoticeHours} onChange={(e) => setForm({ ...form, minNoticeHours: e.target.value })} />
          </div>
          <div className="field">
            <label>How far out customers can book (days)</label>
            <input type="number" min="1" value={form.maxAdvanceDays} onChange={(e) => setForm({ ...form, maxAdvanceDays: e.target.value })} />
          </div>
          <div className="field">
            <label>Slot interval (minutes)</label>
            <input type="number" min="5" step="5" value={form.slotIntervalMin} onChange={(e) => setForm({ ...form, slotIntervalMin: e.target.value })} />
          </div>
        </div>
        <p className="who">
          The arrival window is just a courtesy shown to the customer ("arrival between 9:00 and 10:00 AM") - it doesn't reserve extra calendar time on its own; the buffer above handles that.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Required Fields</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.requireAddress} onChange={(e) => setForm({ ...form, requireAddress: e.target.checked })} style={{ width: "auto" }} />
            Service address
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.requirePhone} onChange={(e) => setForm({ ...form, requirePhone: e.target.checked })} style={{ width: "auto" }} />
            Phone number
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.requireEmail} onChange={(e) => setForm({ ...form, requireEmail: e.target.checked })} style={{ width: "auto" }} />
            Email address
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={form.requireNotes} onChange={(e) => setForm({ ...form, requireNotes: e.target.checked })} style={{ width: "auto" }} />
            Notes / description of the problem
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Confirmation Note</h3>
        <p className="who" style={{ marginBottom: 10 }}>Shown on the confirmation screen and included in the confirmation email (cancellation policy, parking instructions, etc.)</p>
        <textarea rows={4} value={form.confirmationNote || ""} onChange={(e) => setForm({ ...form, confirmationNote: e.target.value })} />
      </div>

      <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Settings"}</button>
      {saved && <span className="who" style={{ marginLeft: 12, color: "var(--cyan)" }}>Saved.</span>}
      {error && <div className="error-text">{error}</div>}
    </form>
  );
}

function Services() {
  const [services, setServices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", description: "", durationMin: 60, price: 0, sortOrder: 0 });

  function load() { api("/booking-admin/services").then(setServices); }
  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing(null);
    setForm({ name: "", description: "", durationMin: 60, price: 0, sortOrder: 0 });
    setShowForm(true);
  }
  function startEdit(s: any) {
    setEditing(s);
    setForm({ name: s.name, description: s.description || "", durationMin: s.durationMin, price: Number(s.price), sortOrder: s.sortOrder });
    setShowForm(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, durationMin: Number(form.durationMin), price: Number(form.price), sortOrder: Number(form.sortOrder) };
    if (editing) {
      await api(`/booking-admin/services/${editing.id}`, { method: "PATCH", body });
    } else {
      await api("/booking-admin/services", { method: "POST", body });
    }
    setShowForm(false);
    load();
  }

  async function toggleActive(s: any) {
    await api(`/booking-admin/services/${s.id}`, { method: "PATCH", body: { active: !s.active } });
    load();
  }

  async function remove(s: any) {
    if (!confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    await api(`/booking-admin/services/${s.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div className="sub">Services customers can pick from, with price and duration</div>
        <button className="btn primary" onClick={startNew}>+ New Service</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card" style={{ marginBottom: 20 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Price ($)</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Duration (minutes)</label>
              <input type="number" min="5" step="5" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Sort order</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label>Description (shown to customers)</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" type="submit">{editing ? "Save Changes" : "Create Service"}</button>
            <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="table-scroll"><table className="data">
        <thead><tr><th>Name</th><th>Duration</th><th>Price</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.durationMin} min</td>
              <td>${Number(s.price).toFixed(2)}</td>
              <td>{s.active ? "Active" : "Hidden"}</td>
              <td style={{ display: "flex", gap: 8 }}>
                <button className="btn ghost" onClick={() => startEdit(s)}>Edit</button>
                <button className="btn ghost" onClick={() => toggleActive(s)}>{s.active ? "Hide" : "Unhide"}</button>
                <button className="btn danger" onClick={() => remove(s)}>Delete</button>
              </td>
            </tr>
          ))}
          {services.length === 0 && <tr><td colSpan={5} className="empty-note">No services yet - add one above.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

function Providers() {
  const [rows, setRows] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() { api("/booking-admin/providers").then(setRows); }
  useEffect(() => { load(); }, []);

  async function toggleProvider(row: any) {
    if (!row.provider) {
      await api("/booking-admin/providers", { method: "POST", body: { userId: row.user.id } });
    } else {
      await api(`/booking-admin/providers/${row.provider.id}`, { method: "PATCH", body: { active: !row.provider.active } });
    }
    load();
  }

  return (
    <div>
      <p className="who" style={{ marginBottom: 16 }}>
        Flip anyone on your team into a bookable provider. Each provider keeps their own weekly hours, breaks, and time off below.
      </p>
      {rows.map((row) => (
        <div key={row.user.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <strong>{row.user.firstName} {row.user.lastName}</strong>
              <span className="who" style={{ marginLeft: 8 }}>{row.user.roles.join(", ")}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={row.provider?.active ? "btn primary" : "btn ghost"} onClick={() => toggleProvider(row)}>
                {row.provider?.active ? "Bookable" : "Not bookable"}
              </button>
              {row.provider?.active && (
                <button className="btn ghost" onClick={() => setExpanded(expanded === row.provider.id ? null : row.provider.id)}>
                  {expanded === row.provider.id ? "Hide schedule" : "Edit schedule"}
                </button>
              )}
            </div>
          </div>
          {expanded === row.provider?.id && <ProviderSchedule providerId={row.provider.id} />}
        </div>
      ))}
      {rows.length === 0 && <p className="empty-note">No team members found - add users under Settings → Users first.</p>}
    </div>
  );
}

function ProviderSchedule({ providerId }: { providerId: string }) {
  const [availability, setAvailability] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);
  const [availForm, setAvailForm] = useState({ dayOfWeek: 1, start: "09:00", end: "17:00" });
  const [breakForm, setBreakForm] = useState({ dayOfWeek: "" as string | number, start: "12:00", end: "13:00", label: "Lunch" });

  function load() {
    api(`/booking-admin/providers/${providerId}/availability`).then(setAvailability);
    api(`/booking-admin/providers/${providerId}/breaks`).then(setBreaks);
  }
  useEffect(() => { load(); }, [providerId]);

  async function addAvailability(e: FormEvent) {
    e.preventDefault();
    await api(`/booking-admin/providers/${providerId}/availability`, {
      method: "POST",
      body: { dayOfWeek: Number(availForm.dayOfWeek), startMinute: timeToMinutes(availForm.start), endMinute: timeToMinutes(availForm.end) },
    });
    load();
  }
  async function removeAvailability(id: string) {
    await api(`/booking-admin/providers/${providerId}/availability/${id}`, { method: "DELETE" });
    load();
  }
  async function addBreak(e: FormEvent) {
    e.preventDefault();
    await api(`/booking-admin/providers/${providerId}/breaks`, {
      method: "POST",
      body: {
        dayOfWeek: breakForm.dayOfWeek === "" ? null : Number(breakForm.dayOfWeek),
        startMinute: timeToMinutes(breakForm.start),
        endMinute: timeToMinutes(breakForm.end),
        label: breakForm.label,
      },
    });
    load();
  }
  async function removeBreak(id: string) {
    await api(`/booking-admin/providers/${providerId}/breaks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <h3 style={{ marginBottom: 10 }}>Weekly Availability</h3>
      <div className="table-scroll"><table className="data" style={{ marginBottom: 10 }}>
        <thead><tr><th>Day</th><th>Start</th><th>End</th><th></th></tr></thead>
        <tbody>
          {availability.map((a) => (
            <tr key={a.id}>
              <td>{DAYS[a.dayOfWeek]}</td>
              <td>{minutesToTime(a.startMinute)}</td>
              <td>{minutesToTime(a.endMinute)}</td>
              <td><button className="btn ghost" onClick={() => removeAvailability(a.id)}>Remove</button></td>
            </tr>
          ))}
          {availability.length === 0 && <tr><td colSpan={4} className="empty-note">No hours set - this provider won't show any open slots.</td></tr>}
        </tbody>
      </table></div>
      <form onSubmit={addAvailability} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Day</label>
          <select value={availForm.dayOfWeek} onChange={(e) => setAvailForm({ ...availForm, dayOfWeek: Number(e.target.value) })}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Start</label>
          <input type="time" value={availForm.start} onChange={(e) => setAvailForm({ ...availForm, start: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>End</label>
          <input type="time" value={availForm.end} onChange={(e) => setAvailForm({ ...availForm, end: e.target.value })} />
        </div>
        <button className="btn primary" type="submit">Add</button>
      </form>

      <h3 style={{ margin: "20px 0 10px" }}>Breaks</h3>
      <div className="table-scroll"><table className="data" style={{ marginBottom: 10 }}>
        <thead><tr><th>Day</th><th>Start</th><th>End</th><th>Label</th><th></th></tr></thead>
        <tbody>
          {breaks.map((b) => (
            <tr key={b.id}>
              <td>{b.dayOfWeek === null ? "Every day" : DAYS[b.dayOfWeek]}</td>
              <td>{minutesToTime(b.startMinute)}</td>
              <td>{minutesToTime(b.endMinute)}</td>
              <td>{b.label || "—"}</td>
              <td><button className="btn ghost" onClick={() => removeBreak(b.id)}>Remove</button></td>
            </tr>
          ))}
          {breaks.length === 0 && <tr><td colSpan={5} className="empty-note">No breaks configured</td></tr>}
        </tbody>
      </table></div>
      <form onSubmit={addBreak} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Day</label>
          <select value={breakForm.dayOfWeek} onChange={(e) => setBreakForm({ ...breakForm, dayOfWeek: e.target.value })}>
            <option value="">Every day</option>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Start</label>
          <input type="time" value={breakForm.start} onChange={(e) => setBreakForm({ ...breakForm, start: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>End</label>
          <input type="time" value={breakForm.end} onChange={(e) => setBreakForm({ ...breakForm, end: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Label</label>
          <input value={breakForm.label} onChange={(e) => setBreakForm({ ...breakForm, label: e.target.value })} />
        </div>
        <button className="btn primary" type="submit">Add</button>
      </form>
    </div>
  );
}

function Blocks() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [form, setForm] = useState({ providerId: "", startAt: "", endAt: "", label: "" });

  function load() {
    api("/booking-admin/blocks").then(setBlocks);
    api("/booking-admin/providers").then((rows: any[]) =>
      setProviders(rows.filter((r) => r.provider?.active).map((r) => ({ id: r.provider.id, name: `${r.user.firstName} ${r.user.lastName}` })))
    );
  }
  useEffect(() => { load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    await api("/booking-admin/blocks", {
      method: "POST",
      body: {
        providerId: form.providerId || null,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        label: form.label,
      },
    });
    setForm({ providerId: "", startAt: "", endAt: "", label: "" });
    load();
  }
  async function remove(id: string) {
    await api(`/booking-admin/blocks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <p className="who" style={{ marginBottom: 16 }}>
        One-off time off - vacation, a sick day, a holiday. Leave "Provider" set to "Everyone" to block the whole company (e.g. a holiday).
      </p>
      <form onSubmit={add} className="card" style={{ marginBottom: 20, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Provider</label>
          <select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
            <option value="">Everyone</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>To</label>
          <input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} required />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Label</label>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Vacation" />
        </div>
        <button className="btn primary" type="submit">Add Block</button>
      </form>

      <div className="table-scroll"><table className="data">
        <thead><tr><th>Provider</th><th>From</th><th>To</th><th>Label</th><th></th></tr></thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.id}>
              <td>{providers.find((p) => p.id === b.providerId)?.name || "Everyone"}</td>
              <td>{new Date(b.startAt).toLocaleString()}</td>
              <td>{new Date(b.endAt).toLocaleString()}</td>
              <td>{b.label || "—"}</td>
              <td><button className="btn ghost" onClick={() => remove(b.id)}>Remove</button></td>
            </tr>
          ))}
          {blocks.length === 0 && <tr><td colSpan={5} className="empty-note">No blocked time</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
