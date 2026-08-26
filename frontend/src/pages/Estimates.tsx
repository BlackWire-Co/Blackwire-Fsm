import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import LineItemEditor, { emptyLineItem, LineItemDraft } from "../components/LineItemEditor";
import Pager from "../components/Pager";

export default function Estimates() {
  const [estimates, setEstimates] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [customers, setCustomers] = useState<any[]>([]);
  const [priceBook, setPriceBook] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(Boolean(searchParams.get("newFor")));
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customerId: searchParams.get("newFor") || "",
    propertyId: "",
    jobId: searchParams.get("jobId") || "",
    taxRate: "0",
    notes: "",
    terms: "Estimate valid for 30 days.",
  });
  const [items, setItems] = useState<LineItemDraft[]>([emptyLineItem()]);

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  function load(pageNum = page) {
    api(`/estimates?page=${pageNum}&pageSize=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`).then((res: any) => {
      setEstimates(res.items);
      setTotal(res.total);
    });
  }
  useEffect(() => { setPage(1); load(1); }, [statusFilter]);
  useEffect(() => { load(page); }, [page]);
  useEffect(() => { api("/customers?pageSize=500").then((res: any) => setCustomers(res.items)); }, []);
  useEffect(() => { api("/pricebook?pageSize=500").then((res: any) => setPriceBook(res.items)).catch(() => setPriceBook([])); }, []);

  async function createEstimate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/estimates", {
        method: "POST",
        body: {
          customerId: form.customerId,
          propertyId: form.propertyId,
          jobId: form.jobId || undefined,
          taxRate: Number(form.taxRate),
          notes: form.notes,
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
          <h1>Estimates</h1>
          <div className="sub">{total} total</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT,VIEWED">Awaiting approval</option>
            <option value="APPROVED">Approved</option>
            <option value="DECLINED">Declined</option>
          </select>
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New Estimate"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createEstimate} className="card" style={{ marginBottom: 20 }}>
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
              <label>Tax rate (%)</label>
              <input type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            </div>
            <div className="field">
              <label>Terms</label>
              <input value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Notes (internal or customer-visible)</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create Estimate"}</button>
        </form>
      )}

      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>Estimate #</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {estimates.map((est) => (
            <tr key={est.id}>
              <td className="jobnum"><Link to={`/estimates/${est.id}`}>{est.estimateNumber}</Link></td>
              <td>{est.customer.firstName} {est.customer.lastName}</td>
              <td>{new Date(est.date).toLocaleDateString()}</td>
              <td>${est.totals.total.toFixed(2)}</td>
              <td><StatusBadge status={est.status} /></td>
            </tr>
          ))}
          {estimates.length === 0 && <tr><td colSpan={5} className="empty-note">No estimates match this filter.</td></tr>}
        </tbody>
      </table></div>
      <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
