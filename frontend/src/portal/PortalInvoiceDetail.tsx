import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { portalApi, openPortalPdf } from "./api";
import StatusBadge from "../components/StatusBadge";

export default function PortalInvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    portalApi(`/invoices/${id}`).then(setInvoice);
  }
  useEffect(() => { load(); }, [id]);

  async function pay() {
    setBusy(true);
    try {
      const res = await portalApi<{ redirectUrl: string | null; message?: string }>(`/invoices/${id}/pay`, { method: "POST" });
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        alert(res.message || "We've let the office know.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }

  async function viewPdf() {
    try { await openPortalPdf(`/invoices/${id}/pdf`); } catch (err: any) { alert(err.message); }
  }

  if (!invoice) return <p>Loading…</p>;

  return (
    <div>
      <Link className="link-back" to="/portal/invoices">← All invoices</Link>
      <div className="page-header">
        <div>
          <h1>{invoice.invoiceNumber}</h1>
          <div className="sub">{invoice.property.addressLine1}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={invoice.status} />
          <button className="btn ghost" onClick={viewPdf}>View PDF</button>
        </div>
      </div>

      <div className="card">
        <h3>Line Items</h3>
        <div className="table-scroll"><table className="data">
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            {invoice.items.map((item: any) => (
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
          <div className="who">Subtotal: ${invoice.totals.subtotal.toFixed(2)}</div>
          {invoice.totals.tax > 0 && <div className="who">Tax: ${invoice.totals.tax.toFixed(2)}</div>}
          <div className="who">Paid: ${invoice.totals.paid.toFixed(2)}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>Balance Due: ${invoice.totals.balance.toFixed(2)}</div>
        </div>
      </div>

      {invoice.totals.balance > 0 && invoice.status !== "VOID" && (
        <div className="card" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={busy} onClick={pay}>Pay ${invoice.totals.balance.toFixed(2)}</button>
        </div>
      )}

      {invoice.payments.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Payment History</h3>
          {invoice.payments.map((p: any) => (
            <div key={p.id} className="job-row">
              <div style={{ flex: 1 }}>{p.method}</div>
              <div className="who">{new Date(p.paidAt).toLocaleDateString()}</div>
              <strong>${Number(p.amount).toFixed(2)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
