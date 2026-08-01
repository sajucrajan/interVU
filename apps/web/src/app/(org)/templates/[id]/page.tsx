"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface TemplateDetail {
  id: string;
  name: string;
  summary: string;
  title: string;
  description: string;
  seniority: string | null;
  employmentType: string;
  locationPolicy: string | null;
  locationText: string | null;
  minTotalYears: number | null;
  openings: number;
  rateMin: number | null;
  rateMax: number | null;
  rateCurrency: string;
  ratePeriod: string | null;
  mustHaves: string[];
  orgUnit: { id: string; name: string } | null;
  createdAt: string;
  skills: {
    level: string;
    proficiency: string;
    minYears: number | null;
    skill: { name: string };
  }[];
}

const nice = (s: string | null | undefined) => (s ? s.replaceAll("_", " ") : null);

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TemplateDetail>(`/position-templates/${id}`)
      .then(setT)
      .catch(() => router.push("/templates"));
  }, [id, router]);

  if (!t) return <main className="wide muted">Loading…</main>;

  const meta = [
    t.title,
    nice(t.seniority),
    nice(t.employmentType),
    [nice(t.locationPolicy), t.locationText].filter(Boolean).join(" · "),
    t.minTotalYears != null ? `${t.minTotalYears}+ yrs` : null,
    t.rateMin != null && t.rateMax != null
      ? `${t.rateCurrency} ${t.rateMin}–${t.rateMax}${t.ratePeriod ? ` / ${nice(t.ratePeriod)}` : ""}`
      : null,
    t.orgUnit ? `default team: ${t.orgUnit.name}` : null,
  ].filter(Boolean);

  const musts = t.skills.filter((s) => s.level === "must_have");
  const goods = t.skills.filter((s) => s.level === "good_to_have");

  return (
    <main className="wide">
      <p>
        <Link href="/templates">← Templates</Link>
      </p>
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>{t.name}</h1>
          {t.summary && (
            <p className="muted" style={{ margin: "0 0 0.3rem" }}>
              {t.summary}
            </p>
          )}
          <p className="muted" style={{ marginTop: 0 }}>
            {meta.join(" · ")}
          </p>
        </div>
        <div className="row">
          <Link href={`/positions/new?template=${t.id}`}>
            <button>Use this template</button>
          </Link>
          <button
            className="secondary"
            onClick={async () => {
              if (!window.confirm(`Delete the template "${t.name}"?`)) return;
              try {
                await api(`/position-templates/${t.id}`, { method: "DELETE" });
                router.push("/templates");
              } catch (e) {
                setError(apiErrorMessage(e));
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <p className="chart-title">Description</p>
        {t.description ? (
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{t.description}</p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No description in this template.
          </p>
        )}
      </div>

      <div className="viz-grid">
        <div className="card">
          <p className="chart-title">Skill matrix</p>
          {t.skills.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No skills defined.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Importance</th>
                  <th>Proficiency</th>
                  <th className="num">Min yrs</th>
                </tr>
              </thead>
              <tbody>
                {[...musts, ...goods].map((s) => (
                  <tr key={s.skill.name}>
                    <td>
                      <strong>{s.skill.name}</strong>
                    </td>
                    <td>
                      <span className={`badge ${s.level === "must_have" ? "warn" : ""}`}>
                        {nice(s.level)}
                      </span>
                    </td>
                    <td>{s.proficiency}</td>
                    <td className="num">{s.minYears ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <p className="chart-title">Other must-haves</p>
          {t.mustHaves.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              None specified.
            </p>
          ) : (
            <ul style={{ margin: 0 }}>
              {t.mustHaves.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <p className="chart-title" style={{ marginTop: "1.2rem" }}>
            Using this template
          </p>
          <p className="muted" style={{ fontSize: "0.86rem", margin: 0 }}>
            Everything above prefills the new-position form. You still choose the
            team and can change any field before publishing — the template is a
            starting point, not a constraint.
          </p>
        </div>
      </div>
    </main>
  );
}
