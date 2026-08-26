import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

// Phase 1 ships a functional day-by-technician board with click-to-assign.
// True drag-and-drop reassignment (per the full spec) lands in the next
// iteration once the core scheduling data model has been exercised.
export default function Schedule() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jobs, setJobs] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  function load() {
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;
    api(`/jobs?from=${from}&to=${to}&pageSize=200`).then((res: any) => setJobs(res.items));
    api(`/jobs?unassigned=true&pageSize=200`).then((res: any) => setUnassigned(res.items));
  }

  useEffect(() => { load(); }, [date]);
  useEffect(() => { api("/auth/technicians").then(setTechnicians); }, []);

  async function assign(jobId: string, technicianId: string) {
    await api(`/jobs/${jobId}`, {
      method: "PATCH",
      body: { technicianIds: [technicianId], scheduledDate: `${date}T09:00:00.000Z` },
    });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Schedule</h1>
          <div className="sub">Day view</div>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Technicians — {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h3>
          {technicians.map((tech) => {
            const techJobs = jobs.filter((j) => j.technicians.some((t: any) => t.user.id ? t.userId === tech.id : t.userId === tech.id));
            return (
              <div key={tech.id} style={{ marginBottom: 14 }}>
                <strong>{tech.firstName} {tech.lastName}</strong>
                {techJobs.length === 0 && <div className="empty-note">No jobs scheduled.</div>}
                {techJobs.map((job) => (
                  <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="job-row">
                      <div style={{ flex: 1 }}>{job.title} — {job.customer.firstName} {job.customer.lastName}</div>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>

        <div className="card">
          <h3>Unassigned Jobs</h3>
          {unassigned.length === 0 && <div className="empty-note">Everything is assigned. Nice work.</div>}
          {unassigned.map((job) => (
            <div key={job.id} className="job-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <Link to={`/jobs/${job.id}`}>{job.title}</Link>
                <div className="who">{job.customer.firstName} {job.customer.lastName}</div>
              </div>
              <select defaultValue="" onChange={(e) => e.target.value && assign(job.id, e.target.value)} style={{ width: 160 }}>
                <option value="" disabled>Assign to…</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
