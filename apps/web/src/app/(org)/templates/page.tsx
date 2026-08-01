"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu } from "@/components/actions-menu";

interface Template {
  id: string;
  name: string;
  summary: string;
  title: string;
  seniority: string | null;
  employmentType: string;
  rateMin: number | null;
  rateMax: number | null;
  rateCurrency: string;
  ratePeriod: string | null;
  mustHaves: string[];
  orgUnit: { id: string; name: string } | null;
  skills: { level: string; skill: { name: string } }[];
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      api<Template[]>("/position-templates")
        .then(setTemplates)
        .catch(() => router.push("/login")),
    [router],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!templates) return <main className="wide muted">Loading…</main>;

  return (
    <main className="wide">
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Job description templates</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Standard JDs to start a position from, so you only edit what differs.
          </p>
        </div>
        <div className="row">
          <Link href="/templates/new">
            <button>+ New template</button>
          </Link>
          <Link href="/positions">
            <button className="secondary">Positions</button>
          </Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {templates.length === 0 ? (
        <div className="card empty-state">
          <span className="empty-icon">＋</span>
          <div>
            <strong>No templates yet.</strong>
            <p className="muted" style={{ margin: 0 }}>
              Create one from scratch, or open any position and choose{" "}
              <em>Save as template</em> to capture its job description.
            </p>
            <p style={{ margin: "0.5rem 0 0" }}>
              <Link href="/templates/new">Create a template →</Link>
            </p>
          </div>
        </div>
      ) : (
        <div className="work-grid">
          {templates.map((t) => (
            <div className="card" key={t.id} style={{ margin: 0 }}>
              <div className="row spread">
                <Link href={`/templates/${t.id}`}>
                  <strong>{t.name}</strong>
                </Link>
                <ActionsMenu
                  items={[
                    {
                      label: "View details",
                      onSelect: () => router.push(`/templates/${t.id}`),
                    },
                    {
                      label: "Use for a new position",
                      onSelect: () => router.push(`/positions/new?template=${t.id}`),
                    },
                    {
                      label: "Delete template",
                      tone: "danger",
                      onSelect: async () => {
                        if (!window.confirm(`Delete the template "${t.name}"?`)) return;
                        try {
                          await api(`/position-templates/${t.id}`, { method: "DELETE" });
                          await refresh();
                        } catch (e) {
                          setError(apiErrorMessage(e));
                        }
                      },
                    },
                  ]}
                />
              </div>
              {t.summary && (
                <p className="muted" style={{ fontSize: "0.85rem", margin: "0.3rem 0" }}>
                  {t.summary}
                </p>
              )}
              <p className="muted" style={{ fontSize: "0.82rem", margin: "0.3rem 0" }}>
                {[
                  t.title,
                  t.seniority,
                  t.employmentType?.replaceAll("_", " "),
                  t.orgUnit?.name,
                  t.rateMin != null && t.rateMax != null
                    ? `${t.rateCurrency} ${t.rateMin}–${t.rateMax}${t.ratePeriod ? ` / ${t.ratePeriod}` : ""}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {t.skills.length > 0 && (
                <div style={{ marginTop: "0.3rem" }}>
                  {t.skills.slice(0, 6).map((s) => (
                    <span
                      key={s.skill.name}
                      className={`skill-chip ${s.level === "must_have" ? "must" : ""}`}
                    >
                      {s.skill.name}
                    </span>
                  ))}
                </div>
              )}
              <p style={{ margin: "0.7rem 0 0" }} className="row">
                <Link href={`/templates/${t.id}`}>View details</Link>
                <Link href={`/positions/new?template=${t.id}`}>Use this template →</Link>
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
