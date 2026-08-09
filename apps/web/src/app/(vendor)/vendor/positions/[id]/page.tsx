"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { PositionBriefView, type Brief } from "@/components/position-brief";

/**
 * A released role, for the agency it was released to.
 *
 * The portal has listed every field of this since M3; what was missing was a
 * way to open one. A vendor recruiter reading a status change on their own
 * submission had no route back to the role they sourced against — which is
 * exactly the document they need to answer "why was this person not right?".
 *
 * The rate band IS shown here, unlike the interviewer view. A vendor quotes
 * to it, and the portal has always carried it; withholding it would break
 * sourcing rather than protect anything.
 *
 * A role never released to this vendor returns 404, not 403 — see the
 * controller. That distinction is deliberate and this page must not undo it
 * by rendering a more specific message than the API gave it.
 */
export default function VendorPositionPage() {
  const { id } = useParams<{ id: string }>();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Brief>(`/vendor/positions/${id}`)
      .then(setBrief)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [id]);

  if (error) {
    return (
      <main className="wide">
        <h1>Role</h1>
        <p className="error">{error}</p>
        <p>
          <Link href="/vendor">Back to the portal</Link>
        </p>
      </main>
    );
  }
  if (!brief) return <main className="wide muted">Loading…</main>;

  return (
    <PositionBriefView
      brief={brief}
      backHref="/vendor"
      backLabel="Back to the portal"
    />
  );
}
