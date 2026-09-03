import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, openPdf } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import LineItemEditor, { LineItemDraft } from "../components/LineItemEditor";
import { useAuth } from "../context/AuthContext";

export default function InvoiceDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [invoice, setInvoice] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState({ method: "CASH", amount: "", notes: "" });
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [taxRate, setTaxRate] = useState("0");
  const [priceBook, setPriceBook] = useState<any[]>([]);
  const canManage = hasRole("ADMIN", "OFFICE");

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesForm, setNotesForm] = useState({ notes: "", terms: "" });
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => { api("/pricebook?pageSize=500").then((res: any) => setPriceBook(res.items)).catch(() => setPriceBook([])); }, []);

  function load() {
    api(`/invoices/${id}`).then((inv: any) => {
      setInvoice(inv);
      setItems(inv.items.map((i: any) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), taxable: i.taxable })));
      setTaxRate(String(inv.taxRate));
    });
  }
  useEffect(() => { load(); }, [id]);

  async function send() {
    setBusy(true);
    try { await api(`/invoices/${id}/send`, { method: "POST" }); load(); } finally { setBusy(false); }
  }
  async function emailInvoice() {
    setBusy(true);
    try {
      await api(`/invoices/${id}/notify`, { method: "POST", body: { templateKey: "INVOICE_READY" } });
      alert("Email sent (check the Notification Log if email isn't configured yet).");
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }
  async function emailReceipt() {
    setBusy(true);
    try {
      await api(`/invoices/${id}/notify`, { method: "POST", body: { templateKey: "PAYMENT_RECEIPT" } });
      alert("Receipt sent (check the Notification Log if email isn't configured yet).");
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }
  async function voidInvoice() {
    if (!confirm("Void this invoice? This can't be undone.")) return;
    setBusy(true);
    try { await api(`/invoices/${id}/void`, { method: "POST" }); load(); } finally { setBusy(false); }
  }
  async function reopen() {
    setBusy(true);
    try {
      await api(`/invoices/${id}/reopen`, { method: "POST" });
      setEditing(true);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally { setBusy(false); }
  }
  async function saveItems() {
    setBusy(true);
    try {
      await api(`/invoices/${id}`, {
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

  function startEditNotes() {
    setNotesForm({ notes: invoice.notes || "", terms: invoice.terms || "" });
    setEditingNotes(true);
  }

  async function saveNotes(e: FormEvent) {
    e.preventDefault();
    setSavingNotes(true);
    try {
      await api(`/invoices/${id}/notes`, { method: "PATCH", body: notesForm });
      setEditingNotes(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function recordPayment(e: FormEvent) {
    e.preventDefault();
    if (!payment.amount) return;
    setBusy(true);
    try {
      await api(`/invoices/${id}/payments`, {
        method: "POST",
        body: { method: payment.method, amount: Number(payment.amount), notes: payment.notes || undefined },
      });
      setPayment({ method: "CASH", amount: "", notes: "" });
      load();
    } finally { setBusy(false); }
  }
  async function viewPdf() {
    try { await openPdf(`/invoices/${id}/pdf`); } catch (err: any) { alert(err.message); }
  }

  if (!invoice) return <p>Loading…</p>;

  return (
    <div>
      <Link className="link-back" to="/invoices">← All invoices</Link>
      <div className="page-header">
        <div>
          <h1>{invoice.invoiceNumber}</h1>
          <div className="sub">{invoice.customer.firstName} {invoice.customer.lastName} · {invoice.property.addressLine1}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={invoice.status} />
          <button className="btn ghost" onClick={viewPdf}>View PDF</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Line Items</h3>
          {canManage && !editing && invoice.status === "DRAFT" && (
            <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          )}
          {canManage && !editing && invoice.status === "SENT" && invoice.totals.paid === 0 && (
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
          </>
        )}
      </div>

      {invoice.status === "DRAFT" && !editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={busy} onClick={send}>Mark as Sent</button>
        </div>
      )}

      {canManage && !editing && (
        <div className="card" style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" disabled={busy} onClick={emailInvoice}>Email Invoice to Customer</button>
          {invoice.totals.paid > 0 && (
            <button className="btn ghost" disabled={busy} onClick={emailReceipt}>Email Payment Receipt</button>
          )}
        </div>
      )}

      {/* Notes/terms are free text, not part of the invoice's accounting
          math, so — unlike line items above — they stay editable no matter
          the status (sent, paid, whatever), right up until the invoice is
          voided. */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Notes &amp; Terms</h3>
          {canManage && !editingNotes && invoice.status !== "VOID" && (
            <button className="btn ghost" onClick={startEditNotes}>Edit</button>
          )}
        </div>
        {editingNotes ? (
          <form onSubmit={saveNotes}>
            <div className="field">
              <label>Notes (visible to customer on the PDF)</label>
              <textarea rows={3} value={notesForm.notes} onChange={(e) => setNotesForm({ ...notesForm, notes: e.target.value })} />
            </div>
            <div className="field">
              <label>Terms</label>
              <textarea rows={3} value={notesForm.terms} onChange={(e) => setNotesForm({ ...notesForm, terms: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" type="submit" disabled={savingNotes}>{savingNotes ? "Saving…" : "Save"}</button>
              <button className="btn ghost" type="button" onClick={() => setEditingNotes(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <p className="who" style={{ marginBottom: invoice.terms ? 10 : 0 }}>{invoice.notes || "No notes."}</p>
            {invoice.terms && <p className="who">Terms: {invoice.terms}</p>}
          </>
        )}
      </div>

      {!["VOID", "PAID"].includes(invoice.status) && !editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Record a Payment</h3>
          <form onSubmit={recordPayment} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} style={{ width: 120 }}>
              <option value="CASH">Cash</option>
              <option value="CHECK">Check</option>
              <option value="CARD">Card</option>
              <option value="ACH">ACH</option>
              <option value="OTHER">Other</option>
            </select>
            <input type="number" min="0.01" step="0.01" placeholder="Amount" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} style={{ width: 110 }} required />
            <input placeholder="Notes (optional)" value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
            <button className="btn primary" type="submit" disabled={busy}>Record Payment</button>
          </form>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Payment History</h3>
        {invoice.payments.length === 0 && <div className="empty-note">No payments recorded yet.</div>}
        {invoice.payments.map((p: any) => (
          <div key={p.id} className="job-row">
            <div style={{ flex: 1 }}>{p.method} {p.notes ? `— ${p.notes}` : ""}</div>
            <div className="who">{new Date(p.paidAt).toLocaleDateString()}</div>
            <strong>${Number(p.amount).toFixed(2)}</strong>
          </div>
        ))}
      </div>

      {invoice.status !== "VOID" && invoice.status !== "PAID" && !editing && (
        <div style={{ marginTop: 16 }}>
          <button className="btn danger" disabled={busy} onClick={voidInvoice}>Void Invoice</button>
        </div>
      )}
    </div>
  );
}
