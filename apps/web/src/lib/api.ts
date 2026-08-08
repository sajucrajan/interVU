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

/**
 * Endpoints whose 401 means "these credentials are wrong", not "your session
 * expired". Redirecting on those would replace "Invalid email or password"
 * with a bounce back to the page you are already standing on.
 *
 * Listed explicitly rather than excluding all of `/auth/`: `/auth/me` lives
 * there too and is precisely the "am I still signed in?" probe. Excluding the
 * whole prefix left the vendor portal, whose first call is /auth/me, sitting
 * on "Loading…" forever instead of redirecting.
 */
const CREDENTIAL_ENDPOINTS = [
  "/auth/org/login",
  "/auth/vendor/login",
  "/auth/activate",
  "/auth/login-context",
  "/auth/invite/",
];
const isCredentialEndpoint = (path: string) =>
  CREDENTIAL_ENDPOINTS.some((p) => path.startsWith(p));

/** Pages where a redirect would either loop or interrupt a legitimate flow. */
const isPublicRoute = (pathname: string) =>
  pathname === "/" ||
  pathname === "/login" ||
  pathname === "/vendor/login" ||
  pathname.startsWith("/activate") ||
  pathname === "/demo";

/**
 * Only ever redirect once. A screen typically fires several requests at
 * mount, so an expired session produces a burst of 401s; without this each
 * one pushes its own navigation and the back button becomes unusable.
 */
let redirecting = false;

/**
 * Send an unauthenticated caller to the right sign-in page.
 *
 * Vendors and org users have separate doors (docs/05), so the destination is
 * chosen from where the person actually is — bouncing an agency user to the
 * internal login would show them a page they can never get through.
 *
 * `replace`, not `push`: the page they were on is dead, and leaving it in
 * history means the back button returns to something that will only 401 again.
 */
function toSignIn() {
  if (typeof window === "undefined" || redirecting) return;
  const { pathname, search } = window.location;
  if (isPublicRoute(pathname)) return;
  redirecting = true;
  const target = pathname.startsWith("/vendor") ? "/vendor/login" : "/login";
  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.replace(`${target}?next=${next}`);
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

  // Handled here rather than in each page: of 24 screens that call the API,
  // 12 redirected and 12 rendered an empty signed-in shell. Worse, the ones
  // that did redirect caught EVERY error, so a 500 also looked like a lost
  // session. One place, one rule, and only for 401.
  if (res.status === 401 && !isCredentialEndpoint(path)) toSignIn();

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
