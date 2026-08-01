"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { SectionHead } from "@/components/section-head";

interface Timeline {
  candidate: {
    id: string;
    display_name: string;
    current_title: string | null;
    current_employer: string | null;
    location: string | null;
    identities: { kind: string; valueRaw: string }[];
    active_flags: { kind: string; reason: string }[];
  };
  applications: { id: string; position: string; team: string; stage: string; status: string }[];
  events: { at: string; type: string; summary: string; detail?: Record<string, unknown> }[];
}

const TYPE_ICON: Record<string, string> = {
  submission: "📥",
  stage_change: "➡️",
  interview: "🗣️",
  scorecard: "📝",
  decision: "⚖️",
  flag: "🚩",
};

export default function CandidateTimelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Timeline>(`/candidates/${id}/timeline`)
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.push("/login");
        else setError("You don't have access to this candidate's history.");
      });
  }, [id, router]);

  if (error) return <main className="wide error">{error}</main>;
  if (!data) return <main className="wide muted">Loading…</main>;
  const c = data.candidate;

  return (
    <main className="wide">
      <p>
        <a href="/dashboard">← Dashboard</a>
      </p>
      <div className="row spread">
        <h1>{c.display_name}</h1>
        <span className="muted">
          {[c.current_title, c.current_employer, c.location].filter(Boolean).join(" · ")}
        </span>
      </div>

      {c.active_flags.length > 0 && (
        <div className="card">
          {c.active_flags.map((f, i) => (
            <p key={i}>
              <span className={`badge ${f.kind === "do_not_hire" ? "bad" : "warn"}`}>
                {f.kind.replaceAll("_", " ")}
              </span>{" "}
              {f.reason}
            </p>
          ))}
        </div>
      )}

      <SectionHead label="Applications" />
      <table className="data">
        <thead>
          <tr>
            <th>Position</th>
            <th>Team</th>
            <th>Stage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.applications.map((a) => (
            <tr key={a.id}>
              <td>{a.position}</td>
              <td>{a.team}</td>
              <td>{a.stage}</td>
              <td>
                <span className={`badge ${a.status === "active" ? "ok" : ""}`}>{a.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionHead label="History" />
      {data.events.map((e, i) => (
        <div className="card" key={i} style={{ padding: "0.6rem 1rem", margin: "0.5rem 0" }}>
          <div className="row spread">
            <span>
              {TYPE_ICON[e.type] ?? "•"} {e.summary}
            </span>
            <span className="muted">{new Date(e.at).toLocaleString()}</span>
          </div>
          {e.detail && (
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {Object.entries(e.detail)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
          )}
        </div>
      ))}
    </main>
  );
}
