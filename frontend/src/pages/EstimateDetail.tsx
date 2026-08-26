import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, openPdf } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import LineItemEditor, { LineItemDraft } from "../components/LineItemEditor";
import { useAuth } from "../context/AuthContext";

export default function EstimateDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [estimate, setEstimate] = useState<any>(null);
  const [approverName, setApproverName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [taxRate, setTaxRate] = useState("0");
  const [priceBook, setPriceBook] = useState<any[]>([]);
  const canManage = hasRole("ADMIN", "OFFICE");

  useEffect(() => { api("/pricebook?pageSize=500").then((res: any) => setPriceBook(res.items)).catch(() => setPriceBook([])); }, []);

  function load() {
    api(`/estimates/${id}`).then((est: any) => {
      setEstimate(est);
      setItems(est.items.map((i: any) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), taxable: i.taxable })));
      setTaxRate(String(est.taxRate));
    });
  }
  useEffect(() => { load(); }, [id]);

  async function send() {
    setBusy(true);
    try { await api(`/estimates/${id}/send`, { method: "POST" }); load(); } finally { setBusy(false); }
  }
  async function emailCustomer() {
    setBusy(true);
    try {
      await api(`/estimates/${id}/notify`, { method: "POST" });
      alert("Email sent (check the Notification Log if email isn't configured yet).");
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }
  async function approve() {
    if (!approverName.trim()) return;
    setBusy(true);
    try {
      await api(`/estimates/${id}/approve`, { method: "POST", body: { approvedByName: approverName } });
      load();
    } finally { setBusy(false); }
  }
  async function decline() {
    setBusy(true);
    try { await api(`/estimates/${id}/decline`, { method: "POST" }); load(); } finally { setBusy(false); }
  }
  async function reopen() {
    setBusy(true);
    try {
      await api(`/estimates/${id}/reopen`, { method: "POST" });
      setEditing(true);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }
  async function saveItems() {
    setBusy(true);
    try {
      await api(`/estimates/${id}`, {
        method: "PATCH",
        body: {
          taxRate: Number(taxRate),
          items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), taxable: i.taxable })),
        },
      });
      setEditing(false);
      load();
    } finally { setBusy(false); }
  }
  async function viewPdf() {
    try { await openPdf(`/estimates/${id}/pdf`); } catch (err: any) { alert(err.message); }
  }

  if (!estimate) return <p>Loading…</p>;

  return (
    <div>
      <Link className="link-back" to="/estimates">← All estimates</Link>
      <div className="page-header">
        <div>
          <h1>{estimate.estimateNumber}</h1>
          <div className="sub">{estimate.customer.firstName} {estimate.customer.lastName} · {estimate.property.addressLine1}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={estimate.status} />
          <button className="btn ghost" onClick={viewPdf}>View PDF</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Line Items</h3>
          {canManage && !editing && estimate.status === "DRAFT" && (
            <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          )}
          {canManage && !editing && ["SENT", "VIEWED", "DECLINED"].includes(estimate.status) && (
            <button className="btn ghost" disabled={busy} onClick={reopen}>Reopen for Editing</button>
          )}
        </div>

        {editing ? (
          <div>
            <LineItemEditor items={items} onChange={setItems} priceBook={priceBook} />
            <div className="field" style={{ maxWidth: 160, marginTop: 12 }}>
              <label>Tax rate (%)</label>
              <input type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" disabled={busy} onClick={saveItems}>Save Changes</button>
              <button className="btn ghost" onClick={() => { setEditing(false); load(); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {estimate.status === "DRAFT" && !editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={busy} onClick={send}>Mark as Sent</button>
        </div>
      )}

      {canManage && !editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <button className="btn ghost" disabled={busy} onClick={emailCustomer}>Email Estimate to Customer</button>
        </div>
      )}

      {["SENT", "VIEWED"].includes(estimate.status) && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Record Approval or Decline</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="Approved by (customer name)" value={approverName} onChange={(e) => setApproverName(e.target.value)} style={{ maxWidth: 240 }} />
            <button className="btn primary" disabled={busy || !approverName.trim()} onClick={approve}>Approve</button>
            <button className="btn danger" disabled={busy} onClick={decline}>Decline</button>
          </div>
        </div>
      )}

      {estimate.status === "APPROVED" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="who">Approved by {estimate.approvedByName} on {new Date(estimate.approvedAt).toLocaleString()}</div>
        </div>
      )}

      {estimate.jobId && (
        <div className="card" style={{ marginTop: 16 }}>
          <Link className="btn primary" to={`/invoices?fromJob=${estimate.jobId}`}>+ Create Invoice from Job</Link>
        </div>
      )}
    </div>
  );
}
