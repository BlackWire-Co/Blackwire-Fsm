import { useEffect, useState } from "react";
import { api } from "../api/client";
import Pager from "../components/Pager";

export default function NotificationLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api(`/notification-log?page=${page}&pageSize=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`).then((res: any) => {
      setLogs(res.items);
      setTotal(res.total);
    });
  }, [statusFilter, page]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Notification Log</h1>
          <div className="sub">Every email/SMS attempt — sent, failed, or skipped because nothing's configured</div>
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ width: 160 }}>
          <option value="">All</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option>
        </select>
      </div>

      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>When</th>
            <th>Channel</th>
            <th>Template</th>
            <th>Recipient</th>
            <th>Status</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="who">{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.channel}</td>
              <td>{log.templateKey}</td>
              <td>{log.recipient}</td>
              <td>
                <span className={`badge status-${log.status === "SENT" ? "PAID" : log.status === "FAILED" ? "AWAITING_PARTS" : "NEW"}`}>
                  {log.status}
                </span>
              </td>
              <td className="who">{log.error || "—"}</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={6} className="empty-note">No notifications logged yet.</td></tr>}
        </tbody>
      </table></div>
      <Pager page={page} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
