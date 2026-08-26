import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<any>(null);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [form, setForm] = useState({ label: "", addressLine1: "", city: "", state: "", zip: "", accessInstructions: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api(`/customers/${id}`).then(setCustomer);
  }

  useEffect(() => { load(); }, [id]);

  async function addProperty(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/properties", { method: "POST", body: { ...form, customerId: id } });
      setForm({ label: "", addressLine1: "", city: "", state: "", zip: "", accessInstructions: "" });
      setShowPropertyForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!confirm("Archive this customer? Their jobs and history stay intact but they'll be hidden from the main list.")) return;
    await api(`/customers/${id}/archive`, { method: "POST" });
    load();
  }

  async function unarchive() {
    await api(`/customers/${id}/unarchive`, { method: "POST" });
    load();
  }

  async function invitePortal() {
    try {
      await api(`/customers/${id}/portal-invite`, { method: "POST" });
      alert("Portal invite sent (check the Notification Log if email isn't configured yet).");
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!customer) return <p>Loading…</p>;

  return (
    <div>
      <Link className="link-back" to="/customers">← All customers</Link>
      <div className="page-header">
        <div>
          <h1>{customer.firstName} {customer.lastName}</h1>
          <div className="sub">{customer.phone} {customer.email ? `· ${customer.email}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn primary" to={`/jobs?newFor=${customer.id}`}>+ New Job</Link>
          <Link className="btn ghost" to={`/customers/${customer.id}/messages`}>Messages</Link>
          <Link className="btn ghost" to={`/customers/${customer.id}/documents`}>Documents</Link>
          {customer.status === "ARCHIVED" ? (
            <button className="btn ghost" onClick={unarchive}>Unarchive</button>
          ) : (
            <button className="btn danger" onClick={archive}>Archive Customer</button>
          )}
        </div>
      </div>
      {customer.status === "ARCHIVED" && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--red)" }}>
          This customer is archived. Their history is preserved but they're hidden from the default customer list.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Customer Portal</h3>
        {customer.portalEnabled ? (
          <div className="who">Portal access is active for this customer.</div>
        ) : (
          <>
            <p className="who" style={{ marginBottom: 10 }}>
              {customer.email
                ? "Send an invite so this customer can view appointments, estimates, and invoices online."
                : "Add an email address before inviting this customer to the portal."}
            </p>
            <button className="btn ghost" disabled={!customer.email} onClick={invitePortal}>Send Portal Invite</button>
          </>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Properties</h3>
          {customer.properties.map((p: any) => (
            <div key={p.id} className="job-row" style={{ display: "block" }}>
              <strong>{p.label}</strong>
              <div className="who">{p.addressLine1}, {p.city}, {p.state} {p.zip}</div>
              {p.accessInstructions && <div className="who">Access: {p.accessInstructions}</div>}
            </div>
          ))}
          {!showPropertyForm && (
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setShowPropertyForm(true)}>
              + Add Property
            </button>
          )}
          {showPropertyForm && (
            <form onSubmit={addProperty} style={{ marginTop: 12 }}>
              <div className="field">
                <label>Label (e.g. Main House, Rental)</label>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
              </div>
              <div className="field">
                <label>Address</label>
                <input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} required />
              </div>
              <div className="grid cols-3">
                <div className="field">
                  <label>City</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
                </div>
                <div className="field">
                  <label>State</label>
                  <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required />
                </div>
                <div className="field">
                  <label>ZIP</label>
                  <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} required />
                </div>
              </div>
              <div className="field">
                <label>Access instructions / gate code</label>
                <input value={form.accessInstructions} onChange={(e) => setForm({ ...form, accessInstructions: e.target.value })} />
              </div>
              <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Property"}</button>
            </form>
          )}
        </div>

        <div className="card">
          <h3>Service History</h3>
          {customer.jobs.length === 0 && <div className="empty-note">No jobs yet for this customer.</div>}
          {customer.jobs.map((job: any) => (
            <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div>{job.title}</div>
                  <div className="who">
                    {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : "Not yet scheduled"} · {job.property?.label}
                  </div>
                </div>
                <StatusBadge status={job.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
