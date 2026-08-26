import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export default function CustomerDocuments() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);

  function load() {
    api(`/customers/${id}`).then(setCustomer);
    api(`/customers/${id}/documents`).then(setDocs);
  }
  useEffect(() => { load(); }, [id]);

  return (
    <div>
      <Link className="link-back" to={`/customers/${id}`}>← Back to customer</Link>
      <div className="page-header">
        <div>
          <h1>{customer ? `${customer.firstName} ${customer.lastName}` : "Loading…"}</h1>
          <div className="sub">Files uploaded through the customer portal</div>
        </div>
      </div>

      {docs.length === 0 && <div className="card empty-note">No documents uploaded yet.</div>}
      <div className="photo-grid">
        {docs.map((d) => (
          <a key={d.id} href={d.url} target="_blank" rel="noreferrer" style={{ textAlign: "center" }}>
            {d.fileName.match(/\.(jpg|jpeg|png|webp)$/i) ? (
              <img src={d.url} alt={d.fileName} />
            ) : (
              <div className="card" style={{ padding: 10, fontSize: 12 }}>{d.fileName}</div>
            )}
            <div className="who" style={{ marginTop: 4 }}>{new Date(d.uploadedAt).toLocaleDateString()}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
