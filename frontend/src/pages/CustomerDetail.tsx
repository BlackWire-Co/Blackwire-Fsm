import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

const PHONE_LABELS = ["Mobile", "Home", "Work", "Office", "Fax", "Other"];
const EMAIL_LABELS = ["Primary", "Billing", "Work", "Other"];

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<any>(null);

  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState<any>(null);
  const [savingInfo, setSavingInfo] = useState(false);

  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ label: "Mobile", number: "" });
  const [savingPhone, setSavingPhone] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailForm, setEmailForm] = useState({ label: "Primary", address: "" });
  const [savingEmail, setSavingEmail] = useState(false);

  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [form, setForm] = useState({ label: "", addressLine1: "", city: "", state: "", zip: "", accessInstructions: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api(`/customers/${id}`).then(setCustomer);
  }

  useEffect(() => { load(); }, [id]);

  // --- Basic info (name, company, preferred contact, notes, billing address) ---

  function startEditInfo() {
    setInfoForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      companyName: customer.companyName || "",
      preferredContactMethod: customer.preferredContactMethod || "PHONE",
      notes: customer.notes || "",
      billingAddressLine1: customer.billingAddressLine1 || "",
      billingAddressLine2: customer.billingAddressLine2 || "",
      billingCity: customer.billingCity || "",
      billingState: customer.billingState || "",
      billingZip: customer.billingZip || "",
    });
    setEditingInfo(true);
  }

  async function saveInfo(e: FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    try {
      await api(`/customers/${id}`, { method: "PATCH", body: infoForm });
      setEditingInfo(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingInfo(false);
    }
  }

  // --- Phone numbers ---

  async function addPhone(e: FormEvent) {
    e.preventDefault();
    if (!phoneForm.number.trim()) return;
    setSavingPhone(true);
    try {
      await api(`/customers/${id}/phones`, { method: "POST", body: phoneForm });
      setPhoneForm({ label: "Mobile", number: "" });
      setShowPhoneForm(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingPhone(false);
    }
  }

  async function makePhonePrimary(phoneId: string) {
    await api(`/customers/${id}/phones/${phoneId}`, { method: "PATCH", body: { isPrimary: true } });
    load();
  }

  async function deletePhone(phoneId: string) {
    if (!confirm("Remove this phone number?")) return;
    await api(`/customers/${id}/phones/${phoneId}`, { method: "DELETE" });
    load();
  }

  // --- Emails ---

  async function addEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailForm.address.trim()) return;
    setSavingEmail(true);
    try {
      await api(`/customers/${id}/emails`, { method: "POST", body: emailForm });
      setEmailForm({ label: "Primary", address: "" });
      setShowEmailForm(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function makeEmailPrimary(emailId: string) {
    await api(`/customers/${id}/emails/${emailId}`, { method: "PATCH", body: { isPrimary: true } });
    load();
  }

  async function deleteEmail(emailId: string) {
    if (!confirm("Remove this email address?")) return;
    await api(`/customers/${id}/emails/${emailId}`, { method: "DELETE" });
    load();
  }

  // --- Properties ---

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

  const primaryPhone = customer.phones?.find((p: any) => p.isPrimary);
  const primaryEmail = customer.emails?.find((e: any) => e.isPrimary);

  return (
    <div>
      <Link className="link-back" to="/customers">← All customers</Link>
      <div className="page-header">
        <div>
          <h1>{customer.firstName} {customer.lastName}</h1>
          <div className="sub">
            {primaryPhone?.number || "No phone"} {primaryEmail ? `· ${primaryEmail.address}` : ""}
            {customer.companyName ? ` · ${customer.companyName}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={startEditInfo}>Edit Customer</button>
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
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--yellow)" }}>
          This customer is archived. Their history is preserved but they're hidden from the default customer list.
        </div>
      )}

      {editingInfo && infoForm && (
        <form onSubmit={saveInfo} className="card" style={{ marginBottom: 16 }}>
          <h3>Edit Customer</h3>
          <div className="grid cols-2">
            <div className="field">
              <label>First name</label>
              <input value={infoForm.firstName} onChange={(e) => setInfoForm({ ...infoForm, firstName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={infoForm.lastName} onChange={(e) => setInfoForm({ ...infoForm, lastName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Company (optional)</label>
              <input value={infoForm.companyName} onChange={(e) => setInfoForm({ ...infoForm, companyName: e.target.value })} />
            </div>
            <div className="field">
              <label>Preferred contact method</label>
              <select value={infoForm.preferredContactMethod} onChange={(e) => setInfoForm({ ...infoForm, preferredContactMethod: e.target.value })}>
                <option value="PHONE">Phone</option>
                <option value="EMAIL">Email</option>
                <option value="TEXT">Text</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea rows={3} value={infoForm.notes} onChange={(e) => setInfoForm({ ...infoForm, notes: e.target.value })} />
          </div>
          <div className="field">
            <label>Billing address</label>
            <input placeholder="Address line 1" value={infoForm.billingAddressLine1} onChange={(e) => setInfoForm({ ...infoForm, billingAddressLine1: e.target.value })} style={{ marginBottom: 8 }} />
            <input placeholder="Address line 2 (optional)" value={infoForm.billingAddressLine2} onChange={(e) => setInfoForm({ ...infoForm, billingAddressLine2: e.target.value })} />
          </div>
          <div className="grid cols-3">
            <div className="field">
              <label>City</label>
              <input value={infoForm.billingCity} onChange={(e) => setInfoForm({ ...infoForm, billingCity: e.target.value })} />
            </div>
            <div className="field">
              <label>State</label>
              <input value={infoForm.billingState} onChange={(e) => setInfoForm({ ...infoForm, billingState: e.target.value })} />
            </div>
            <div className="field">
              <label>ZIP</label>
              <input value={infoForm.billingZip} onChange={(e) => setInfoForm({ ...infoForm, billingZip: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" type="submit" disabled={savingInfo}>{savingInfo ? "Saving…" : "Save Changes"}</button>
            <button className="btn ghost" type="button" onClick={() => setEditingInfo(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Contact Info</h3>
        <div className="grid cols-2">
          <div>
            <div className="who" style={{ marginBottom: 8, fontWeight: 600, textTransform: "uppercase", fontSize: 11.5 }}>Phone numbers</div>
            {(!customer.phones || customer.phones.length === 0) && <div className="empty-note">No phone numbers on file.</div>}
            {customer.phones?.map((p: any) => (
              <div key={p.id} className="job-row">
                <div style={{ flex: 1 }}>
                  <strong>{p.number}</strong>
                  <div className="who">{p.label}{p.isPrimary ? " · Primary" : ""}</div>
                </div>
                {!p.isPrimary && <button className="btn ghost" onClick={() => makePhonePrimary(p.id)}>Make Primary</button>}
                <button className="btn danger" onClick={() => deletePhone(p.id)}>Remove</button>
              </div>
            ))}
            {!showPhoneForm && (
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setShowPhoneForm(true)}>+ Add Phone</button>
            )}
            {showPhoneForm && (
              <form onSubmit={addPhone} style={{ marginTop: 12 }}>
                <div className="grid cols-2">
                  <div className="field">
                    <label>Label</label>
                    <select value={phoneForm.label} onChange={(e) => setPhoneForm({ ...phoneForm, label: e.target.value })}>
                      {PHONE_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Number</label>
                    <input value={phoneForm.number} onChange={(e) => setPhoneForm({ ...phoneForm, number: e.target.value })} required autoFocus />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" type="submit" disabled={savingPhone}>{savingPhone ? "Saving…" : "Save Phone"}</button>
                  <button className="btn ghost" type="button" onClick={() => setShowPhoneForm(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>

          <div>
            <div className="who" style={{ marginBottom: 8, fontWeight: 600, textTransform: "uppercase", fontSize: 11.5 }}>Email addresses</div>
            {(!customer.emails || customer.emails.length === 0) && <div className="empty-note">No email addresses on file.</div>}
            {customer.emails?.map((em: any) => (
              <div key={em.id} className="job-row">
                <div style={{ flex: 1 }}>
                  <strong>{em.address}</strong>
                  <div className="who">{em.label}{em.isPrimary ? " · Primary" : ""}</div>
                </div>
                {!em.isPrimary && <button className="btn ghost" onClick={() => makeEmailPrimary(em.id)}>Make Primary</button>}
                <button className="btn danger" onClick={() => deleteEmail(em.id)}>Remove</button>
              </div>
            ))}
            {!showEmailForm && (
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setShowEmailForm(true)}>+ Add Email</button>
            )}
            {showEmailForm && (
              <form onSubmit={addEmail} style={{ marginTop: 12 }}>
                <div className="grid cols-2">
                  <div className="field">
                    <label>Label</label>
                    <select value={emailForm.label} onChange={(e) => setEmailForm({ ...emailForm, label: e.target.value })}>
                      {EMAIL_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Address</label>
                    <input type="email" value={emailForm.address} onChange={(e) => setEmailForm({ ...emailForm, address: e.target.value })} required autoFocus />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" type="submit" disabled={savingEmail}>{savingEmail ? "Saving…" : "Save Email"}</button>
                  <button className="btn ghost" type="button" onClick={() => setShowEmailForm(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

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
