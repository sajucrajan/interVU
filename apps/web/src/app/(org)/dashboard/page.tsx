"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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

  const firstName = wl.user.name.split(" ")[0];
  const pipelineTotal = wl.pipeline.reduce((n, s) => n + s.count, 0);

  return (
    <main className="wide">
      <h1 style={{ marginBottom: "0.2rem" }}>Good to see you, {firstName}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {wl.total > 0
          ? `${wl.total} item${wl.total === 1 ? "" : "s"} need your attention.`
          : "Nothing is waiting on you right now."}
      </p>

      {/* ---- The action queue: the reason to open this page ---- */}
      <section>
        <h2>Needs your attention</h2>
        {wl.groups.length === 0 ? (
          <div className="card empty-state">
            <span className="empty-icon">✓</span>
            <div>
              <strong>You&apos;re all caught up.</strong>
              <p className="muted" style={{ margin: 0 }}>
                New submissions, reviews and interview feedback will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="work-grid">
            {wl.groups.map((g) => (
              <Link key={g.key} href={g.href} className={`work-card tone-${g.tone}`}>
                <span className="work-count">{g.count}</span>
                <span className="work-label">{g.label}</span>
                <span className="work-go">Open →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="viz-grid" style={{ marginTop: "1.5rem" }}>
        {/* Pipeline health is only meaningful to someone who can see
            submissions; an interviewer gets their assignments instead. */}
        {caps.includes("submissions.view") && (
        <section className="card">
          <div className="row spread">
            <p className="chart-title" style={{ margin: 0 }}>
              Active pipeline
            </p>
            <Link href="/pipeline" style={{ fontSize: "0.85rem" }}>
              View pipeline →
            </Link>
          </div>
          <p className="chart-sub">
            {pipelineTotal} candidate{pipelineTotal === 1 ? "" : "s"} in flight across your scope.
          </p>
          {pipelineTotal === 0 ? (
            <p className="muted">No active candidates yet.</p>
          ) : (
            <div className="stage-bars">
              {wl.pipeline.map((s) => (
                <Link
                  key={s.stage}
                  href={`/pipeline?stage=${s.stage}`}
                  className="stage-bar"
                  title={`${s.count} in ${STAGE_LABEL[s.stage] ?? s.stage}`}
                >
                  <span className="stage-count">{s.count}</span>
                  <span
                    className="stage-fill"
                    style={{
                      height: `${Math.max(
                        6,
                        (s.count / Math.max(...wl.pipeline.map((x) => x.count), 1)) * 100,
                      )}%`,
                    }}
                  />
                  <span className="stage-name">{STAGE_LABEL[s.stage] ?? s.stage}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        )}

        {/* ---- My upcoming interviews ---- */}
        <section className="card">
          <p className="chart-title">Your upcoming interviews</p>
          {wl.upcoming_interviews.length === 0 ? (
            <p className="muted">None scheduled.</p>
          ) : (
            <ul className="plain-list">
              {wl.upcoming_interviews.map((i) => (
                <li key={i.id}>
                  <div className="row spread">
                    <span>
                      <Link href={`/candidates/${i.candidate.id}`}>
                        <strong>{i.candidate.displayName}</strong>
                      </Link>{" "}
                      <span className="muted">· {i.round_name}</span>
                    </span>
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {new Date(i.scheduled_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    {i.position_title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Recent inbound ---- */}
      {caps.includes("submissions.view") && (
      <section>
        <div className="row spread">
          <h2>Latest submissions</h2>
          <Link href="/pipeline" style={{ fontSize: "0.85rem" }}>
            All submissions →
          </Link>
        </div>
        {wl.recent_submissions.length === 0 ? (
          <p className="muted">No submissions yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Position</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {wl.recent_submissions.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.candidate ? (
                      <Link href={`/candidates/${s.candidate.id}`}>
                        <strong>{s.candidate.displayName}</strong>
                      </Link>
                    ) : (
                      <span className="muted">pending review</span>
                    )}
                  </td>
                  <td>{s.position_title}</td>
                  <td className="muted">{s.vendor}</td>
                  <td>
                    <span
                      className={`badge ${
                        s.ownership_status === "duplicate"
                          ? "warn"
                          : s.status === "accepted"
                            ? "ok"
                            : ""
                      }`}
                    >
                      {s.ownership_status === "duplicate" ? "duplicate" : s.status}
                    </span>
                  </td>
                  <td className="muted">
                    {new Date(s.received_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      )}
    </main>
  );
}
