import Link from "next/link";
import { SectionHead } from "@/components/section-head";

/**
 * The role, read-only, for someone who is not running it.
 *
 * Shared by the interviewer view and the vendor portal because they are the
 * same document: what the job is, what it needs, what would make someone
 * right for it. They differ in one field — the rate band, which a vendor
 * quotes against and an interviewer should never be anchored by — and that
 * difference is decided by the API, not here. A component that decided its
 * own redaction would be a second place for the rule to be wrong.
 *
 * Deliberately not the 800-line editing surface at /positions/[id]. Nothing
 * here is editable, so none of that machinery applies, and threading a
 * redacted shape through it would put "can this reader see this?" inside
 * every one of its branches.
 */

export interface Brief {
  reference: string;
  title: string;
  description: string;
  openings?: number;
  status?: string;
  seniority: string | null;
  employment_type: string;
  location_policy: string | null;
  location_text: string | null;
  min_total_years: number | null;
  must_haves: string[];
  rate_band: string | null;
  skills: {
    name: string;
    level: string;
    proficiency: string | null;
    min_years: number | null;
  }[];
  /** Interviewer view only. */
  team?: string | null;
  withheld?: string[];
  /** Vendor view only. */
  organization?: string;
  released_at?: string;
}

const nice = (s: string | null | undefined) =>
  s ? s.replaceAll("_", " ") : null;

export function PositionBriefView({
  brief,
  backHref,
  backLabel,
}: {
  brief: Brief;
  backHref: string;
  backLabel: string;
}) {
  const musts = brief.skills.filter((s) => s.level === "must_have");
  const nice_to = brief.skills.filter((s) => s.level !== "must_have");
  const facts: [string, string | null][] = [
    ["Seniority", nice(brief.seniority)],
    ["Employment", nice(brief.employment_type)],
    [
      "Location",
      [nice(brief.location_policy), brief.location_text].filter(Boolean).join(" · ") ||
        null,
    ],
    ["Experience", brief.min_total_years ? `${brief.min_total_years}+ years` : null],
    ["Openings", brief.openings ? String(brief.openings) : null],
    ["Team", brief.team ?? null],
    ["Rate band", brief.rate_band],
  ];

  return (
    <main className="wide brief-page">
      <header className="page-head">
        <div>
          <div className="mono-label">
            <span className="ref-code">{brief.reference}</span>
            {brief.organization ? ` · ${brief.organization}` : ""}
          </div>
          <h1 style={{ marginTop: 12 }}>{brief.title}</h1>
        </div>
      </header>

      <dl className="brief-facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="mono-label">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>

      {brief.description && (
        <>
          <SectionHead label="About the role" />
          <div className="brief-jd">
            <pre>{brief.description}</pre>
          </div>
        </>
      )}

      {musts.length > 0 && (
        <>
          <SectionHead label="Must have" />
          <ul className="brief-skills">
            {musts.map((s) => (
              <li key={s.name}>
                <span className="skill-chip must">{s.name}</span>
                <span className="muted">
                  {[nice(s.proficiency), s.min_years ? `${s.min_years}y` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {nice_to.length > 0 && (
        <>
          <SectionHead label="Nice to have" />
          <div className="room-chips">
            {nice_to.map((s) => (
              <span key={s.name} className="skill-chip">
                {s.name}
              </span>
            ))}
          </div>
        </>
      )}

      {brief.must_haves.length > 0 && (
        <>
          <SectionHead label="Screening requirements" />
          <ul className="room-list">
            {brief.must_haves.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}

      {/* Named, not silently missing. Otherwise a reader cannot tell a
          withheld band from a role that never set one, and the honest answer
          — "this exists and is not yours to see" — is more useful than a
          gap. */}
      {brief.withheld?.includes("rate_band") && (
        <p className="muted brief-withheld">
          The rate band and the vendor release schedule are not shown here.
          They are commercial detail, and neither changes how you assess
          somebody.
        </p>
      )}

      <p className="muted brief-back">
        <Link href={backHref}>← {backLabel}</Link>
      </p>
    </main>
  );
}
