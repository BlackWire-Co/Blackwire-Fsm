import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, uploadFile } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import SignaturePad from "../components/SignaturePad";
import { useAuth } from "../context/AuthContext";

const TECH_ACTIONS: { label: string; status: string }[] = [
  { label: "En Route", status: "EN_ROUTE" },
  { label: "Arrived", status: "ON_SITE" },
  { label: "Start Work", status: "IN_PROGRESS" },
  { label: "Awaiting Parts", status: "AWAITING_PARTS" },
  { label: "Complete Job", status: "COMPLETED" },
];

const ALL_STATUSES = [
  "NEW", "NEEDS_SCHEDULING", "SCHEDULED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS",
  "AWAITING_PARTS", "COMPLETED", "CANCELLED", "INVOICED", "PAID",
];

export default function JobDetail() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [updating, setUpdating] = useState(false);
  const [materialForm, setMaterialForm] = useState({ name: "", quantity: "1", cost: "0", salePrice: "0" });
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [priceBook, setPriceBook] = useState<any[]>([]);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [savingRecurrence, setSavingRecurrence] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api(`/jobs/${id}`).then(setJob);
    api(`/jobs/${id}/photos`).then(setPhotos).catch(() => setPhotos([]));
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => { api("/pricebook?pageSize=500").then((res: any) => setPriceBook(res.items)).catch(() => setPriceBook([])); }, []);

  async function setStatus(status: string) {
    setUpdating(true);
    try {
      await api(`/jobs/${id}/status`, { method: "POST", body: { status } });
      load();
    } finally {
      setUpdating(false);
    }
  }

  async function addMaterial(e: FormEvent) {
    e.preventDefault();
    setSavingMaterial(true);
    try {
      await api(`/jobs/${id}/materials`, {
        method: "POST",
        body: {
          name: materialForm.name,
          quantity: Number(materialForm.quantity),
          cost: Number(materialForm.cost),
          salePrice: Number(materialForm.salePrice),
        },
      });
      setMaterialForm({ name: "", quantity: "1", cost: "0", salePrice: "0" });
      load();
    } finally {
      setSavingMaterial(false);
    }
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await uploadFile(`/jobs/${id}/photos`, file, { category: "general" });
      load();
    } catch (err: any) {
      alert(err.message || "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const openTimer = job?.timeEntries?.find((t: any) => !t.endedAt && t.userId === user?.id);

  async function startTimer() {
    await api(`/jobs/${id}/time-entries/start`, { method: "POST" });
    load();
  }

  async function stopTimer() {
    if (!openTimer) return;
    await api(`/jobs/${id}/time-entries/${openTimer.id}/stop`, { method: "POST" });
    load();
  }

  async function setRecurrence(interval: string) {
    setSavingRecurrence(true);
    try {
      await api(`/jobs/${id}`, { method: "PATCH", body: { recurrenceInterval: interval } });
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingRecurrence(false);
    }
  }

  async function saveSignature(dataUrl: string) {
    const signerName = job.customer ? `${job.customer.firstName} ${job.customer.lastName}` : "Customer";
    await api(`/jobs/${id}/signatures`, {
      method: "POST",
      body: { type: "WORK_COMPLETION", signerName, imageData: dataUrl },
    });
    setShowSignature(false);
    load();
  }

  async function sendNotification(templateKey: string, label: string) {
    setSendingReminder(true);
    try {
      await api(`/jobs/${id}/notify`, { method: "POST", body: { templateKey } });
      alert(`${label} sent (check the Notification Log if email/SMS isn't configured yet).`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSendingReminder(false);
    }
  }

  if (!job) return <p>Loading…</p>;

  const property = job.property;
  const mapsUrl = property
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`
      )}`
    : undefined;

  return (
    <div>
      <Link className="link-back" to="/jobs">← All jobs</Link>
      <div className="page-header">
        <div>
          <h1>{job.title}</h1>
          <div className="sub jobnum">{job.jobNumber}</div>
        </div>
        {hasRole("ADMIN", "OFFICE") ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={job.status}
              disabled={updating}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: 180 }}
            >
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        ) : (
          <StatusBadge status={job.status} />
        )}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Customer &amp; Property</h3>
          <p>
            <Link to={`/customers/${job.customer.id}`}><strong>{job.customer.firstName} {job.customer.lastName}</strong></Link><br />
            {job.customer.phone}
          </p>
          {property && (
            <p>
              {property.addressLine1}, {property.city}, {property.state} {property.zip}<br />
              {property.accessInstructions && <em>Access: {property.accessInstructions}</em>}
            </p>
          )}
          {mapsUrl && (
            <a className="btn ghost" href={mapsUrl} target="_blank" rel="noreferrer">Navigate</a>
          )}
        </div>

        <div className="card">
          <h3>Job Details</h3>
          <p>{job.description || "No description provided."}</p>
          <p className="who">
            Scheduled: {job.scheduledDate ? new Date(job.scheduledDate).toLocaleString() : "Not yet scheduled"}
          </p>
          <p className="who">
            Technician(s): {job.technicians?.map((t: any) => `${t.user.firstName} ${t.user.lastName}`).join(", ") || "Unassigned"}
          </p>
          {hasRole("ADMIN", "OFFICE") && job.scheduledDate && (
            <div className="field" style={{ maxWidth: 220, marginTop: 10 }}>
              <label>Repeats</label>
              <select value={job.recurrenceInterval} disabled={savingRecurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="NONE">Does not repeat</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every 2 weeks</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="SEMI_ANNUALLY">Every 6 months</option>
                <option value="ANNUALLY">Annually</option>
              </select>
              {job.recurrenceInterval !== "NONE" && job.nextRecurrenceDate && (
                <div className="who" style={{ marginTop: 4 }}>Next occurrence generates around {new Date(job.nextRecurrenceDate).toLocaleDateString()}</div>
              )}
            </div>
          )}
          {hasRole("ADMIN", "OFFICE") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {job.scheduledDate && (
                <>
                  <button className="btn ghost" disabled={sendingReminder} onClick={() => sendNotification("APPOINTMENT_CONFIRMATION", "Confirmation")}>
                    Email Confirmation
                  </button>
                  <button className="btn ghost" disabled={sendingReminder} onClick={() => sendNotification("APPOINTMENT_REMINDER", "Reminder")}>
                    Email Reminder
                  </button>
                </>
              )}
              <button className="btn ghost" disabled={sendingReminder} onClick={() => sendNotification("TECHNICIAN_EN_ROUTE", "En route notice")}>
                Email "On My Way"
              </button>
              <button className="btn ghost" disabled={sendingReminder} onClick={() => sendNotification("JOB_COMPLETION", "Completion notice")}>
                Email Completion
              </button>
            </div>
          )}
        </div>
      </div>

      {hasRole("ADMIN", "OFFICE") && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Estimates &amp; Invoices</h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ minWidth: 200 }}>
              <div className="who" style={{ marginBottom: 6 }}>ESTIMATES</div>
              {job.estimates?.length === 0 && <div className="empty-note">None yet.</div>}
              {job.estimates?.map((est: any) => (
                <Link key={est.id} to={`/estimates/${est.id}`} style={{ display: "block", marginBottom: 6 }}>
                  <span className="jobnum">{est.estimateNumber}</span> <StatusBadge status={est.status} />
                </Link>
              ))}
              <Link className="btn ghost" style={{ marginTop: 4 }} to={`/estimates?newFor=${job.customer.id}&jobId=${job.id}`}>+ New Estimate</Link>
            </div>
            <div style={{ minWidth: 200 }}>
              <div className="who" style={{ marginBottom: 6 }}>INVOICES</div>
              {job.invoices?.length === 0 && <div className="empty-note">None yet.</div>}
              {job.invoices?.map((inv: any) => (
                <Link key={inv.id} to={`/invoices/${inv.id}`} style={{ display: "block", marginBottom: 6 }}>
                  <span className="jobnum">{inv.invoiceNumber}</span> <StatusBadge status={inv.status} />
                </Link>
              ))}
              <Link className="btn primary" style={{ marginTop: 4 }} to={`/invoices?fromJob=${job.id}`}>+ New Invoice from Job</Link>
            </div>
          </div>
        </div>
      )}

      {hasRole("TECHNICIAN") && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Update Status</h3>
          <div className="tech-actions">
            {TECH_ACTIONS.map((a) => (
              <button key={a.status} className="btn primary" disabled={updating} onClick={() => setStatus(a.status)}>
                {a.label}
              </button>
            ))}
            <label className="btn ghost" style={{ justifyContent: "center", padding: "16px 10px" }}>
              {uploadingPhoto ? "Uploading…" : "Add Photo"}
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onPhotoSelected} style={{ display: "none" }} disabled={uploadingPhoto} />
            </label>
            {!openTimer ? (
              <button className="btn ghost" style={{ justifyContent: "center", padding: "16px 10px" }} onClick={startTimer}>
                Start Timer
              </button>
            ) : (
              <button className="btn danger" style={{ justifyContent: "center", padding: "16px 10px" }} onClick={stopTimer}>
                Stop Timer
              </button>
            )}
            <button className="btn ghost" style={{ justifyContent: "center", padding: "16px 10px" }} onClick={() => setShowSignature((s) => !s)}>
              Customer Signature
            </button>
          </div>
        </div>
      )}

      {showSignature && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Capture Signature</h3>
          <SignaturePad onSave={saveSignature} />
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Materials</h3>
          {job.materials?.length === 0 && <div className="empty-note">No materials logged yet.</div>}
          {job.materials?.map((m: any) => (
            <div key={m.id} className="job-row">
              <div style={{ flex: 1 }}>{m.quantity} × {m.name}</div>
              <div className="who">${Number(m.salePrice).toFixed(2)}</div>
            </div>
          ))}
          <form onSubmit={addMaterial} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {priceBook.length > 0 && (
              <select
                defaultValue=""
                style={{ width: "100%" }}
                onChange={(e) => {
                  const item = priceBook.find((p) => p.id === e.target.value);
                  if (item) {
                    setMaterialForm({ name: item.name, quantity: "1", cost: String(item.cost), salePrice: String(item.salePrice) });
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Quick add from price book…</option>
                {priceBook.map((p) => <option key={p.id} value={p.id}>{p.name} — ${Number(p.salePrice).toFixed(2)}</option>)}
              </select>
            )}
            <input placeholder="Material name" value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} required style={{ flex: 2, minWidth: 140 }} />
            <input type="number" min="0" step="1" placeholder="Qty" value={materialForm.quantity} onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })} style={{ width: 70 }} />
            <input type="number" min="0" step="0.01" placeholder="Cost" value={materialForm.cost} onChange={(e) => setMaterialForm({ ...materialForm, cost: e.target.value })} style={{ width: 90 }} />
            <input type="number" min="0" step="0.01" placeholder="Sale price" value={materialForm.salePrice} onChange={(e) => setMaterialForm({ ...materialForm, salePrice: e.target.value })} style={{ width: 100 }} />
            <button className="btn primary" type="submit" disabled={savingMaterial}>Add</button>
          </form>
        </div>

        <div className="card">
          <h3>Time Logged</h3>
          {job.timeEntries?.length === 0 && <div className="empty-note">No time entries yet.</div>}
          {job.timeEntries?.map((t: any) => (
            <div key={t.id} className="job-row">
              <div style={{ flex: 1 }}>{t.user.firstName} {t.user.lastName}</div>
              <div className="who">
                {new Date(t.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                {" – "}
                {t.endedAt ? new Date(t.endedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "in progress"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Photos</h3>
        {photos.length === 0 && <div className="empty-note">No photos uploaded yet.</div>}
        <div className="photo-grid">
          {photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
              <img src={p.url} alt={p.category} />
            </a>
          ))}
        </div>
      </div>

      {job.signatures?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Signatures</h3>
          {job.signatures.map((s: any) => (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <img src={s.imageData} alt={`Signature by ${s.signerName}`} style={{ background: "#fff", borderRadius: 6, maxWidth: 300 }} />
              <div className="who">{s.signerName} · {s.type.replace(/_/g, " ")} · {new Date(s.signedAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Status History</h3>
        {job.statusHistory?.map((h: any) => (
          <div key={h.id} className="job-row">
            <StatusBadge status={h.status} />
            <span className="who">{new Date(h.changedAt).toLocaleString()}</span>
            {h.note && <span className="who">— {h.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
