export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/** Cookie-credentialed JSON fetch against the InterVU API. */
export async function api<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { detail?: string; code?: string } | null;
    if (b?.detail) return b.detail;
    if (b?.code === "invalid_credentials") return "Invalid email or password.";
    if (b?.code) return b.code.replaceAll("_", " ");
    return `Request failed (${e.status})`;
  }
  return "Network error — is the API running?";
}
