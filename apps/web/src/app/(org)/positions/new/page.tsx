"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface UnitNode {
  id: string;
  name: string;
  kind: string;
  children: UnitNode[];
}
interface SkillRow {
  name: string;
  level: "must_have" | "good_to_have";
  proficiency: "awareness" | "working" | "proficient" | "expert";
  min_years: string;
}

const emptySkill = (): SkillRow => ({
  name: "",
  level: "must_have",
  proficiency: "working",
  min_years: "",
});

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

export default function NewPositionPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<{ id: string; label: string }[]>([]);
  const [knownSkills, setKnownSkills] = useState<string[]>([]);
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
  const [mustHaveDraft, setMustHaveDraft] = useState("");
  const [release, setRelease] = useState("all_at_once");

  useEffect(() => {
    api<UnitNode[]>("/org-units")
      .then((tree) => setTeams(teamOptions(tree)))
      .catch(() => router.push("/login"));
    api<{ name: string }[]>("/skills")
      .then((s) => setKnownSkills(s.map((x) => x.name)))
      .catch(() => undefined);
  }, [router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const setSkill = (i: number, patch: Partial<SkillRow>) =>
    setSkills(skills.map((s, j) => (j === i ? { ...s, ...patch } : s)));

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
        skills: skills
          .filter((s) => s.name.trim())
          .map((s) => ({
            name: s.name.trim(),
            level: s.level,
            proficiency: s.proficiency,
            min_years: s.min_years ? Number(s.min_years) : null,
          })),
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
          {skills.map((s, i) => (
            <div className="row" key={i} style={{ marginBottom: "0.4rem" }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <input
                  list="known-skills"
                  value={s.name}
                  onChange={(e) => setSkill(i, { name: e.target.value })}
                  placeholder="Skill (e.g. Kubernetes)"
                />
              </div>
              <select
                style={{ width: 140 }}
                value={s.level}
                onChange={(e) => setSkill(i, { level: e.target.value as SkillRow["level"] })}
              >
                <option value="must_have">Must-have</option>
                <option value="good_to_have">Good-to-have</option>
              </select>
              <select
                style={{ width: 130 }}
                value={s.proficiency}
                onChange={(e) => setSkill(i, { proficiency: e.target.value as SkillRow["proficiency"] })}
              >
                {["awareness", "working", "proficient", "expert"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                style={{ width: 90 }}
                type="number"
                min={0}
                placeholder="yrs"
                value={s.min_years}
                onChange={(e) => setSkill(i, { min_years: e.target.value })}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => setSkills(skills.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <datalist id="known-skills">
            {knownSkills.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <button type="button" className="secondary" onClick={() => setSkills([...skills, emptySkill()])}>
            + Add skill
          </button>
        </div>

        <div className="card">
          <p className="chart-title">Other must-haves</p>
          <p className="chart-sub">Certifications, work authorization, languages — vendors screen against these.</p>
          <div className="row">
            <input
              style={{ flex: 1 }}
              value={mustHaveDraft}
              onChange={(e) => setMustHaveDraft(e.target.value)}
              placeholder="e.g. CKA certification"
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (mustHaveDraft.trim()) {
                  setMustHaves([...mustHaves, mustHaveDraft.trim()]);
                  setMustHaveDraft("");
                }
              }}
            >
              Add
            </button>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            {mustHaves.map((m, i) => (
              <span key={i} className="skill-chip" style={{ cursor: "pointer" }} onClick={() => setMustHaves(mustHaves.filter((_, j) => j !== i))}>
                {m} ✕
              </span>
            ))}
          </div>
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
