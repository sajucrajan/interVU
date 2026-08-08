"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import {
  MustHavesEditor,
  SkillMatrixEditor,
  emptySkill,
  toSkillPayload,
  useKnownSkills,
  type SkillRow,
} from "@/components/skill-matrix";

interface UnitNode {
  id: string;
  name: string;
  kind: string;
  children: UnitNode[];
}
function teamOptions(nodes: UnitNode[], path: string[] = []): { id: string; label: string }[] {
  return nodes.flatMap((n) => {
    const here = [...path, n.name];
    return [
      ...(n.kind === "team" ? [{ id: n.id, label: here.join(" / ") }] : []),
      ...teamOptions(n.children, here),
    ];
  });
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [teams, setTeams] = useState<{ id: string; label: string }[]>([]);
  const knownSkills = useKnownSkills();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    summary: "",
    title: "",
    org_unit_id: "",
    seniority: "",
    employment_type: "full_time",
    openings: 1,
    location_policy: "",
    location_text: "",
    min_total_years: "",
    rate_min: "",
    rate_max: "",
    rate_currency: "USD",
    rate_period: "",
    description: "",
  });
  const [skills, setSkills] = useState<SkillRow[]>([emptySkill()]);
  const [mustHaves, setMustHaves] = useState<string[]>([]);

  useEffect(() => {
    api<UnitNode[]>("/org-units")
      .then((tree) => setTeams(teamOptions(tree)))
      .catch(() => undefined);
  }, [router]);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const dirty = form.name.trim() !== "" || form.title.trim() !== "";

  function cancel() {
    if (dirty && !window.confirm("Discard this template?")) return;
    router.push("/templates");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/position-templates", {
        method: "POST",
        body: {
          name: form.name.trim(),
          summary: form.summary,
          title: form.title.trim(),
          description: form.description,
          openings: Number(form.openings) || 1,
          seniority: form.seniority || null,
          employment_type: form.employment_type,
          location_policy: form.location_policy || null,
          location_text: form.location_text || null,
          min_total_years: form.min_total_years ? Number(form.min_total_years) : null,
          rate_min: form.rate_min ? Number(form.rate_min) : null,
          rate_max: form.rate_max ? Number(form.rate_max) : null,
          rate_currency: form.rate_currency,
          rate_period: form.rate_period || null,
          must_haves: mustHaves,
          org_unit_id: form.org_unit_id || null,
          skills: toSkillPayload(skills),
        },
      });
      router.push("/templates");
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="wide">
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>New template</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            A standard job description you can start future positions from. The
            team and rate can always be overridden per opening.
          </p>
        </div>
        <button type="button" className="secondary" onClick={cancel}>
          Cancel
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="card">
          <p className="chart-title">Template</p>
          <div className="row">
            <div style={{ flex: 1, minWidth: 260 }}>
              <label>Template name *</label>
              <input
                value={form.name}
                onChange={set("name")}
                placeholder="Backend Engineer — standard"
                required
              />
            </div>
            <div style={{ flex: 2, minWidth: 260 }}>
              <label>Summary</label>
              <input
                value={form.summary}
                onChange={set("summary")}
                placeholder="When should someone reach for this template?"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <p className="chart-title">Role defaults</p>
          <div className="row">
            <div style={{ flex: 2, minWidth: 240 }}>
              <label>Job title *</label>
              <input value={form.title} onChange={set("title")} required />
            </div>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label>Default team (optional)</label>
              <select value={form.org_unit_id} onChange={set("org_unit_id")}>
                <option value="">— choose per position —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>Seniority</label>
              <select value={form.seniority} onChange={set("seniority")}>
                <option value="">—</option>
                {["junior", "mid", "senior", "staff", "principal"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label>Employment</label>
              <select value={form.employment_type} onChange={set("employment_type")}>
                <option value="full_time">Full-time</option>
                <option value="contract">Contract</option>
                <option value="contract_to_hire">Contract-to-hire</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>Location policy</label>
              <select value={form.location_policy} onChange={set("location_policy")}>
                <option value="">—</option>
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label>Location</label>
              <input value={form.location_text} onChange={set("location_text")} />
            </div>
            <div style={{ width: 170 }}>
              <label>Min total experience (yrs)</label>
              <input
                type="number"
                min={0}
                value={form.min_total_years}
                onChange={set("min_total_years")}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <p className="chart-title">Vendor terms</p>
          <div className="row">
            <div style={{ width: 130 }}>
              <label>Rate min</label>
              <input type="number" min={0} value={form.rate_min} onChange={set("rate_min")} />
            </div>
            <div style={{ width: 130 }}>
              <label>Rate max</label>
              <input type="number" min={0} value={form.rate_max} onChange={set("rate_max")} />
            </div>
            <div style={{ width: 110 }}>
              <label>Currency</label>
              <input value={form.rate_currency} onChange={set("rate_currency")} maxLength={3} />
            </div>
            <div style={{ width: 140 }}>
              <label>Per</label>
              <select value={form.rate_period} onChange={set("rate_period")}>
                <option value="">—</option>
                {["hourly", "daily", "monthly", "annual"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="chart-title">Skill matrix</p>
          <p className="chart-sub">
            Importance and required proficiency are separate axes; panel matching
            and vendor screening both read this.
          </p>
          <SkillMatrixEditor
            rows={skills}
            onChange={setSkills}
            knownSkills={knownSkills}
            listId="new-tpl-skills"
          />
        </div>

        <div className="card">
          <p className="chart-title">Other must-haves</p>
          <MustHavesEditor
            values={mustHaves}
            onChange={setMustHaves}
            placeholder="e.g. Eligible to work without sponsorship"
          />
        </div>

        <div className="card">
          <p className="chart-title">Description</p>
          <textarea
            rows={6}
            value={form.description}
            onChange={set("description")}
            placeholder="About the role, responsibilities, the team…"
          />
        </div>

        <div className="card">
          <div className="row">
            <button disabled={busy}>{busy ? "Saving…" : "Save template"}</button>
            <button type="button" className="secondary" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </form>
    </main>
  );
}
