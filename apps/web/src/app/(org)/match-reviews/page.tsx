"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface ReviewItem {
  id: string;
  score: number;
  feature_breakdown: Record<string, number>;
  created_at: string;
  submission: {
    raw_profile: {
      candidate_name?: string;
      email?: string;
      phone?: string;
      current_employer?: string;
      current_title?: string;
    };
    vendor: string;
    position: string;
    received_at: string;
  };
  suggested_candidate: {
    id: string;
    displayName: string;
    currentTitle: string | null;
    currentEmployer: string | null;
    identities: { kind: string; valueRaw: string }[];
    applications: { position: { title: string }; currentStage: string; status: string }[];
  } | null;
}

const FEATURES = ["name", "email_local", "employer", "title", "location"] as const;

export default function MatchReviewsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      api<ReviewItem[]>("/match-reviews")
        .then(setItems)
        .catch(() => router.push("/login")),
    [router],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function resolve(id: string, action: "link" | "keep_separate") {
    setError(null);
    try {
      await api(`/match-reviews/${id}/resolve`, { method: "POST", body: { action } });
      await refresh();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  if (!items) return <main className="wide muted">Loading…</main>;

  return (
    <main className="wide">
      <h1>Match reviews</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Uncertain identity matches wait here for a human decision. Linking merges
        the submission into the existing candidate&apos;s history; keeping separate
        creates a new candidate and teaches the engine not to re-ask.
      </p>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p className="muted">Queue is empty — nothing uncertain right now. 🎉</p>}
      {items.map((item) => {
        const s = item.submission.raw_profile;
        const c = item.suggested_candidate;
        return (
          <div className="card" key={item.id}>
            <div className="row spread">
              <strong>
                Same person? <span className="badge warn">score {Math.round(item.score * 100)}%</span>
              </strong>
              <span className="muted">
                {item.submission.vendor} → {item.submission.position} ·{" "}
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
            <div className="viz-grid" style={{ marginTop: "0.7rem" }}>
              <div>
                <p className="chart-sub" style={{ marginBottom: "0.3rem" }}>Incoming submission</p>
                <p style={{ margin: 0 }}>
                  <strong>{s.candidate_name}</strong>
                  <br />
                  <span className="muted">
                    {[s.current_title, s.current_employer].filter(Boolean).join(" @ ")}
                  </span>
                  <br />
                  <span className="muted">{s.email} · {s.phone}</span>
                </p>
              </div>
              <div>
                <p className="chart-sub" style={{ marginBottom: "0.3rem" }}>Existing candidate</p>
                {c ? (
                  <p style={{ margin: 0 }}>
                    <a href={`/candidates/${c.id}`}><strong>{c.displayName}</strong></a>
                    <br />
                    <span className="muted">
                      {[c.currentTitle, c.currentEmployer].filter(Boolean).join(" @ ")}
                    </span>
                    <br />
                    <span className="muted">
                      {c.identities.filter((i) => i.kind === "email" || i.kind === "phone").map((i) => i.valueRaw).join(" · ")}
                    </span>
                    <br />
                    <span className="muted">
                      {c.applications.map((a) => `${a.position.title} (${a.currentStage})`).join("; ")}
                    </span>
                  </p>
                ) : (
                  <p className="muted">candidate no longer exists</p>
                )}
              </div>
            </div>
            <div style={{ margin: "0.8rem 0 0.5rem" }}>
              {FEATURES.map((f) => {
                const v = item.feature_breakdown[f] ?? 0;
                return (
                  <div className="hbar-row" key={f} style={{ margin: "0.2rem 0" }}>
                    <span className="muted">{f.replaceAll("_", " ")}</span>
                    <div className="hbar-track" style={{ height: 10 }}>
                      <div
                        className="hbar-seg"
                        style={{ width: `${v * 100}%`, background: "var(--accent)" }}
                        title={`${f}: ${Math.round(v * 100)}%`}
                      />
                    </div>
                    <span className="hbar-val">{Math.round(v * 100)}%</span>
                  </div>
                );
              })}
            </div>
            <div className="row">
              <button onClick={() => resolve(item.id, "link")}>Same person — link</button>
              <button className="secondary" onClick={() => resolve(item.id, "keep_separate")}>
                Different people — keep separate
              </button>
            </div>
          </div>
        );
      })}
    </main>
  );
}
