import { useEffect, useState } from "react";
import { api } from "../api/client";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api(`/reports/summary?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`).then(setData);
  }, [from, to]);

  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <div className="sub">Revenue is cash-basis (based on recorded payments); outstanding/paid figures are as of today</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <span className="who">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Revenue Collected</h3>
          <div className="stat-value">${data.revenue.toFixed(2)}</div>
          <div className="who">in selected range</div>
        </div>
        <div className="card">
          <h3>Jobs Completed</h3>
          <div className="stat-value">{data.jobsCompleted}</div>
          <div className="who">of {data.jobsCreated} created in range</div>
        </div>
        <div className="card">
          <h3>Outstanding</h3>
          <div className="stat-value">${data.invoices.outstandingTotal.toFixed(2)}</div>
          <div className="who">{data.invoices.outstandingCount} invoices unpaid</div>
        </div>
        <div className="card">
          <h3>Overdue</h3>
          <div className="stat-value" style={{ color: data.invoices.overdueCount > 0 ? "var(--red)" : undefined }}>
            ${data.invoices.overdueTotal.toFixed(2)}
          </div>
          <div className="who">{data.invoices.overdueCount} invoices past due</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Jobs &amp; Hours by Technician</h3>
          {data.byTechnician.length === 0 && <div className="empty-note">No technicians yet.</div>}
          <div className="table-scroll"><table className="data">
            <thead><tr><th>Technician</th><th>Jobs</th><th>Hours</th></tr></thead>
            <tbody>
              {data.byTechnician.map((t: any) => (
                <tr key={t.technician}>
                  <td>{t.technician}</td>
                  <td>{t.jobsAssigned}</td>
                  <td>{t.hoursLogged}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <h3>Estimates: Won / Lost</h3>
          <div style={{ display: "flex", gap: 24, marginBottom: 10 }}>
            <div>
              <div className="stat-value" style={{ color: "var(--green)" }}>{data.estimates.approved}</div>
              <div className="who">Approved</div>
            </div>
            <div>
              <div className="stat-value" style={{ color: "var(--red)" }}>{data.estimates.declined}</div>
              <div className="who">Declined</div>
            </div>
            {data.estimates.winRate !== null && (
              <div>
                <div className="stat-value">{data.estimates.winRate}%</div>
                <div className="who">Win rate</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Top Materials Used (by value)</h3>
        {data.materialsUsed.length === 0 && <div className="empty-note">No materials logged in this range.</div>}
        <div className="table-scroll"><table className="data">
          <thead><tr><th>Material</th><th>Quantity</th><th>Total Value</th></tr></thead>
          <tbody>
            {data.materialsUsed.map((m: any) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>{m.quantity}</td>
                <td>${m.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
