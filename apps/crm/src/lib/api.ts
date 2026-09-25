const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "devx_crm_token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // Network-level failure — the API server isn't reachable.
    throw new Error(
      `Can't reach the API server at ${API_URL}. Make sure it's running — start everything with "npm run dev" from the project folder, and ensure the database is set up ("npm run setup").`,
    );
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { const body = await res.json(); message = body.error ?? message; } catch { /* ignore */ }
    if (res.status === 401) setToken(null);
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(p: string, body?: unknown) => request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) => request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
export { API_URL };
