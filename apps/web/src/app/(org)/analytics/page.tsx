"use client";

import { HiringPerformance } from "./performance";

/**
 * The exec view (design option 1d). It answers "are we hiring fast enough, and
 * which vendors are worth the fee" — not "how many", which is what the
 * explorer's hierarchy and sunburst are for.
 */
export default function AnalyticsPage() {
  return (
    <main className="wide">
      <HiringPerformance />
    </main>
  );
}
