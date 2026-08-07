"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";

/**
 * The demo guide (docs/11).
 *
 * Rendered only when NEXT_PUBLIC_DEMO_MODE is on, because a self-hosted
 * production install must never publish a page of working credentials. On a
 * real deployment this route 404s and the landing page does not link it.
 *
 * The org_admin account is deliberately absent. That is presentation, not
 * security — the seed and its password are in a public repository, so anyone
 * determined can find it. What omitting it buys is a demo that stays
 * demonstrable: nothing here invites a visitor into settings, vendor contracts
 * or GDPR erasure, which are the operations that would quietly wreck the tour
 * for the next person.
 */

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "intervu-demo";
const ORG_SLUG = process.env.NEXT_PUBLIC_DEMO_ORG ?? "acme";

interface Persona {
  email: string;
  name: string;
  role: string;
  scope: string;
  /** What this persona is *for* — the thing you cannot see as anyone else. */
  notice: string;
  vendor?: boolean;
  landing: string;
}

const PERSONAS: Persona[] = [
  {
    email: "recruiter@acme.test",
    name: "Riley Recruiter",
    role: "Recruiter",
    scope: "Whole organization",
    notice:
      "The main workflow, and the widest view. Screen submissions, arbitrate duplicate claims, move candidates, record decisions. Start here.",
    landing: "/dashboard",
  },
  {
    email: "hm.eng@acme.test",
    name: "Morgan Hiring Manager",
    role: "Hiring manager",
    scope: "Engineering only",
    notice:
      "The same product with a smaller world. GTM roles are not hidden behind a permission error — they do not exist for this account at all.",
    landing: "/pipeline",
  },
  {
    email: "pm.gtm@acme.test",
    name: "Parker PM",
    role: "Project manager",
    scope: "GTM only",
    notice:
      "Read-only by design: funnel visibility for the teams they run, no hiring actions, and the mirror image of the hiring manager's scope.",
    landing: "/positions",
  },
  {
    email: "interviewer1@acme.test",
    name: "Ingrid Interviewer",
    role: "Interviewer",
    scope: "Assignment only",
    notice:
      "No positions, no pipeline — being on a panel IS the grant. One scorecard is overdue; file it and watch the debrief unseal.",
    landing: "/interviews",
  },
  {
    email: "recruiter@talentbridge.test",
    name: "TalentBridge",
    role: "Vendor · tier 1",
    scope: "Own submissions",
    notice:
      "The other side of the wall. Sees released roles immediately, its own candidates only, and coarse statuses — never a stage name, an interviewer or a scorecard.",
    vendor: true,
    landing: "/vendor",
  },
  {
    email: "recruiter@hireworks.test",
    name: "HireWorks",
    role: "Vendor · tier 2",
    scope: "Own submissions",
    notice:
      "Fewer roles than TalentBridge on the same day. Tiered release is invisible to vendors — a tier-2 agency simply has less to work with, and cannot tell why.",
    vendor: true,
    landing: "/vendor",
  },
];

const TOUR = [
  {
    where: "Analytics → bottom of the page",
    as: "Riley (recruiter)",
    what: "Where hires come from. Cost per hire and 90-day retention say why a cell is empty instead of showing an invented number.",
  },
  {
    where: "Pipeline → the Duplicates view",
    as: "Riley (recruiter)",
    what: "Two agencies claiming the same person, with both timestamps. The system builds the evidence trail; a human decides.",
  },
  {
    where: "Positions → POS-001 → Sourcing channel",
    as: "Riley (recruiter)",
    what: "Try switching it to Direct only. It refuses, and names the vendor-sourced candidates still in flight.",
  },
  {
    where: "My interviews → the overdue scorecard",
    as: "Ingrid (interviewer)",
    what: "Rate some competencies and leave one blank. Blank records as “not assessed”, which the debrief renders differently from a low score.",
  },
  {
    where: "Any open role",
    as: "TalentBridge, then HireWorks",
    what: "Sign in as each in turn. The difference in what they can see is the tiered release ladder.",
  },
];

