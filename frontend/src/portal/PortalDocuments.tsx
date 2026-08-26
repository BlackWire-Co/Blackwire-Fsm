import { useEffect, useRef, useState } from "react";
import { portalApi, portalUploadFile } from "./api";

export default function PortalDocuments() {
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    portalApi("/documents").then(setDocs);
  }
  useEffect(() => { load(); }, []);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await portalUploadFile("/documents", file);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Documents</h1>
          <div className="sub">Upload photos or documents we've requested from you</div>
        </div>
        <label className="btn primary">
          {uploading ? "Uploading…" : "+ Upload File"}
          <input ref={fileInputRef} type="file" onChange={onFileSelected} style={{ display: "none" }} disabled={uploading} />
        </label>
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
          </a>
        ))}
      </div>
    </div>
  );
}
