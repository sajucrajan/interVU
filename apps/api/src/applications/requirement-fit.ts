/**
 * Comparing a resume against a position's skill matrix.
 *
 * Extracted from the interview room so screening can use the same comparison.
 * They are the same question asked at two moments — "what does this role need,
 * and does this CV show it?" — and two implementations would drift until a
 * candidate screened out on one basis and interviewed on another.
 *
 * The vocabulary is the ORGANIZATION's own `skill` rows rather than a
 * hardcoded technology list, so this stays correct as their stack changes
 * without anyone maintaining a second list.
 */

export interface SkillRef {
  id: string;
  name: string;
  nameNorm: string;
}

export interface PositionSkillRef {
  level: string;
  proficiency?: string | null;
  minYears?: number | null;
  skill: SkillRef;
}

/**
 * Whole-token match.
 *
 * Substring matching turns "R" into a hit on "React" and "Go" into a hit on
 * "MongoDB". An interviewer — or a screener — who stops trusting the chips
 * stops reading the gaps too, so a false positive costs more than a miss.
 * `+`, `#` and `.` count as word characters so "C++", "C#" and ".NET" survive.
 */
export function mentions(text: string, nameNorm: string): boolean {
  if (!text || !nameNorm) return false;
  const escaped = nameNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i").test(text);
}

export function requirementFit(
  text: string,
  positionSkills: PositionSkillRef[],
  vocabulary: SkillRef[],
) {
  const found = new Set(
    vocabulary.filter((s) => mentions(text, s.nameNorm)).map((s) => s.id),
  );

  const required = positionSkills.map((ps) => ({
    skill_id: ps.skill.id,
    name: ps.skill.name,
    must_have: ps.level === "must_have",
    proficiency: ps.proficiency ?? null,
    min_years: ps.minYears ?? null,
    /** Present in the resume text. Evidence of mention, not of ability. */
    evidenced: found.has(ps.skill.id),
  }));

  return {
    required,
    /**
     * Must-haves the CV never mentions. The most useful line to put in front
     * of someone before they screen or interview — and explicitly a place to
     * ask, not a reason to reject: absence from a resume is not absence of
     * the skill, and rejecting on it would filter for CV-writing.
     */
    gaps: required.filter((r) => r.must_have && !r.evidenced),
    /** Technologies present that this role never asked for. */
    extra: vocabulary
      .filter(
        (s) => found.has(s.id) && !positionSkills.some((ps) => ps.skill.id === s.id),
      )
      .map((s) => ({ skill_id: s.id, name: s.name })),
    /** How much of the matrix is evidenced at all — a coarse sort key. */
    coverage: required.length
      ? Math.round((required.filter((r) => r.evidenced).length / required.length) * 100)
      : null,
  };
}

/** Common resume headings, so the text arrives in blocks rather than a wall. */
const HEADINGS =
  /^\s*(professional\s+)?(experience|employment|work\s+history|education|skills?|technical\s+skills?|projects?|certifications?|summary|profile|objective|achievements?|publications?)\s*:?\s*$/i;

export function sections(text: string): { heading: string | null; body: string }[] {
  if (!text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const out: { heading: string | null; body: string[] }[] = [
    { heading: null, body: [] },
  ];
  for (const line of lines) {
    if (HEADINGS.test(line)) out.push({ heading: line.trim(), body: [] });
    else out[out.length - 1]!.body.push(line);
  }
  return out
    .map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }))
    .filter((s) => s.body.length > 0 || s.heading);
}
