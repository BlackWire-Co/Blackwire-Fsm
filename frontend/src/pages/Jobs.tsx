import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, downloadFile, uploadCsv } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import Pager from "../components/Pager";

export default function Jobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [customers, setCustomers] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  // Defaults to "recent" (newest created first) so opening the Jobs page
  // shows what you've been working on lately instead of the oldest
  // scheduled job in the system. "Scheduled" gets back the original
  // upcoming-queue ordering for anyone who wants that view instead.
  const [sort, setSort] = useState("recent");
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(Boolean(searchParams.get("newFor")));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    customerId: searchParams.get("newFor") || "",
    propertyId: "",
    title: "",
    description: "",
    technicianIds: [] as string[],
  });

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  function loadJobs(pageNum = page) {
    api(`/jobs?page=${pageNum}&pageSize=${pageSize}&sort=${sort}${statusFilter ? `&status=${statusFilter}` : ""}`).then((res: any) => {
      setJobs(res.items);
      setTotal(res.total);
    });
  }

  useEffect(() => { setPage(1); loadJobs(1); }, [statusFilter, sort]);
  useEffect(() => { loadJobs(page); }, [page]);
  useEffect(() => {
    api("/customers?pageSize=500").then((res: any) => setCustomers(res.items));
    api("/auth/technicians").then(setTechnicians);
  }, []);

  async function createJob(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/jobs", { method: "POST", body: form });
      setShowForm(false);
      setForm({ customerId: "", propertyId: "", title: "", description: "", technicianIds: [] });
      setPage(1);
      loadJobs(1);
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    try { await downloadFile("/jobs/export.csv", "jobs.csv"); } catch (err: any) { alert(err.message); }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await uploadCsv<{ created: number; errors: string[] }>("/jobs/import", file);
      alert(`Imported ${result.created} job(s).${result.errors.length ? `\n\n${result.errors.length} row(s) had issues:\n${result.errors.slice(0, 10).join("\n")}` : ""}`);
      setPage(1);
      loadJobs(1);
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
          <h1>Jobs</h1>
          <div className="sub">{total} total</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 170 }}>
            <option value="recent">Most Recent</option>
            <option value="scheduled">Scheduled Date</option>
            <option value="oldest">Oldest First</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">All statuses</option>
            <option value="NEW,NEEDS_SCHEDULING">Needs scheduling</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS,ON_SITE,EN_ROUTE">In progress</option>
            <option value="AWAITING_PARTS">Awaiting parts</option>
            <option value="COMPLETED,PAID">Completed</option>
          </select>
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
          <label className="btn ghost">
            {importing ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv" onChange={onImportFile} style={{ display: "none" }} disabled={importing} />
          </label>
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New Job"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createJob} className="card" style={{ marginBottom: 20 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>Customer</label>
              <select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value, propertyId: "" })}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Property</label>
              <select
                value={form.propertyId}
                onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                required
                disabled={!selectedCustomer}
              >
                <option value="">Select a property…</option>
                {selectedCustomer?.properties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Job title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="field">
            <label>Description / problem reported</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>Assign technician(s) (optional - can schedule later)</label>
            <select
              multiple
              value={form.technicianIds}
              onChange={(e) => setForm({ ...form, technicianIds: Array.from(e.target.selectedOptions, (o) => o.value) })}
              style={{ height: 90 }}
            >
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
              ))}
            </select>
          </div>
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create Job"}</button>
        </form>
      )}

      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>Job #</th>
            <th>Title</th>
            <th>Customer</th>
            <th>Scheduled</th>
            <th>Technician</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="jobnum">{job.jobNumber}</td>
              <td><Link to={`/jobs/${job.id}`}>{job.title}</Link></td>
              <td>{job.customer.firstName} {job.customer.lastName}</td>
              <td>{job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : "-"}</td>
              <td>{job.technicians?.map((t: any) => t.user.firstName).join(", ") || "Unassigned"}</td>
              <td><StatusBadge status={job.status} /></td>
            </tr>
          ))}
          {jobs.length === 0 && <tr><td colSpan={6} className="empty-note">No jobs match this filter.</td></tr>}
        </tbody>
      </table></div>
      <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
