/**
 * The position, for people who need to understand the role but are not
 * running it.
 *
 * Two audiences ask the same question — "what is this role actually for?" —
 * from opposite sides of the wall. An interviewer is about to spend an hour
 * assessing someone against a brief nobody has shown them. A vendor is being
 * asked to source against it. Both were sent a candidate; neither could open
 * the role. An interviewer holds only `scorecards.submit`, so even the one
 * link that existed returned 403 for exactly the person who most needed it.
 *
 * What the brief LEAVES OUT is the point of having a separate shape:
 *
 *   - the rate band, unless the audience sources against it. A vendor quotes
 *     to it and has always been shown it. An interviewer has no use for it,
 *     and a number in front of someone about to judge a candidate is an
 *     anchor they did not ask for and cannot unsee.
 *   - the release ladder — which agencies hold this role, at which tier, from
 *     when. To a rival vendor that is competitive intelligence about a
 *     commercial relationship they are not party to.
 *   - the release policy and internal authorship.
 *
 * A projection rather than a filter over the full record: fields arrive here
 * only by being named, so a column added to Position later cannot leak by
 * default. That is the same reasoning as the feedback packet in docs/06 §3.
 */

export interface PositionSkillRow {
  level: string;
  proficiency: string | null;
  minYears: number | null;
  skill: { name: string };
}

export interface PositionForBrief {
  id: string;
  reference: string;
  title: string;
  description: string;
  openings: number;
  status: string;
  seniority: string | null;
  employmentType: string;
  locationPolicy: string | null;
  locationText: string | null;
  minTotalYears: number | null;
  mustHaves: unknown;
  rateMin: number | null;
  rateMax: number | null;
  rateCurrency: string;
  ratePeriod: string | null;
  skills: PositionSkillRow[];
  orgUnit?: { name: string } | null;
}

/** Human-readable band, or null when the role has not set one. */
export function rateBand(p: PositionForBrief): string | null {
  if (p.rateMin == null || p.rateMax == null) return null;
  const period = p.ratePeriod ? ` / ${p.ratePeriod}` : "";
  return `${p.rateCurrency} ${p.rateMin}–${p.rateMax}${period}`;
}

export interface BriefOptions {
  /**
   * Include the rate band. True for vendors, who quote against it; false for
   * interviewers, who do not and should not be anchored by it.
   */
  includeRate: boolean;
  /** Shown to the reader so the omission is visible rather than mysterious. */
  audience: "interviewer" | "vendor";
}

export function positionBrief(p: PositionForBrief, opts: BriefOptions) {
  return {
    id: p.id,
    reference: p.reference,
    title: p.title,
    description: p.description,
    openings: p.openings,
    status: p.status,
    seniority: p.seniority,
    employment_type: p.employmentType,
    location_policy: p.locationPolicy,
    location_text: p.locationText,
    min_total_years: p.minTotalYears,
    /** Certifications, visa, languages — screening requirements, not skills. */
    must_haves: (p.mustHaves as string[]) ?? [],
    team: p.orgUnit?.name ?? null,
    skills: p.skills.map((s) => ({
      name: s.skill.name,
      level: s.level,
      proficiency: s.proficiency,
      min_years: s.minYears,
    })),
    rate_band: opts.includeRate ? rateBand(p) : null,
    /**
     * Named rather than silently absent. A reader who cannot see a field is
     * owed the knowledge that it exists — otherwise a redacted brief and a
     * role with no rate band set look identical, and someone eventually
     * reports the wrong bug.
     */
    withheld: [
      ...(opts.includeRate ? [] : ["rate_band"]),
      "vendor_releases",
      "release_policy",
    ],
    audience: opts.audience,
  };
}

/** What `select` the brief needs, so callers cannot forget a field. */
export const BRIEF_SELECT = {
  id: true,
  reference: true,
  title: true,
  description: true,
  openings: true,
  status: true,
  seniority: true,
  employmentType: true,
  locationPolicy: true,
  locationText: true,
  minTotalYears: true,
  mustHaves: true,
  rateMin: true,
  rateMax: true,
  rateCurrency: true,
  ratePeriod: true,
  orgUnit: { select: { name: true } },
  skills: {
    select: {
      level: true,
      proficiency: true,
      minYears: true,
      skill: { select: { name: true } },
    },
  },
} as const;
