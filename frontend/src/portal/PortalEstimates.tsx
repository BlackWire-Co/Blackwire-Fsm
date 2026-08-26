import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "./api";
import StatusBadge from "../components/StatusBadge";

export default function PortalEstimates() {
  const [estimates, setEstimates] = useState<any[]>([]);

  useEffect(() => {
    portalApi("/estimates").then(setEstimates);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Estimates</h1>
          <div className="sub">Review and approve estimates for your service</div>
        </div>
      </div>

      {estimates.length === 0 && <div className="card empty-note">No estimates yet.</div>}
      {estimates.map((est) => (
        <Link key={est.id} to={`/portal/estimates/${est.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="jobnum">{est.estimateNumber}</div>
              <div>{new Date(est.date).toLocaleDateString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>${est.totals.total.toFixed(2)}</div>
              <StatusBadge status={est.status} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
