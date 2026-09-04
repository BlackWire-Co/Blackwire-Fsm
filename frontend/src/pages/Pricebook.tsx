import { FormEvent, useEffect, useState } from "react";
import { api, downloadFile, uploadCsv } from "../api/client";
import Pager from "../components/Pager";

export default function Pricebook() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", description: "", cost: "0", salePrice: "0", taxable: true });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  function load(pageNum = page) {
    api(`/pricebook?includeInactive=true&page=${pageNum}&pageSize=${pageSize}`).then((res: any) => {
      setItems(res.items);
      setTotal(res.total);
    });
  }
  useEffect(() => { load(page); }, [page]);

  async function createItem(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/pricebook", {
        method: "POST",
        body: { ...form, cost: Number(form.cost), salePrice: Number(form.salePrice) },
      });
      setForm({ name: "", sku: "", description: "", cost: "0", salePrice: "0", taxable: true });
      setShowForm(false);
      setPage(1);
      load(1);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: any) {
    await api(`/pricebook/${item.id}`, { method: "PATCH", body: { active: !item.active } });
    load();
  }

  async function exportCsv() {
    try { await downloadFile("/pricebook/export.csv", "price-book.csv"); } catch (err: any) { alert(err.message); }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await uploadCsv<{ created: number; errors: string[] }>("/pricebook/import", file);
      alert(`Imported ${result.created} item(s).${result.errors.length ? `\n\n${result.errors.length} row(s) had issues:\n${result.errors.slice(0, 10).join("\n")}` : ""}`);
      setPage(1);
      load(1);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Price Book</h1>
          <div className="sub">Reusable catalog of materials and services for jobs, estimates, and invoices</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New Item"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
        <label className="btn ghost">
          {importing ? "Importing…" : "Import CSV"}
          <input type="file" accept=".csv" onChange={onImportFile} style={{ display: "none" }} disabled={importing} />
        </label>
      </div>

      {showForm && (
        <form onSubmit={createItem} className="card" style={{ marginBottom: 20 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>SKU (optional)</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="field">
              <label>Cost</label>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div className="field">
              <label>Sale price</label>
              <input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} required />
            </div>
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 13.5 }}>
            <input type="checkbox" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} style={{ width: "auto" }} />
            Taxable by default
          </label>
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Item"}</button>
        </form>
      )}

      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Cost</th>
            <th>Sale Price</th>
            <th>Taxable</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}{item.description && <div className="who">{item.description}</div>}</td>
              <td>{item.sku || "-"}</td>
              <td>${Number(item.cost).toFixed(2)}</td>
              <td>${Number(item.salePrice).toFixed(2)}</td>
              <td>{item.taxable ? "Yes" : "No"}</td>
              <td>{item.active ? "Active" : "Inactive"}</td>
              <td>
                <button className={item.active ? "btn danger" : "btn ghost"} onClick={() => toggleActive(item)}>
                  {item.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7} className="empty-note">No price book items yet.</td></tr>}
        </tbody>
      </table></div>
      <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
