"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import {
  MustHavesEditor,
  SkillMatrixEditor,
  emptySkill,
  toSkillPayload,
  useKnownSkills,
  type SkillRow,
} from "@/components/skill-matrix";

interface TemplateSummary {
  id: string;
  name: string;
  summary: string;
  title: string;
  orgUnit: { id: string; name: string } | null;
  skills: { level: string; proficiency: string; minYears: number | null; skill: { name: string } }[];
}

interface TemplateDetail extends TemplateSummary {
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
  orgUnitId: string | null;
}

interface UnitNode {
  id: string;
  name: string;
  kind: string;
  children: UnitNode[];
}
/** Flatten the unit tree into team options with breadcrumb labels. */
function teamOptions(nodes: UnitNode[], path: string[] = []): { id: string; label: string }[] {
  return nodes.flatMap((n) => {
    const here = [...path, n.name];
    return [
      ...(n.kind === "team" ? [{ id: n.id, label: here.join(" / ") }] : []),
      ...teamOptions(n.children, here),
    ];
  });
}

function NewPositionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [teams, setTeams] = useState<{ id: string; label: string }[]>([]);
  const knownSkills = useKnownSkills();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
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
  const [release, setRelease] = useState("all_at_once");

  /** Fill the form from a saved template — the whole point of templates. */
  const applyTemplate = useCallback((t: TemplateDetail) => {
    setForm({
      title: t.title,
      org_unit_id: t.orgUnitId ?? "",
      seniority: t.seniority ?? "",
      employment_type: t.employmentType ?? "full_time",
      openings: t.openings ?? 1,
      location_policy: t.locationPolicy ?? "",
      location_text: t.locationText ?? "",
      min_total_years: t.minTotalYears != null ? String(t.minTotalYears) : "",
      rate_min: t.rateMin != null ? String(t.rateMin) : "",
      rate_max: t.rateMax != null ? String(t.rateMax) : "",
      rate_currency: t.rateCurrency ?? "USD",
      rate_period: t.ratePeriod ?? "",
      description: t.description ?? "",
    });
    setMustHaves(t.mustHaves ?? []);
    setSkills(
      t.skills.length > 0
        ? t.skills.map((s) => ({
            name: s.skill.name,
            level: s.level as SkillRow["level"],
            proficiency: s.proficiency as SkillRow["proficiency"],
            min_years: s.minYears != null ? String(s.minYears) : "",
          }))
        : [emptySkill()],
    );
    setAppliedFrom(t.name);
  }, []);

  useEffect(() => {
    api<UnitNode[]>("/org-units")
      .then((tree) => setTeams(teamOptions(tree)))
      .catch(() => router.push("/login"));
    api<TemplateSummary[]>("/position-templates")
      .then(setTemplates)
      .catch(() => undefined);

    // Arriving from "use this template" preloads the form.
    const templateId = params.get("template");
    if (templateId) {
      api<TemplateDetail>(`/position-templates/${templateId}`)
        .then(applyTemplate)
        .catch(() => undefined);
    }
  }, [router, params, applyTemplate]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        org_unit_id: form.org_unit_id,
        title: form.title,
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
        skills: toSkillPayload(skills),
      };
      const created = await api<{ id: string }>("/positions", { method: "POST", body });
      if (release !== "draft") {
        const policy =
          release === "tiered"
            ? { mode: "tiered", steps: [{ tier: 1, delay_hours: 0 }, { tier: 2, delay_hours: 168 }] }
            : { mode: release };
        await api(`/positions/${created.id}/publish`, { method: "POST", body: policy });
      }
      router.push(`/positions/${created.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  const dirty =
    form.title.trim() !== "" ||
    form.description.trim() !== "" ||
    mustHaves.length > 0 ||
    skills.some((s) => s.name.trim() !== "");

  function cancel() {
    if (dirty && !window.confirm("Discard this position? Your changes will be lost.")) {
      return;
    }
    router.push("/positions");
  }

  return (
    <main className="wide">
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>New position</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            The structured posting is the single source of truth: it renders the job
            description, drives vendor sourcing, and feeds panel matching.
          </p>
        </div>
        <button type="button" className="secondary" onClick={cancel}>
          Cancel
        </button>
      </div>
      {templates.length > 0 && (
        <div className="card">
          <p className="chart-title">Start from a template</p>
          <p className="chart-sub">
            Load a standard job description, then change only what differs for
            this opening.
          </p>
          <div className="row">
            <select
              style={{ maxWidth: 420 }}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                api<TemplateDetail>(`/position-templates/${e.target.value}`)
                  .then(applyTemplate)
                  .catch(() => setError("Could not load that template."));
              }}
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {appliedFrom && (
              <span className="badge ok">loaded &ldquo;{appliedFrom}&rdquo;</span>
            )}
          </div>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="card">
          <p className="chart-title">Role</p>
          <div className="row">
            <div style={{ flex: 2, minWidth: 240 }}>
              <label>Title *</label>
              <input value={form.title} onChange={set("title")} required placeholder="Senior Backend Engineer" />
            </div>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label>Team *</label>
              <select value={form.org_unit_id} onChange={set("org_unit_id")} required>
                <option value="">Select team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label>Seniority</label>
              <select value={form.seniority} onChange={set("seniority")}>
                <option value="">—</option>
                {["junior", "mid", "senior", "staff", "principal"].map((s) => (
                  <option key={s} value={s}>{s}</option>
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
            <div style={{ width: 110 }}>
              <label>Openings</label>
              <input type="number" min={1} value={form.openings} onChange={set("openings")} />
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
              <input value={form.location_text} onChange={set("location_text")} placeholder="Austin, TX" />
            </div>
            <div style={{ width: 170 }}>
              <label>Min total experience (yrs)</label>
              <input type="number" min={0} value={form.min_total_years} onChange={set("min_total_years")} />
            </div>
          </div>
        </div>

        <div className="card">
          <p className="chart-title">Vendor terms</p>
          <p className="chart-sub">The rate band is shown to vendors on the posting.</p>
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
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="chart-title">Skill matrix</p>
          <p className="chart-sub">
            Importance (must / nice) and required proficiency are separate axes;
            panel matching and vendor screening both read this matrix.
          </p>
          <SkillMatrixEditor
            rows={skills}
            onChange={setSkills}
            knownSkills={knownSkills}
            listId="new-pos-skills"
          />
        </div>

        <div className="card">
          <p className="chart-title">Other must-haves</p>
          <p className="chart-sub">Certifications, work authorization, languages — vendors screen against these.</p>
          <MustHavesEditor
            values={mustHaves}
            onChange={setMustHaves}
            placeholder="e.g. CKA certification"
          />
        </div>

        <div className="card">
          <p className="chart-title">Description</p>
          <textarea rows={6} value={form.description} onChange={set("description")} placeholder="About the role, responsibilities, the team…" />
        </div>

        <div className="card">
          <p className="chart-title">Publish</p>
          <div className="row">
            <select style={{ maxWidth: 340 }} value={release} onChange={(e) => setRelease(e.target.value)}>
              <option value="all_at_once">Publish — release to all vendors now</option>
              <option value="tiered">Publish — tier 1 now, tier 2 after 7 days</option>
              <option value="manual">Publish — release to vendors manually</option>
              <option value="draft">Save as draft</option>
            </select>
            <button disabled={busy}>{busy ? "Creating…" : "Create position"}</button>
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

export default function NewPositionPage() {
  return (
    <Suspense fallback={<main className="wide muted">Loading…</main>}>
      <NewPositionForm />
    </Suspense>
  );
}
