const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function getPortalToken() {
  return localStorage.getItem("fsm_portal_token");
}

export function setPortalToken(token: string) {
  localStorage.setItem("fsm_portal_token", token);
}

export function clearPortalToken() {
  localStorage.removeItem("fsm_portal_token");
}

export function isPortalAuthed() {
  return Boolean(getPortalToken());
}

export async function portalApi<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(getPortalToken() ? { Authorization: `Bearer ${getPortalToken()}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearPortalToken();
    window.location.href = "/portal/login";
    throw new Error("Session expired");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.toString?.() || "Request failed");
  return data as T;
}

export async function portalUploadFile<T = any>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    method: "POST",
    headers: { ...(getPortalToken() ? { Authorization: `Bearer ${getPortalToken()}` } : {}) },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.toString?.() || "Upload failed");
  return data as T;
}

export async function openPortalPdf(path: string) {
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    headers: { ...(getPortalToken() ? { Authorization: `Bearer ${getPortalToken()}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.toString?.() || "Could not load PDF");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
