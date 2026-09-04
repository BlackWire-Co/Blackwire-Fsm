import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadFile, uploadCsv } from "../api/client";
import Pager from "../components/Pager";

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load(query = q, pageNum = page) {
    api(`/customers?page=${pageNum}&pageSize=${pageSize}${query ? `&q=${encodeURIComponent(query)}` : ""}`).then((res: any) => {
      setCustomers(res.items);
      setTotal(res.total);
    });
  }

  useEffect(() => { load(q, page); }, [page]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(q, 1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function createCustomer(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/customers", { method: "POST", body: form });
      setForm({ firstName: "", lastName: "", phone: "", email: "" });
      setShowForm(false);
      load(q, 1);
      setPage(1);
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    try {
      await downloadFile("/customers/export.csv", "customers.csv");
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await uploadCsv<{ created: number; errors: string[] }>("/customers/import", file);
      alert(`Imported ${result.created} customer(s).${result.errors.length ? `\n\n${result.errors.length} row(s) had issues:\n${result.errors.slice(0, 10).join("\n")}` : ""}`);
      load(q, 1);
      setPage(1);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <div className="sub">{total} total</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          <label className="btn ghost">
            {importing ? "Importing…" : "Import CSV"}
            <input ref={fileInputRef} type="file" accept=".csv" onChange={onImportFile} style={{ display: "none" }} disabled={importing} />
          </label>
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New Customer"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createCustomer} className="card" style={{ marginBottom: 20 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Customer"}</button>
        </form>
      )}

      <input
        className="search-input"
        placeholder="Search by name, phone, email, or address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 14, maxWidth: 380 }}
      />

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Properties</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/customers/${c.id}`}>{c.firstName} {c.lastName}</Link>
                  {c.companyName && <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.companyName}</div>}
                </td>
                <td>{c.phone || "-"}</td>
                <td>{c.email || "-"}</td>
                <td>{c.properties?.map((p: any) => p.label).join(", ") || "-"}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={4} className="empty-note">No customers match that search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
