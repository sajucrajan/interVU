/**
 * Waking a sleeping API (docs/11, "Cold starts").
 *
 * Free-tier hosting puts each service to sleep after a quiet quarter hour.
 * The web service wakes when someone opens a page, but the API behind the
 * same-origin proxy does not: the host answers the proxied call with a 429
 * ("hibernate-rate-limited") and keeps answering that way. What does wake it
 * is a request to the API's OWN address, from anywhere — which is why
 * opening /healthz by hand used to fix the demo.
 *
 * So the browser does that itself. NEXT_PUBLIC_API_WAKE_URL is the API's
 * public address (render.yaml); when it is set, every page pokes
 * `<it>/healthz` on load and `api()` does the same before retrying a 429.
 * The call is a plain cross-origin GET: the API's CORS allows the web origin,
 * so a readable 200 means awake, and the host's sleeping-page response (no
 * CORS headers) throws, which reads as "not yet". Unset — a self-hosted
 * install, local dev — none of this runs.
 */

export const WAKE_URL = (process.env.NEXT_PUBLIC_API_WAKE_URL ?? "").replace(/\/+$/, "");

export type WakeState = "idle" | "waking" | "awake" | "failed";

let state: WakeState = "idle";
let inflight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: WakeState) {
  if (state === next) return;
  state = next;
  for (const l of listeners) l();
}

export const getWakeState = () => state;

export function subscribeWake(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Up to about 100 seconds: a cold free-tier start is 30–60 of them. */
const DELAYS = [1500, 2500, 4000, 6000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000];

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(`${WAKE_URL}/healthz`, { cache: "no-store", credentials: "omit" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wake the API and resolve when it answers, or false when it has not within
 * the budget. Concurrent callers share one attempt. A second call after the
 * API has gone back to sleep (state "awake", but a request just failed)
 * starts over: pass `force`.
 */
export function wakeApi(force = false): Promise<boolean> {
  if (!WAKE_URL || typeof window === "undefined") return Promise.resolve(true);
  if (inflight) return inflight;
  if (state === "awake" && !force) return Promise.resolve(true);
  inflight = (async () => {
    set("waking");
    for (const delay of [0, ...DELAYS]) {
      if (delay) await sleep(delay);
      if (await probe()) {
        set("awake");
        return true;
      }
    }
    set("failed");
    return false;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
