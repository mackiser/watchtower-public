// Thin fetch wrapper: same-origin JSON API, credentials for the session cookie, and the
// custom header the API's requireXhrHeader middleware checks on mutations (see
// apps/api/src/middleware/auth.ts) as lightweight CSRF defense.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Watchtower-Client": "1",
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Any 401 might be a session that just expired (idle/absolute timeout). The listener in
    // main.tsx decides whether it really was an expiry (only a signed-in → 401 transition counts).
    if (res.status === 401) window.dispatchEvent(new Event("watchtower:unauthorized"));
    throw new ApiError(res.status, (body && body.error) || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