export default function DemoPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!DEMO_MODE) {
    return (
      <main className="wide">
        <h1>Not available</h1>
        <p className="muted">
          The demo guide is only published on the public demo deployment.
        </p>
        <p>
          <Link href="/login">Sign in</Link>
        </p>
      </main>
    );
  }

  async function signIn(p: Persona) {
    setBusy(p.email);
    setError(null);
    try {
      await api(p.vendor ? "/auth/vendor/login" : "/auth/org/login", {
        method: "POST",
        body: { org_slug: ORG_SLUG, email: p.email, password: PASSWORD },
      });
      router.push(p.landing);
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(null);
    }
  }

  return (
    <main className="wide demo-page">
      <header className="page-head">
        <div>
          <div className="mono-label">Live demo · resets nightly</div>
          <h1 style={{ marginTop: 12 }}>
            Inter<span className="brand-accent">/</span>VU
          </h1>
          <p className="demo-lede">
            An interview and vendor-sourced hiring platform. Organizations post
            roles, staffing agencies submit candidates against them, and the
            system arbitrates who introduced whom — which is what agencies get
            paid on.
          </p>
          <p className="muted demo-sub">
            Everything below is fabricated data. Change it freely: the database
            is rebuilt from scratch every night at 03:00 UTC.
          </p>
        </div>
      </header>

      <SectionHead label="Two doors, one system" />
      <div className="demo-doors">
        <div className="demo-door">
          <div className="mono-label">Internal</div>
          <h3>Organization workspace</h3>
          <p>
            Recruiters, hiring managers and interviewers. Sees everything about
            its own hiring — including which agency introduced a candidate, and
            when.
          </p>
        </div>
        <div className="demo-door">
          <div className="mono-label">External</div>
          <h3>Vendor portal</h3>
          <p>
            Staffing agencies. Sees only its own submissions and a coarse status
            vocabulary. Never a stage name, an interviewer, a scorecard, or
            another agency&rsquo;s existence.
          </p>
        </div>
      </div>

      <SectionHead label="Sign in as" />
      <p className="muted demo-hint">
        One click — no password to type. Every account uses{" "}
        <code>{PASSWORD}</code> if you would rather sign in by hand.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="demo-personas">
        {PERSONAS.map((p) => (
          <div key={p.email} className={`demo-persona${p.vendor ? " vendor" : ""}`}>
            <div className="demo-persona-head">
              <div>
                <strong>{p.name}</strong>
                <div className="mono-label" style={{ marginTop: 4 }}>
                  {p.role} · {p.scope}
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => signIn(p)}
              >
                {busy === p.email ? "Signing in…" : "Sign in"}
              </button>
            </div>
            <p className="demo-notice">{p.notice}</p>
            <code className="demo-email">{p.email}</code>
          </div>
        ))}
      </div>

      <SectionHead label="Worth clicking" />
      <ol className="demo-tour">
        {TOUR.map((t) => (
          <li key={t.where}>
            <div className="demo-tour-where">{t.where}</div>
            <div className="mono-label">as {t.as}</div>
            <p>{t.what}</p>
          </li>
        ))}
      </ol>

      <SectionHead label="Known limits of this demo" />
      <ul className="demo-limits">
        <li>
          <strong>First load is slow.</strong> The demo scales to zero to stay
          free, so the first request after a quiet spell takes tens of seconds
          to wake. It is not broken.
        </li>
        <li>
          <strong>Resume upload is disabled.</strong> No file storage is
          attached; the API says so plainly rather than failing.
        </li>
        <li>
          <strong>No email leaves the building.</strong> Notifications are
          visible in the portal, not delivered.
        </li>
        <li>
          <strong>Administration is not part of the tour.</strong> Org settings,
          vendor contracts and GDPR erasure need an admin account, which this
          page does not hand out — those operations would break the demo for the
          next visitor.
        </li>
      </ul>

      <p className="demo-foot">
        <a href="https://github.com/sajucrajan/interVU">Source on GitHub</a> ·{" "}
        <Link href="/login">Sign in normally</Link> ·{" "}
        <Link href="/vendor/login">Vendor portal</Link>
      </p>
    </main>
  );
}
