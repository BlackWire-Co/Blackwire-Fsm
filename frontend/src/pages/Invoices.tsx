import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, downloadFile } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import LineItemEditor, { emptyLineItem, LineItemDraft } from "../components/LineItemEditor";
import Pager from "../components/Pager";

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [customers, setCustomers] = useState<any[]>([]);
  const [priceBook, setPriceBook] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchParams] = useSearchParams();
  const fromJob = searchParams.get("fromJob");
  const [showForm, setShowForm] = useState(Boolean(searchParams.get("newFor") || fromJob));
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ customerId: searchParams.get("newFor") || "", propertyId: "", dueDate: "", taxRate: "0", terms: "Due within 30 days." });
  const [items, setItems] = useState<LineItemDraft[]>([emptyLineItem()]);

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  function load(pageNum = page) {
    api(`/invoices?page=${pageNum}&pageSize=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`).then((res: any) => {
      setInvoices(res.items);
      setTotal(res.total);
    });
  }
  useEffect(() => { setPage(1); load(1); }, [statusFilter]);
  useEffect(() => { load(page); }, [page]);
  useEffect(() => { api("/customers?pageSize=500").then((res: any) => setCustomers(res.items)); }, []);
  useEffect(() => { api("/pricebook?pageSize=500").then((res: any) => setPriceBook(res.items)).catch(() => setPriceBook([])); }, []);

  async function exportCsv() {
    try { await downloadFile("/invoices/export.csv", "invoices.csv"); } catch (err: any) { alert(err.message); }
  }

  useEffect(() => {
    if (fromJob) {
      api(`/invoices/from-job/${fromJob}`, { method: "POST" }).then(() => {
        setShowForm(false);
        setPage(1);
        load(1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromJob]);

  async function createInvoice(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/invoices", {
        method: "POST",
        body: {
          customerId: form.customerId,
          propertyId: form.propertyId,
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          taxRate: Number(form.taxRate),
          terms: form.terms,
          items: items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            taxable: i.taxable,
          })),
        },
      });
      setShowForm(false);
      setItems([emptyLineItem()]);
      setPage(1);
      load(1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <div className="sub">{total} total</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
          </select>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New Invoice"}
          </button>
        </div>
      </div>

      {fromJob && <div className="card" style={{ marginBottom: 16 }}>Building an invoice from that job's materials and logged time…</div>}

      {showForm && !fromJob && (
        <form onSubmit={createInvoice} className="card" style={{ marginBottom: 20 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>Customer</label>
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, propertyId: "" })} required>
                <option value="">Select a customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Property</label>
              <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required disabled={!selectedCustomer}>
                <option value="">Select a property…</option>
                {selectedCustomer?.properties?.map((p: any) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Line items</label>
            <LineItemEditor items={items} onChange={setItems} priceBook={priceBook} />
          </div>

          <div className="grid cols-2">
            <div className="field">
              <label>Due date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Tax rate (%)</label>
              <input type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            </div>
          </div>

          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create Invoice"}</button>
        </form>
      )}

      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Customer</th>
            <th>Due</th>
            <th>Total</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td className="jobnum"><Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber}</Link></td>
              <td>{inv.customer.firstName} {inv.customer.lastName}</td>
              <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "-"}</td>
              <td>${inv.totals.total.toFixed(2)}</td>
              <td>${inv.totals.balance.toFixed(2)}</td>
              <td><StatusBadge status={inv.status} /></td>
            </tr>
          ))}
          {invoices.length === 0 && <tr><td colSpan={6} className="empty-note">No invoices match this filter.</td></tr>}
        </tbody>
      </table></div>
      <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
