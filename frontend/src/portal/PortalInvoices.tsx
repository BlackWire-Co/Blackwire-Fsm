import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "./api";
import StatusBadge from "../components/StatusBadge";

export default function PortalInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    portalApi("/invoices").then(setInvoices);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <div className="sub">View and pay your invoices</div>
        </div>
      </div>

      {invoices.length === 0 && <div className="card empty-note">No invoices yet.</div>}
      {invoices.map((inv) => (
        <Link key={inv.id} to={`/portal/invoices/${inv.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="jobnum">{inv.invoiceNumber}</div>
              <div>{inv.dueDate ? `Due ${new Date(inv.dueDate).toLocaleDateString()}` : new Date(inv.date).toLocaleDateString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700 }}>${inv.totals.balance.toFixed(2)} due</div>
              <StatusBadge status={inv.status} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
