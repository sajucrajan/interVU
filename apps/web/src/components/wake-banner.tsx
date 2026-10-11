"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getWakeState, subscribeWake, wakeApi, WAKE_URL } from "@/lib/wake";

/**
 * Pokes a sleeping API on every page load and says so while it wakes
 * (lib/wake.ts). Mounted once in the root layout; renders nothing on a
 * deployment that does not sleep.
 */
export function WakeBanner() {
  const state = useSyncExternalStore(subscribeWake, getWakeState, () => "idle" as const);

  useEffect(() => {
    if (WAKE_URL) void wakeApi();
  }, []);

  if (!WAKE_URL || state === "idle" || state === "awake") return null;

  return (
    <div className={`wake-banner ${state}`} role="status" aria-live="polite">
      {state === "waking" ? (
        <>
          <span className="wake-dot" aria-hidden />
          <span>
            <strong>Waking the server.</strong> Free-tier hosting sleeps after 15
            quiet minutes; the first visit takes up to a minute. Anything you
            click will wait for it.
          </span>
        </>
      ) : (
        <span>
          <strong>The server did not wake in time.</strong>{" "}
          <button type="button" className="wake-retry" onClick={() => void wakeApi(true)}>
            Try again
          </button>
        </span>
      )}
    </div>
  );
}
