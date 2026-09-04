const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function getToken() {
  return localStorage.getItem("fsm_token");
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("fsm_token");
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.toString?.() || "Request failed");
  }
  return data as T;
}

// Multipart upload (photos) - bypasses the JSON-only `api()` helper since
// the browser needs to set its own multipart boundary header.
export async function uploadFile<T = any>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const formData = new FormData();
  formData.append("photo", file);
  Object.entries(fields).forEach(([k, v]) => formData.append(k, v));

  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.toString?.() || "Upload failed");
  return data as T;
}

// PDF endpoints require auth, but a plain <a href> or window.open() doesn't
// send our Authorization header - the browser hits the API unauthenticated
// and gets a bare "Not authenticated" JSON error instead of a PDF. Fetch it
// ourselves with the header attached, then hand the browser a local blob URL.
export async function openPdf(path: string) {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.toString?.() || "Could not load PDF");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Give the new tab time to load the blob before revoking it.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Same authenticated-fetch-then-blob pattern as openPdf, but triggers an
// actual file download (CSV exports) instead of opening a viewer tab.
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.toString?.() || "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Generic CSV/file upload - same multipart pattern as uploadFile but with a
// "file" field name and no extra fields, used by the CSV import endpoints.
export async function uploadCsv<T = any>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.toString?.() || "Import failed");
  return data as T;
}

export function setToken(token: string) {
  localStorage.setItem("fsm_token", token);
}

export function clearToken() {
  localStorage.removeItem("fsm_token");
}

export function isAuthed() {
  return Boolean(getToken());
}
