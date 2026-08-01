"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { formatAge } from "@/components/age-pill";
import type { Worklist } from "@/lib/worklist";

interface Me {
  kind: string;
  capabilities?: string[];
}

const STAGE_LABEL: Record<string, string> = {
  submitted: "New",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
};

const TONE_COLOR: Record<string, string> = {
  critical: "var(--bad)",
  warning: "var(--warn)",
  normal: "var(--accent)",
};

const TONE_WASH: Record<string, string> = {
  critical: "var(--bad-wash)",
  warning: "var(--warn-wash)",
  normal: "transparent",
};

const SLA_COLOR: Record<string, string> = {
  ok: "var(--ok)",
  aging: "var(--warn)",
  breached: "var(--bad)",
};

/** "Seven things are waiting on you" reads as a fact; "7" reads as a metric. */
const WORDS = [
  "Nothing",
  "One thing",
  "Two things",
  "Three things",
  "Four things",
  "Five things",
  "Six things",
  "Seven things",
  "Eight things",
  "Nine things",
  "Ten things",
];
const spell = (n: number) => (n < WORDS.length ? WORDS[n] : `${n} things`);

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

export default function Dashboard() {
  const router = useRouter();
  const [wl, setWl] = useState<Worklist | null>(null);
  const [caps, setCaps] = useState<string[]>([]);

  useEffect(() => {
    api<Worklist>("/me/worklist")
      .then(setWl)
      .catch(() => router.push("/login"));
    api<Me>("/auth/me")
      .then((m) => setCaps(m.capabilities ?? []))
      .catch(() => undefined);
  }, [router]);

  if (!wl) return <main className="wide muted">Loading…</main>;

  const seesPipeline = caps.includes("submissions.view");
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const stats = wl.head_stats;

  return (
    <main className="wide">
      {/* ---- Page header: the fact, then the three numbers that frame it ---- */}
      <header className="page-head">
        <div>
          <div className="mono-label">{today}</div>
          <h1 style={{ marginTop: 12 }}>
            {wl.total > 0 ? (
              <>
                {spell(wl.total)}
                <br />
                are waiting on you.
              </>
            ) : (
              <>
                Nothing is
                <br />
                waiting on you.
              </>
            )}
          </h1>
        </div>
        {seesPipeline && (
          <div className="head-stats">
            <HeadStat label="In flight" value={stats.in_flight} />
            <HeadStat
              label="Median time to offer"
              value={
                stats.median_time_to_offer_days === null
                  ? "—"
                  : `${stats.median_time_to_offer_days}d`
              }
              delta={
                stats.median_time_to_offer_delta === null
                  ? null
                  : {
                      // Faster is better, so a fall is good news.
                      text: `${stats.median_time_to_offer_delta > 0 ? "+" : ""}${stats.median_time_to_offer_delta}d vs prior 30d`,
                      good: stats.median_time_to_offer_delta <= 0,
                    }
              }
            />
            <HeadStat
              label="SLA breached"
              value={stats.sla_breached}
              tone={stats.sla_breached > 0 ? "var(--bad)" : undefined}
            />
          </div>
        )}
      </header>

      {/* ---- The queue: a ruled list that says how late, not just how many ---- */}
      <section>
        <SectionHead label="Your queue" />
        {wl.groups.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">✓</span>
            <div>
              <strong>You&apos;re all caught up.</strong>
              <p className="muted" style={{ margin: 0 }}>
                New submissions, reviews and interview feedback will appear here.
              </p>
            </div>
          </div>
        ) : (
          wl.groups.map((g) => (
            <Link
              key={g.key}
              href={g.href}
              className="queue-row"
              style={{
                borderLeftColor: TONE_COLOR[g.tone],
                background: g.sla_state === "breached" ? TONE_WASH[g.tone] : undefined,
              }}
            >
              <span className="figure queue-n" style={{ color: TONE_COLOR[g.tone] }}>
                {g.count}
              </span>
              <span>
                <span className="queue-label">{g.label}</span>
                <span className="queue-sub">{g.sub}</span>
              </span>
              {g.sla_state ? (
                <span
                  className="queue-sla"
                  style={{
                    color: SLA_COLOR[g.sla_state],
                    borderColor: SLA_COLOR[g.sla_state],
                    background:
                      g.sla_state === "ok" ? "transparent" : TONE_WASH[g.tone],
                  }}
                >
                  {g.sla_label}
                </span>
              ) : (
                <span />
              )}
              <span className="queue-oldest">
                {g.oldest_at ? `oldest ${formatAge(hoursSince(g.oldest_at))}` : ""}
              </span>
              <span className="queue-go" aria-hidden>
                →
              </span>
            </Link>
          ))
        )}
      </section>

      <section className="dash-split">
        {/* ---- Time in stage: big is not the same as late ---- */}
        {seesPipeline && (
          <div>
            <SectionHead
              label="Pipeline · time in stage"
              action={<Link href="/pipeline">Open board</Link>}
            />
            {wl.pipeline.map((s) => {
              const total = s.count || 1;
              const pct = (n: number) => `${(n / total) * 100}%`;
              return (
                <div key={s.stage} className="stage-row">
                  <span className="stage-name">{STAGE_LABEL[s.stage] ?? s.stage}</span>
                  <div className="stage-bar-wrap">
                    <div className="stage-track">
                      <div
                        style={{ width: pct(s.healthy), background: "var(--accent)" }}
                      />
                      <div style={{ width: pct(s.aging), background: "var(--warn)" }} />
                      {/* Texture, so a breach survives greyscale and a red brand. */}
                      <div className="stage-breach" style={{ width: pct(s.breached) }} />
                    </div>
                    <span className="figure stage-count">{s.count}</span>
                  </div>
                  <span className="stage-median">
                    {s.median_hours === null ? "—" : formatAge(s.median_hours)}
                  </span>
                </div>
              );
            })}
            <div className="stage-legend">
              <span>
                <i style={{ background: "var(--accent)" }} />
                On track
              </span>
              <span>
                <i style={{ background: "var(--warn)" }} />
                Aging
              </span>
              <span>
                <i className="stage-breach" />
                SLA breached
              </span>
            </div>
          </div>
        )}

        {/* ---- Next up ---- */}
        <div>
          <SectionHead label="Next up" />
          {wl.upcoming_interviews.length === 0 ? (
            <p className="muted">None scheduled.</p>
          ) : (
            wl.upcoming_interviews.map((i) => {
              const when = new Date(i.scheduled_at);
              return (
                <div key={i.id} className="next-row">
                  <div className="date-block">
                    <div className="mono-label">
                      {when.toLocaleDateString(undefined, { month: "short" })}
                    </div>
                    <div className="figure date-day">{when.getDate()}</div>
                  </div>
                  <div>
                    <Link href={`/candidates/${i.candidate.id}`} className="next-name">
                      {i.candidate.displayName}
                    </Link>
                    <div className="next-meta">
                      {i.round_name} · {i.position_title}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="next-time">
                      {when.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <div
                      className="next-prep"
                      style={{
                        color: i.my_scorecard_submitted ? "var(--ok)" : "var(--muted)",
                      }}
                    >
                      {i.my_scorecard_submitted ? "Scorecard filed" : "Dossier ready"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ---- Inbound ---- */}
      {seesPipeline && (
        <section>
          <SectionHead
            label="Inbound · most recent"
            action={<Link href="/pipeline">All submissions</Link>}
          />
          {wl.recent_submissions.length === 0 ? (
            <p className="muted">No submissions yet.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Position</th>
                  <th>Vendor</th>
                  <th>Match</th>
                  <th>State</th>
                  <th className="num">Age</th>
                </tr>
              </thead>
              <tbody>
                {wl.recent_submissions.map((s) => {
                  const dup = s.ownership_status === "duplicate";
                  const tone = dup
                    ? "var(--warn)"
                    : s.status === "accepted"
                      ? "var(--ok)"
                      : "var(--muted)";
                  const wash = dup
                    ? "var(--warn-wash)"
                    : s.status === "accepted"
                      ? "var(--ok-wash)"
                      : "transparent";
                  const score = s.match_score;
                  return (
                    <tr key={s.id}>
                      <td>
                        {s.candidate ? (
                          <Link href={`/candidates/${s.candidate.id}`}>
                            {s.candidate.displayName}
                          </Link>
                        ) : (
                          <span className="muted">pending review</span>
                        )}
                      </td>
                      <td>
                        {s.position_reference && (
                          <span className="ref-code" style={{ marginRight: 7 }}>
                            {s.position_reference}
                          </span>
                        )}
                        {s.position_title}
                      </td>
                      <td className="muted">{s.vendor}</td>
                      <td>
                        {score === null ? (
                          <span className="badge">new</span>
                        ) : (
                          <span className="match-cell">
                            <span className="match-track">
                              <span
                                style={{
                                  width: `${Math.round(score * 100)}%`,
                                  background:
                                    score >= 0.92
                                      ? "var(--ok)"
                                      : score >= 0.7
                                        ? "var(--warn)"
                                        : "var(--muted)",
                                }}
                              />
                            </span>
                            <span className="match-score">{Math.round(score * 100)}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{ color: tone, borderColor: tone, background: wash }}
                        >
                          {dup ? "duplicate" : s.status}
                        </span>
                      </td>
                      <td className="num">{formatAge(hoursSince(s.received_at))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

function HeadStat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string | number;
  delta?: { text: string; good: boolean } | null;
  tone?: string;
}) {
  return (
    <div className="head-stat">
      <div className="mono-label">{label}</div>
      <div className="figure head-stat-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {delta && (
        <div
          className="head-stat-delta"
          style={{ color: delta.good ? "var(--ok)" : "var(--bad)" }}
        >
          {delta.text}
        </div>
      )}
    </div>
  );
}
