"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { SectionHead } from "@/components/section-head";

/**
 * How InterVU works, end to end.
 *
 * Not demo-gated, unlike /demo. That page publishes working credentials and
 * must never appear on a real install; this one explains the product, which a
 * self-hosted team wants MORE than a visitor does — it is the page you send
 * someone on their first day.
 *
 * The maintenance problem is the whole design. A walkthrough written as prose
 * is accurate the day it ships and quietly wrong forever after: someone moves
 * a permission between roles, renames a stage, adds a sourcing mode, and this
 * page keeps confidently describing the old shape. Nothing fails, nobody
 * notices, and the explanation of who-can-do-what becomes actively misleading.
 *
 * So every factual claim here is fetched from /meta/workflow, which the API
 * generates from the same constants it enforces. The lifecycle, the sourcing
 * modes, the permission list and the role matrix are all live. The narrative
 * around them is written by a person, and `how-it-works.test.ts` fails the
 * build if it names a permission or route that no longer exists.
 */

interface Workflow {
  stages: { key: string; label: string; blurb: string; panel_owned: boolean }[];
  sourcing_modes: { key: string; label: string; blurb: string }[];
  permission_groups: {
    group: string;
    permissions: { key: string; label: string }[];
  }[];
  roles: {
    key: string;
    name: string;
    description: string;
    permissions: string[];
  }[];
}

/**
 * The narrative. Each step names the permission it needs and the screen it
 * happens on, both checked against the live data below — a step whose
 * permission has been renamed renders with a visible warning rather than a
 * confident falsehood.
 */
const STEPS: {
  n: string;
  title: string;
  who: string;
  needs: string | null;
  where: string | null;
  /** What the screen is called in the app, for the link text. */
  screen: string | null;
  body: string;
  aside?: string;
}[] = [
  {
    n: "01",
    title: "Set up your teams",
    who: "Organization admin",
    needs: "org.manage_structure",
    where: "/admin/teams",
    screen: "Admin → Teams",
    body:
      "Add your departments and teams, for example Engineering with Platform and Data under it. This matters because people see only the teams they are given: a hiring manager for Engineering sees Engineering's roles and candidates, and nothing from Sales. Set up the teams first, so that when you add people you can say which team each one works in.",
  },
  {
    n: "02",
    title: "Add people and give them roles",
    who: "Organization admin",
    needs: "org.manage_users",
    where: "/admin/people",
    screen: "Admin → People & access",
    body:
      "Invite each person by email; they choose their own password from the link they receive. Then give them a role and say where it applies: a recruiter across the whole company, or a hiring manager for Engineering only.",
    aside:
      "Someone can have more than one role, and gets everything each role allows. Removing one role never takes away what another one gives.",
  },
  {
    n: "03",
    title: "Open a position",
    who: "Recruiter",
    needs: "positions.create",
    where: "/positions/new",
    screen: "Positions → New",
    body:
      "Describe the role, including the skills it needs: which are essential, which are nice to have, at what level and for how many years. Those skills are what candidates are screened against later and what interviewers are asked to assess, so the more complete they are, the more useful the rest of the product becomes.",
  },
  {
    n: "04",
    title: "Decide who can find candidates",
    who: "Recruiter",
    needs: "positions.release",
    where: "/positions",
    screen: "Positions",
    body:
      "Choose one of three ways: only through agencies, only through your own careers page and referrals, or both — your own channels first, with agencies joining on a date you set. Analytics later shows whether hiring directly saved you agency fees.",
  },
  {
    n: "05",
    title: "Share the role with agencies",
    who: "Recruiter",
    needs: "positions.release",
    where: "/positions",
    screen: "Positions",
    body:
      "Choose which agencies see the role, and when. Your preferred agencies can see it first and the others a few days later. Each agency is emailed and the role appears in its portal. An agency only ever sees the roles you shared with it and the candidates it sent — never your other agencies or your internal notes.",
  },
  {
    n: "06",
    title: "An agency submits a candidate",
    who: "Agency recruiter",
    needs: null,
    where: "/vendor",
    screen: "Agency portal",
    body:
      "The agency enters the candidate's details and CV. InterVU checks straight away whether this person is already in your pipeline, even under a slightly different name or email. The first agency to submit a person for a role is recorded as the one who introduced them — the record you rely on if an agency fee is ever disputed.",
    aside:
      "People who apply directly have no agency attached, so no fee is owed for them.",
  },
  {
    n: "07",
    title: "Screen the candidate",
    who: "Recruiter",
    needs: "applications.reject",
    where: "/pipeline",
    screen: "Pipeline",
    body:
      "The screening view puts the role's required skills next to the candidate's CV and shows which ones the CV mentions. Use it to decide who to interview first, not as an automatic filter: a skill missing from a CV is not proof the person lacks it.",
    aside:
      "If you reject someone here, write a short reason. Whoever looks at this person next — perhaps for another role — will read it.",
  },
  {
    n: "08",
    title: "Schedule the interviews",
    who: "Recruiter",
    needs: "interviews.schedule",
    where: "/pipeline",
    screen: "Pipeline",
    body:
      "Pick a time and the interviewers. InterVU suggests interviewers who know the skills the role needs. Once a candidate reaches the interview stage, the final decision belongs to the hiring manager, not to the recruiter alone.",
  },
  {
    n: "09",
    title: "Run the interview",
    who: "Interviewer",
    needs: null,
    where: "/interviews",
    screen: "My interviews",
    body:
      "Each interviewer opens the interview from My interviews. One screen shows the candidate's CV, what the role requires, which essential skills the CV doesn't show yet, and suggested questions from a shared question bank. Interviewers vote on questions, so the most useful ones rise to the top.",
  },
  {
    n: "10",
    title: "File scorecards and compare them",
    who: "Interviewers, then the hiring manager",
    needs: "decisions.record",
    where: "/pipeline",
    screen: "Pipeline → Debrief",
    body:
      "Each interviewer files a scorecard. Nobody can read a colleague's scorecard until they have filed their own, so no one is swayed by what others wrote. The hiring manager then sees all the scores side by side, including where the interviewers disagreed most — usually the thing worth discussing.",
  },
  {
    n: "11",
    title: "Make the decision",
    who: "Hiring manager",
    needs: "decisions.record",
    where: "/pipeline",
    screen: "Pipeline",
    body:
      "Record an offer or a rejection. The agency that sent the candidate sees only a simple status — interviewing, offered or not selected. It never sees scores, comments or who said what.",
  },
  {
    n: "12",
    title: "See what worked",
    who: "Anyone who can view positions",
    needs: "positions.view",
    where: "/analytics",
    screen: "Analytics",
    body:
      "See where your hires came from, how long each stage takes, and which agencies send candidates you actually hire. Useful when it is time to review an agency contract.",
  },
];

