import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function MessagesInbox() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const load = () => api("/messages-inbox").then(setRows);
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Messages</h1>
          <div className="sub">Customer portal message threads</div>
        </div>
      </div>

      {rows.length === 0 && <div className="card empty-note">No customer messages yet.</div>}
      {rows.map((row) => (
        <Link key={row.customerId} to={`/customers/${row.customerId}/messages`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{row.customerName}</strong>
              <div className="who" style={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.lastMessage.fromCustomer ? "" : "You: "}{row.lastMessage.body}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="who">{new Date(row.lastMessage.createdAt).toLocaleString()}</div>
              {row.unreadCount > 0 && (
                <span className="badge status-AWAITING_PARTS">{row.unreadCount} new</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
