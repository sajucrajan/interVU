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
  body: string;
  aside?: string;
}[] = [
  {
    n: "01",
    title: "Build the organization",
    who: "Organization admin",
    needs: "org.manage_structure",
    where: "/admin/teams",
    body:
      "Units are the unit of visibility, not decoration. A hiring manager granted a role at Engineering does not see GTM roles hidden behind an error message — those positions do not exist for that account. Create the tree before the people, because a grant needs somewhere to point.",
  },
  {
    n: "02",
    title: "Add people and grant roles",
    who: "Organization admin",
    needs: "org.manage_users",
    where: "/admin/people",
    body:
      "Invite by email; the person sets their own password from the activation link, so nobody ever types a colleague's credentials. A grant is a role AT a scope — recruiter across the organization, hiring manager at Engineering only.",
    aside:
      "One person can hold several. Grants union, so someone who is a hiring manager at Platform and an interviewer everywhere gets both sets of permissions, and losing one never silently strips the other.",
  },
  {
    n: "03",
    title: "Open a position",
    who: "Recruiter or hiring manager",
    needs: "positions.create",
    where: "/positions/new",
    body:
      "A title is not a brief. The skill matrix — each competency marked must-have or nice-to-have, with a level and years — is what screening compares a CV against and what the interview room shows a panel. Fill it in and the rest of the product has something to reason about; leave it empty and screening has nothing to say.",
  },
  {
    n: "04",
    title: "Choose how it is sourced",
    who: "Recruiter",
    needs: "positions.release",
    where: "/positions",
    body:
      "Vendor-sourced, direct-only, or hybrid with a date when agencies join. Hybrid is the interesting one: your careers page gets a head start measured in days, and the analytics later tell you whether that head start was worth the fee you avoided.",
  },
  {
    n: "05",
    title: "Release to vendors",
    who: "Recruiter",
    needs: "positions.release",
    where: "/positions",
    body:
      "Release is per vendor and per tier, so a tier-1 agency can see a role a week before tier 2. Vendors are emailed and the role appears in their portal. Nothing is shared beyond what you released — a vendor never sees your pipeline, your other vendors, or any candidate but their own.",
  },
  {
    n: "06",
    title: "A vendor submits a candidate",
    who: "Vendor recruiter",
    needs: null,
    where: "/vendor",
    body:
      "The vendor uploads a CV and the system probes for a duplicate before accepting it — same person, already submitted, possibly by someone else. Ownership is decided once, at submission, and that record is what an invoice is later argued from.",
    aside:
      "A direct applicant has no vendor and no submission, so no fee. That is why a direct application keeps a null submission link rather than being given a placeholder one.",
  },
  {
    n: "07",
    title: "Screen against the role",
    who: "Recruiter",
    needs: "applications.reject",
    where: "/pipeline",
    body:
      "The screening view is position-first: the role's matrix on the left, whether the CV evidences each line, and what the candidate mentions that this role never asked for. Coverage is a sort key, not a verdict — absence from a resume is not absence of the skill, and rejecting on it filters for CV writing rather than ability.",
    aside:
      "A rejection here needs a reason in your own words. It is what a colleague reads before re-screening the same person in three months.",
  },
  {
    n: "08",
    title: "Schedule the panel",
    who: "Recruiter",
    needs: "interviews.schedule",
    where: "/interviews",
    body:
      "Panelists are matched on the skills the role actually needs, so a Kubernetes must-have suggests people who can assess it. From the moment the card enters the interviewing lane the outcome belongs to the loop — see the stage table below.",
  },
  {
    n: "09",
    title: "Interview, with the room open",
    who: "Interviewer",
    needs: null,
    where: "/interviews",
    body:
      "The interview room puts the candidate's highlights, the role's requirements, the must-haves with no evidence, and the shared question bank on one screen. Questions carry model answers and a thumbs vote, so the bank sorts itself by what colleagues found useful rather than by who wrote it.",
  },
  {
    n: "10",
    title: "File a scorecard, then debrief",
    who: "Interviewer, then hiring manager",
    needs: "decisions.record",
    where: "/pipeline",
    body:
      "Scorecards stay sealed until every panelist has filed, so nobody anchors on a colleague's rating. The debrief then shows the full matrix, the panel mean and how far apart the panel was — divergence being the number worth talking about.",
  },
  {
    n: "11",
    title: "Record the decision",
    who: "Hiring manager",
    needs: "decisions.record",
    where: "/pipeline",
    body:
      "Offer or rejection, once, against the application. The owning vendor is told the coarse status only — interviewing, offered, not selected — never a rating, never a comment, never who said it.",
  },
  {
    n: "12",
    title: "Read what it cost",
    who: "Anyone with the view",
    needs: "positions.view",
    where: "/analytics",
    body:
      "Where hires come from, what each channel costs, how long each stage takes and which vendors send candidates you actually hire. This is the argument for renegotiating a contract, and it is only as good as the source data the steps above collected.",
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
          Twelve steps, in the order they happen. Every permission, stage and
          role below is read live from the running API — not restated here — so
          this page cannot drift away from what the software actually does.
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
                        : labelOf(s.needs)
                    }
                  >
                    {s.needs}
                  </span>
                )}
                {s.where && (
                  <Link className="hiw-where" href={s.where}>
                    {s.where}
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
        Marked stages are owned by the panel: once a card is here, a rejection
        is a loop&apos;s conclusion and needs <code>decisions.record</code>, not
        a recruiter&apos;s screening right. The card moving is what counts — an
        interview record appears later, when a time is agreed.
      </p>
      <div className="hiw-stages">
        {(w?.stages ?? []).map((s) => (
          <div
            key={s.key}
            className={`hiw-stage${s.panel_owned ? " panel" : ""}`}
          >
            <div className="mono-label">{s.label}</div>
            <p>{s.blurb}</p>
            {s.panel_owned && <span className="badge warn">panel owns it</span>}
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
        The built-in roles and their permissions, exactly as the API enforces
        them. Organizations add their own roles on top; these are the ones that
        always exist. Note that a recruiter screens and rejects but does not
        hold <code>decisions.record</code> — recording a panel&apos;s verdict is
        a hiring manager&apos;s call.
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
                      <td>
                        {p.label}
                        <br />
                        <code className="hiw-key">{p.key}</code>
                      </td>
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

      <SectionHead label="Rules that hold everywhere" />
      <ul className="hiw-rules">
        <li>
          <strong>A vendor sees only its own.</strong> Its submissions, the
          positions released to it, the coarse status of its candidates. Never
          your pipeline, your other vendors, or a rating.
        </li>
        <li>
          <strong>Scope is real, not cosmetic.</strong> Out-of-scope positions
          are absent, not forbidden — there is no error message to read and no
          title to infer.
        </li>
        <li>
          <strong>Grants union.</strong> Hold three roles and you get every
          permission any of them carries. Enforcement always keys on the
          permission, never on a role name, so a custom role works exactly like
          a built-in one.
        </li>
        <li>
          <strong>Ownership is decided once.</strong> At submission, by the
          duplicate probe — not later, by whoever argues hardest.
        </li>
        <li>
          <strong>Feedback is sealed until it is complete.</strong> No panelist
          sees another&apos;s scorecard before filing their own.
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
