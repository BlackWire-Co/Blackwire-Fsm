import { useEffect, useState } from "react";
import { portalApi } from "./api";
import StatusBadge from "../components/StatusBadge";

export default function PortalJobs() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    portalApi("/jobs").then(setJobs);
  }, []);

  const now = new Date();
  const upcoming = jobs.filter((j) => j.scheduledDate && new Date(j.scheduledDate) >= now);
  const past = jobs.filter((j) => !j.scheduledDate || new Date(j.scheduledDate) < now);

  function JobRow({ job }: { job: any }) {
    return (
      <div className="job-row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div>{job.title}</div>
          <div className="who">
            {job.scheduledDate ? new Date(job.scheduledDate).toLocaleString() : "Not yet scheduled"} · {job.property?.label}
          </div>
          {job.technicians?.length > 0 && (
            <div className="who">Technician: {job.technicians.map((t: any) => t.user.firstName).join(", ")}</div>
          )}
          {job.customerVisibleNotes && <div className="who">Note: {job.customerVisibleNotes}</div>}
        </div>
        <StatusBadge status={job.status} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Your Appointments</h1>
          <div className="sub">Upcoming and past service at your properties</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Upcoming</h3>
          {upcoming.length === 0 && <div className="empty-note">No upcoming appointments.</div>}
          {upcoming.map((j) => <JobRow key={j.id} job={j} />)}
        </div>
        <div className="card">
          <h3>Past Service</h3>
          {past.length === 0 && <div className="empty-note">No past service yet.</div>}
          {past.map((j) => <JobRow key={j.id} job={j} />)}
        </div>
      </div>
    </div>
  );
}
