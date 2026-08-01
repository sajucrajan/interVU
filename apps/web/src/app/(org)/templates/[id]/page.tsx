"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { Modal } from "@/components/actions-menu";
import {
  MustHavesEditor,
  SkillMatrixEditor,
  fromSkillRecords,
  toSkillPayload,
  useKnownSkills,
  type SkillRow,
} from "@/components/skill-matrix";

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
  const [editing, setEditing] = useState(false);

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
          <button className="secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
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

      {editing && (
        <Modal title={`Edit ${t.name}`} onClose={() => setEditing(false)}>
          <EditTemplateForm
            template={t}
            onDone={async () => {
              setEditing(false);
              const fresh = await api<TemplateDetail>(`/position-templates/${t.id}`);
              setT(fresh);
            }}
          />
        </Modal>
      )}

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


function EditTemplateForm({
  template,
  onDone,
}: {
  template: TemplateDetail;
  onDone: () => Promise<void>;
}) {
  const knownSkills = useKnownSkills();
  const [f, setF] = useState({
    name: template.name,
    summary: template.summary,
    title: template.title,
    description: template.description,
    seniority: template.seniority ?? "",
    employment_type: template.employmentType,
    location_policy: template.locationPolicy ?? "",
    location_text: template.locationText ?? "",
    min_total_years: template.minTotalYears != null ? String(template.minTotalYears) : "",
    rate_min: template.rateMin != null ? String(template.rateMin) : "",
    rate_max: template.rateMax != null ? String(template.rateMax) : "",
    rate_currency: template.rateCurrency,
    rate_period: template.ratePeriod ?? "",
  });
  const [skills, setSkills] = useState<SkillRow[]>(fromSkillRecords(template.skills));
  const [mustHaves, setMustHaves] = useState<string[]>(template.mustHaves ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  return (
    <>
      <label>Template name</label>
      <input value={f.name} onChange={set("name")} />
      <label>Summary</label>
      <input value={f.summary} onChange={set("summary")} />
      <label>Job title</label>
      <input value={f.title} onChange={set("title")} />
      <div className="row">
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Seniority</label>
          <select value={f.seniority} onChange={set("seniority")}>
            <option value="">—</option>
            {["junior", "mid", "senior", "staff", "principal"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Employment</label>
          <select value={f.employment_type} onChange={set("employment_type")}>
            <option value="full_time">Full-time</option>
            <option value="contract">Contract</option>
            <option value="contract_to_hire">Contract-to-hire</option>
          </select>
        </div>
        <div style={{ width: 150 }}>
          <label>Min experience (yrs)</label>
          <input
            type="number"
            min={0}
            value={f.min_total_years}
            onChange={set("min_total_years")}
          />
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Location policy</label>
          <select value={f.location_policy} onChange={set("location_policy")}>
            <option value="">—</option>
            <option value="onsite">Onsite</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 180 }}>
          <label>Location</label>
          <input value={f.location_text} onChange={set("location_text")} />
        </div>
      </div>
      <div className="row">
        <div style={{ width: 120 }}>
          <label>Rate min</label>
          <input type="number" value={f.rate_min} onChange={set("rate_min")} />
        </div>
        <div style={{ width: 120 }}>
          <label>Rate max</label>
          <input type="number" value={f.rate_max} onChange={set("rate_max")} />
        </div>
        <div style={{ width: 100 }}>
          <label>Currency</label>
          <input value={f.rate_currency} onChange={set("rate_currency")} maxLength={3} />
        </div>
        <div style={{ width: 130 }}>
          <label>Per</label>
          <select value={f.rate_period} onChange={set("rate_period")}>
            <option value="">—</option>
            {["hourly", "daily", "monthly", "annual"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label style={{ marginTop: "0.8rem" }}>Skill matrix</label>
      <SkillMatrixEditor
        rows={skills}
        onChange={setSkills}
        knownSkills={knownSkills}
        listId="tpl-edit-skills"
      />
      <label style={{ marginTop: "1rem" }}>Other must-haves</label>
      <MustHavesEditor values={mustHaves} onChange={setMustHaves} />
      <label style={{ marginTop: "1rem" }}>Description</label>
      <textarea rows={5} value={f.description} onChange={set("description")} />
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !f.name.trim() || !f.title.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/position-templates/${template.id}`, {
                method: "PATCH",
                body: {
                  name: f.name.trim(),
                  summary: f.summary,
                  title: f.title.trim(),
                  description: f.description,
                  seniority: f.seniority || null,
                  employment_type: f.employment_type,
                  location_policy: f.location_policy || null,
                  location_text: f.location_text || null,
                  min_total_years: f.min_total_years ? Number(f.min_total_years) : null,
                  rate_min: f.rate_min ? Number(f.rate_min) : null,
                  rate_max: f.rate_max ? Number(f.rate_max) : null,
                  rate_currency: f.rate_currency,
                  rate_period: f.rate_period || null,
                  must_haves: mustHaves,
                  skills: toSkillPayload(skills),
                },
              });
              await onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save template"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
