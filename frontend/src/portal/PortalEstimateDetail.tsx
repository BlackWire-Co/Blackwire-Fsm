import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { portalApi, openPortalPdf } from "./api";
import { usePortalAuth } from "./PortalAuthContext";
import StatusBadge from "../components/StatusBadge";

export default function PortalEstimateDetail() {
  const { id } = useParams();
  const { customer } = usePortalAuth();
  const [estimate, setEstimate] = useState<any>(null);
  const [signerName, setSignerName] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    portalApi(`/estimates/${id}`).then((est: any) => {
      setEstimate(est);
      if (customer) setSignerName(`${customer.firstName} ${customer.lastName}`);
    });
  }
  useEffect(() => { load(); }, [id]);

  async function approve() {
    if (!signerName.trim()) return;
    setBusy(true);
    try {
      await portalApi(`/estimates/${id}/approve`, { method: "POST", body: { signerName } });
      load();
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }

  async function decline() {
    if (!confirm("Decline this estimate?")) return;
    setBusy(true);
    try {
      await portalApi(`/estimates/${id}/decline`, { method: "POST" });
      load();
    } finally { setBusy(false); }
  }

  async function viewPdf() {
    try { await openPortalPdf(`/estimates/${id}/pdf`); } catch (err: any) { alert(err.message); }
  }

  if (!estimate) return <p>Loading…</p>;

  return (
    <div>
      <Link className="link-back" to="/portal/estimates">← All estimates</Link>
      <div className="page-header">
        <div>
          <h1>{estimate.estimateNumber}</h1>
          <div className="sub">{estimate.property.addressLine1}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={estimate.status} />
          <button className="btn ghost" onClick={viewPdf}>View PDF</button>
        </div>
      </div>

      <div className="card">
        <h3>Line Items</h3>
        <div className="table-scroll"><table className="data">
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            {estimate.items.map((item: any) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>${Number(item.unitPrice).toFixed(2)}</td>
                <td>${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div style={{ textAlign: "right", marginTop: 10 }}>
          <div className="who">Subtotal: ${estimate.totals.subtotal.toFixed(2)}</div>
          {estimate.totals.tax > 0 && <div className="who">Tax: ${estimate.totals.tax.toFixed(2)}</div>}
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>Total: ${estimate.totals.total.toFixed(2)}</div>
        </div>
      </div>

      {["SENT", "VIEWED"].includes(estimate.status) && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Approve or Decline</h3>
          <p className="who" style={{ marginBottom: 10 }}>
            Typing your name below and clicking Approve counts as your electronic signature approving this estimate.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Your full name" style={{ maxWidth: 240 }} />
            <button className="btn primary" disabled={busy || !signerName.trim()} onClick={approve}>Approve</button>
            <button className="btn danger" disabled={busy} onClick={decline}>Decline</button>
          </div>
        </div>
      )}

      {estimate.status === "APPROVED" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="who">You approved this on {new Date(estimate.approvedAt).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