export default function HowItWorksPage() {
  const [w, setW] = useState<Workflow | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<Workflow>("/meta/workflow")
      .then(setW)
      .catch(() => setFailed(true));
  }, []);

  const known = new Set(
    (w?.permission_groups ?? []).flatMap((g) => g.permissions.map((p) => p.key)),
  );
  const labelOf = (key: string) =>
    w?.permission_groups
      .flatMap((g) => g.permissions)
      .find((p) => p.key === key)?.label ?? key;

  return (
    <main className="wide hiw-page">
      <header className="hiw-hero">
        <div className="mono-label">InterVU · how it works</div>
        <h1>From an open role to a signed offer</h1>
        <p className="hiw-lede">
          The twelve steps of hiring in InterVU, in the order they happen: who
          does each one, and where in the app. The tables further down are
          taken straight from the running system, so they always match what
          each role can really do.
        </p>
        <p className="muted hiw-sub">
          <Link href="/demo">Try it with a real account →</Link>
        </p>
      </header>

      {failed && (
        <p className="badge warn hiw-offline">
          The API is not reachable, so the live tables below are missing. The
          steps still describe the flow; the permission and role detail comes
          from <code>/meta/workflow</code>.
        </p>
      )}

      <SectionHead label="The path a candidate takes" />
      <ol className="hiw-steps">
        {STEPS.map((s) => (
          <li key={s.n} className="hiw-step">
            <div className="hiw-step-n mono-label">{s.n}</div>
            <div className="hiw-step-body">
              <h3>{s.title}</h3>
              <div className="hiw-step-meta">
                <span className="badge">{s.who}</span>
                {s.needs && (
                  <span
                    className={`badge ${
                      w && !known.has(s.needs) ? "bad" : "ok"
                    }`}
                    title={
                      w && !known.has(s.needs)
                        ? "This permission no longer exists — the page is out of date."
                        : `Permission: ${s.needs}`
                    }
                  >
                    {/* The permission's own label, as the role editor shows
                        it — the code behind it is in the tooltip. */}
                    Needs: {labelOf(s.needs)}
                  </span>
                )}
                {s.where && (
                  <Link className="hiw-where" href={s.where}>
                    {s.screen ?? s.where}
                  </Link>
                )}
              </div>
              <p>{s.body}</p>
              {s.aside && <p className="muted hiw-aside">{s.aside}</p>}
            </div>
          </li>
        ))}
      </ol>

      <SectionHead label="The pipeline" />
      <p className="muted hiw-note">
        Every candidate moves through these stages. From the interview stage
        on (marked below), only someone allowed to record hiring decisions —
        usually the hiring manager — can reject the candidate. Before that, a
        recruiter can turn someone down at screening.
      </p>
      <div className="hiw-stages">
        {(w?.stages ?? []).map((s) => (
          <div
            key={s.key}
            className={`hiw-stage${s.panel_owned ? " panel" : ""}`}
          >
            <div className="mono-label">{s.label}</div>
            <p>{s.blurb}</p>
            {s.panel_owned && (
              <span className="badge warn">hiring manager decides</span>
            )}
          </div>
        ))}
      </div>

      <SectionHead label="How a role reaches candidates" />
      <div className="hiw-modes">
        {(w?.sourcing_modes ?? []).map((m) => (
          <div key={m.key} className="hiw-mode">
            <div className="mono-label">{m.label}</div>
            <p>{m.blurb}</p>
          </div>
        ))}
      </div>

      <SectionHead label="Who can do what" />
      <p className="muted hiw-note">
        What each built-in role is allowed to do. Your organization can also
        create its own roles. Notice that a recruiter can screen and turn
        people down early, but the final hire-or-not decision after interviews
        belongs to the hiring manager.
      </p>
      {w && (
        <div className="hiw-matrix-scroll">
          <table className="data hiw-matrix">
            <thead>
              <tr>
                <th>Permission</th>
                {w.roles.map((r) => (
                  <th key={r.key} title={r.description}>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {w.permission_groups.map((g) => (
                <Fragment key={g.group}>
                  <tr className="hiw-group">
                    <td colSpan={w.roles.length + 1}>
                      <span className="mono-label">{g.group}</span>
                    </td>
                  </tr>
                  {g.permissions.map((p) => (
                    <tr key={p.key}>
                      <td title={p.key}>{p.label}</td>
                      {w.roles.map((r) => (
                        <td key={r.key} className="hiw-cell">
                          {r.permissions.includes(p.key) ? (
                            <span className="hiw-yes" aria-label="yes">
                              ●
                            </span>
                          ) : (
                            <span className="hiw-no" aria-label="no">
                              ·
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionHead label="Five things that are always true" />
      <ul className="hiw-rules">
        <li>
          <strong>Agencies see only their own work.</strong> The roles you
          shared with them, the candidates they sent, and a simple status for
          each. Never your other agencies, your internal notes or anyone&apos;s
          scores.
        </li>
        <li>
          <strong>People see only their own teams.</strong> Roles and candidates
          from other teams don&apos;t appear at all — not even as a locked item.
        </li>
        <li>
          <strong>Several roles add up.</strong> Someone with two roles can do
          everything either role allows.
        </li>
        <li>
          <strong>The first agency to submit a candidate is on record.</strong>{" "}
          That is settled the moment they submit, so there is nothing to argue
          about later.
        </li>
        <li>
          <strong>Interviewers can&apos;t copy each other.</strong> No one sees a
          colleague&apos;s scorecard until they have filed their own.
        </li>
      </ul>

      <p className="muted hiw-foot">
        Deeper detail lives in the repository:{" "}
        <code>docs/01-requirements.md</code> for the model,{" "}
        <code>docs/09-entitlements.md</code> for permissions, and{" "}
        <code>docs/12-deployment-walkthrough.md</code> for running your own.
      </p>
    </main>
  );
}
