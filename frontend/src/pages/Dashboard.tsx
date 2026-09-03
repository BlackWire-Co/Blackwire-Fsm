import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";

interface DashboardData {
  todaysJobs: any[];
  upcomingJobs: any[];
  unassignedJobs: any[];
  needsAttention: any[];
  recentCustomers: any[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api<DashboardData>("/dashboard").then(setData);
  }, []);

  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost" to="/customers">+ New Customer</Link>
          <Link className="btn primary" to="/jobs">+ New Job</Link>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Today's Jobs ({data.todaysJobs.length})</h3>
          {data.todaysJobs.length === 0 && <div className="empty-note">Nothing scheduled today.</div>}
          {data.todaysJobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-row">
                <div className="job-time">
                  {job.startTime ? new Date(job.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--"}
                </div>
                <div style={{ flex: 1 }}>
                  <div>{job.title}</div>
                  <div className="who">
                    {job.customer.firstName} {job.customer.lastName} · {job.property?.city}
                    {job.technicians?.length ? ` · ${job.technicians.map((t: any) => t.user.firstName).join(", ")}` : ""}
                  </div>
                </div>
                <StatusBadge status={job.status} />
              </div>
            </Link>
          ))}
        </div>

        <div className="card">
          <h3>Needs Attention</h3>
          {data.needsAttention.length === 0 && <div className="empty-note">Nothing waiting on parts or review.</div>}
          {data.needsAttention.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-row">
                <div style={{ flex: 1 }}>
                  <div>{job.title}</div>
                  <div className="who">{job.customer.firstName} {job.customer.lastName}</div>
                </div>
                <StatusBadge status={job.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h3>Unassigned Jobs</h3>
          <div className="stat-value">{data.unassignedJobs.length}</div>
          {data.unassignedJobs.slice(0, 4).map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-row" style={{ fontSize: 13 }}>
                <div style={{ flex: 1 }}>{job.title}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="card">
          <h3>Upcoming Jobs</h3>
          <div className="stat-value">{data.upcomingJobs.length}</div>
          {data.upcomingJobs.slice(0, 4).map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-row" style={{ fontSize: 13 }}>
                <div style={{ flex: 1 }}>{job.title}</div>
                <div className="who">{new Date(job.scheduledDate).toLocaleDateString()}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="card">
          <h3>Recent Customers</h3>
          {data.recentCustomers.map((c) => (
            <Link key={c.id} to={`/customers/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="job-row" style={{ fontSize: 13 }}>
                {c.firstName} {c.lastName}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
