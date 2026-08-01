"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface SkillRow {
  name: string;
  level: "must_have" | "good_to_have";
  proficiency: "awareness" | "working" | "proficient" | "expert";
  min_years: string;
}

export const emptySkill = (): SkillRow => ({
  name: "",
  level: "must_have",
  proficiency: "working",
  min_years: "",
});

/** Wire format for the API — drops blank rows and coerces years. */
export function toSkillPayload(rows: SkillRow[]) {
  return rows
    .filter((s) => s.name.trim())
    .map((s) => ({
      name: s.name.trim(),
      level: s.level,
      proficiency: s.proficiency,
      min_years: s.min_years ? Number(s.min_years) : null,
    }));
}

/** Existing API rows → editable rows. */
export function fromSkillRecords(
  records: { level: string; proficiency: string; minYears: number | null; skill: { name: string } }[],
): SkillRow[] {
  if (records.length === 0) return [emptySkill()];
  return records.map((s) => ({
    name: s.skill.name,
    level: s.level as SkillRow["level"],
    proficiency: s.proficiency as SkillRow["proficiency"],
    min_years: s.minYears != null ? String(s.minYears) : "",
  }));
}

/** The org's skill taxonomy, for autocomplete. */
export function useKnownSkills(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    api<{ name: string }[]>("/skills")
      .then((s) => setNames(s.map((x) => x.name)))
      .catch(() => undefined);
  }, []);
  return names;
}

/**
 * Editable skill matrix. Importance (must / nice) and required proficiency are
 * separate axes — panel matching weights the first, interviewers assess
 * against the second (docs/01).
 */
export function SkillMatrixEditor({
  rows,
  onChange,
  knownSkills,
  listId = "known-skills",
}: {
  rows: SkillRow[];
  onChange: (rows: SkillRow[]) => void;
  knownSkills: string[];
  listId?: string;
}) {
  const setRow = (i: number, patch: Partial<SkillRow>) =>
    onChange(rows.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <>
      {rows.map((s, i) => (
        <div className="row" key={i} style={{ marginBottom: "0.4rem" }}>
          <div style={{ flex: 2, minWidth: 170 }}>
            <input
              list={listId}
              value={s.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              placeholder="Skill (e.g. Kubernetes)"
            />
          </div>
          <select
            style={{ width: 145 }}
            value={s.level}
            onChange={(e) => setRow(i, { level: e.target.value as SkillRow["level"] })}
          >
            <option value="must_have">Must-have</option>
            <option value="good_to_have">Good-to-have</option>
          </select>
          <select
            style={{ width: 130 }}
            value={s.proficiency}
            onChange={(e) =>
              setRow(i, { proficiency: e.target.value as SkillRow["proficiency"] })
            }
          >
            {["awareness", "working", "proficient", "expert"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            style={{ width: 85 }}
            type="number"
            min={0}
            placeholder="yrs"
            value={s.min_years}
            onChange={(e) => setRow(i, { min_years: e.target.value })}
          />
          <button
            type="button"
            className="secondary"
            aria-label={`Remove ${s.name || "skill"}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <datalist id={listId}>
        {knownSkills.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <button
        type="button"
        className="secondary"
        onClick={() => onChange([...rows, emptySkill()])}
      >
        + Add skill
      </button>
    </>
  );
}

/** Non-skill screening requirements: certifications, work authorization, … */
export function MustHavesEditor({
  values,
  onChange,
  placeholder = "e.g. CKA certification",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...values, draft.trim()]);
    setDraft("");
  };
  return (
    <>
      <div className="row">
        <input
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className="secondary" onClick={add}>
          Add
        </button>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        {values.map((m, i) => (
          <span
            key={i}
            className="skill-chip"
            style={{ cursor: "pointer" }}
            title="Remove"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            {m} ✕
          </span>
        ))}
      </div>
    </>
  );
}
