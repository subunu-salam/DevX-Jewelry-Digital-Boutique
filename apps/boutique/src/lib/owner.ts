import { API_URL } from "./api";

const KEY = "aur_owner_token";

export function ownerToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setOwnerToken(t: string | null) {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export async function ownerLogin(email: string, password: string): Promise<void> {
  const r = await fetch(`${API_URL}/api/auth/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error ?? "Login failed");
  }
  const { token } = await r.json();
  setOwnerToken(token);
}

/** Authenticated request using the owner/staff token. */
export async function ownerFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = ownerToken();
  const r = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  if (!r.ok) {
    if (r.status === 401) setOwnerToken(null);
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error ?? `Request failed (${r.status})`);
  }
  return r.json();
}

/** Read a File as a base64 data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
