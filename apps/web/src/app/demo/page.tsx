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
 * The artwork is inline SVG and CSS built from the SAME tokens as the product
 * — not screenshots. Screenshots of a UI still under active design go stale
 * silently and start lying about what the app looks like; these re-read the
 * theme, so they follow the accent and dark mode for free.
 *
 * The org_admin account is deliberately absent. That is presentation, not
 * security — the seed and its password are in a public repository — but it
 * keeps the demo demonstrable: nothing here invites a visitor into settings,
 * vendor contracts or GDPR erasure, the operations that would quietly wreck
 * the tour for whoever arrives next.
 */

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "intervu-demo";
const ORG_SLUG = process.env.NEXT_PUBLIC_DEMO_ORG ?? "acme";

interface Persona {
  email: string;
  name: string;
  role: string;
  scope: string;
  notice: string;
  vendor?: boolean;
  landing: string;
}

/** Internal staff. Ordered widest scope first — the natural place to start. */
const ORG_PERSONAS: Persona[] = [
  {
    email: "recruiter@acme.test",
    name: "Riley Recruiter",
    role: "Recruiter",
    scope: "Whole organization",
    notice:
      "The main workflow and the widest view. Screen submissions, arbitrate duplicate claims, move candidates, record decisions.",
    landing: "/dashboard",
  },
  {
    email: "hm.eng@acme.test",
    name: "Morgan Hiring Manager",
    role: "Hiring manager",
    scope: "Engineering only",
    notice:
      "The same product with a smaller world. GTM roles are not hidden behind a permission error — they do not exist for this account.",
    landing: "/pipeline",
  },
  {
    email: "pm.gtm@acme.test",
    name: "Parker PM",
    role: "Project manager",
    scope: "GTM only",
    notice:
      "Read-only by design: funnel visibility for the teams they run, no hiring actions. The mirror image of Morgan's scope.",
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
];

/** External agencies. The tier difference is the point of having two. */
const VENDOR_PERSONAS: Persona[] = [
  {
    email: "recruiter@talentbridge.test",
    name: "TalentBridge",
    role: "Agency · tier 1",
    scope: "Own submissions",
    notice:
      "Sees released roles immediately, its own candidates only, and coarse statuses — never a stage name, an interviewer or a scorecard.",
    vendor: true,
    landing: "/vendor",
  },
  {
    email: "recruiter@hireworks.test",
    name: "HireWorks",
    role: "Agency · tier 2",
    scope: "Own submissions",
    notice:
      "Fewer roles than TalentBridge on the same day. Tiers are invisible to vendors — a tier-2 agency simply has less to work with.",
    vendor: true,
    landing: "/vendor",
  },
  {
    email: "recruiter@staffpro.test",
    name: "StaffPro",
    role: "Agency · tier 2",
    scope: "Own submissions",
    notice:
      "The third agency in the duplicate contests. Two vendors claiming the same person is what ownership arbitration exists to settle.",
    vendor: true,
    landing: "/vendor",
  },
];

const TOUR = [
  {
    where: "Analytics → bottom of the page",
    as: "Riley",
    what: "Where hires come from. Cost per hire and 90-day retention say why a cell is empty instead of inventing a number.",
  },
  {
    where: "Pipeline → the Duplicates view",
    as: "Riley",
    what: "Two agencies claiming the same person, with both timestamps. The system builds the evidence; a human decides.",
  },
  {
    where: "Positions → POS-001 → Sourcing channel",
    as: "Riley",
    what: "Try switching it to Direct only. It refuses, and names the vendor-sourced candidates still in flight.",
  },
  {
    where: "My interviews → the overdue scorecard",
    as: "Ingrid",
    what: "Rate some competencies, leave one blank. Blank records as “not assessed”, which the debrief renders differently from a low score.",
  },
  {
    where: "The same open role, twice",
    as: "TalentBridge, then HireWorks",
    what: "Sign in as each in turn. The difference in what they can see is the tiered release ladder.",
  },
];

/**
 * The core mechanic, drawn. Two agencies introduce the same candidate; the
 * system decides who owns the introduction, because that is what an agency
 * invoices for. Prose took a paragraph and still lost people.
 */
function OwnershipDiagram() {
  return (
    <svg
      className="demo-diagram"
      viewBox="0 0 720 210"
      role="img"
      aria-label="Two agencies submit the same candidate; the earlier submission wins ownership, the later one is flagged as a duplicate."
    >
      <defs>
        <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--warn)" strokeWidth="1.4" opacity="0.5" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
        </marker>
      </defs>

      {/* Two agencies, same candidate */}
      <g className="d-box">
        <rect x="4" y="18" width="176" height="56" rx="7" />
        <text x="20" y="42" className="d-title">TalentBridge</text>
        <text x="20" y="60" className="d-meta">submits Jane · 09:14</text>
      </g>
      <g className="d-box">
        <rect x="4" y="118" width="176" height="56" rx="7" />
        <text x="20" y="142" className="d-title">StaffPro</text>
        <text x="20" y="160" className="d-meta">submits Jane · 14:02</text>
      </g>

      <path d="M186 46 L250 46 L250 88 L292 88" className="d-line" markerEnd="url(#arrow)" />
      <path d="M186 146 L250 146 L250 108 L292 108" className="d-line" markerEnd="url(#arrow)" />

      {/* Arbitration */}
      <g className="d-box accent">
        <rect x="298" y="66" width="150" height="64" rx="7" />
        <text x="373" y="92" className="d-title mid">Ownership</text>
        <text x="373" y="110" className="d-meta mid">earliest valid wins</text>
      </g>

      <path d="M454 84 L516 62" className="d-line" markerEnd="url(#arrow)" />
      <path d="M454 112 L516 134" className="d-line" markerEnd="url(#arrow)" />

      {/* Outcomes */}
      <g className="d-box ok">
        <rect x="522" y="28" width="194" height="56" rx="7" />
        <text x="540" y="52" className="d-title">Owned · TalentBridge</text>
        <text x="540" y="70" className="d-meta">enters the pipeline</text>
      </g>
      <g className="d-box warn">
        <rect x="522" y="112" width="194" height="56" rx="7" fill="url(#hatch)" />
        <rect x="522" y="112" width="194" height="56" rx="7" fill="none" />
        <text x="540" y="136" className="d-title">Duplicate · StaffPro</text>
        <text x="540" y="154" className="d-meta">flagged with evidence</text>
      </g>
    </svg>
  );
}

/** Abstractions of three real screens, drawn with the product's own tokens. */
function ScreenPreviews() {
  return (
    <div className="demo-screens">
      <figure className="demo-screen">
        <div className="demo-screen-art board">
          {[
            { h: [70, 44, 58], tone: "" },
            { h: [52, 66], tone: "warn" },
            { h: [60, 38, 48, 30], tone: "" },
            { h: [46], tone: "bad" },
          ].map((col, i) => (
            <div key={i} className="mini-col">
              <span className="mini-head" />
              {col.h.map((h, j) => (
                <span key={j} className={`mini-card ${col.tone}`} style={{ height: h }} />
              ))}
            </div>
          ))}
        </div>
        <figcaption>
          <strong>Pipeline</strong> — candidates by stage, aging in view, WIP caps
          per column.
        </figcaption>
      </figure>

      <figure className="demo-screen">
        <div className="demo-screen-art chart">
          {[86, 62, 71, 40, 55, 33, 78].map((h, i) => (
            <span key={i} className="mini-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
        <figcaption>
          <strong>Analytics</strong> — time to offer, the biggest leak in the
          funnel, and what each channel costs.
        </figcaption>
      </figure>

      <figure className="demo-screen">
        <div className="demo-screen-art matrix">
          {[
            [4, 4, 3],
            [5, 2, 4],
            [3, 3, 3],
            [4, 5, 4],
          ].map((row, i) => (
            <div key={i} className="mini-row">
              <span className="mini-label" />
              {row.map((v, j) => (
                <span
                  key={j}
                  className={`mini-dot v${v}${i === 1 ? " diverged" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
        <figcaption>
          <strong>Panel debrief</strong> — every panelist against every
          competency, with the disagreements called out.
        </figcaption>
      </figure>
    </div>
  );
}

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

  const card = (p: Persona) => (
    <div key={p.email} className="demo-persona">
      <div className="demo-persona-head">
        <div>
          <strong>{p.name}</strong>
          <div className="mono-label" style={{ marginTop: 4 }}>
            {p.role} · {p.scope}
          </div>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => signIn(p)}>
          {busy === p.email ? "…" : "Sign in"}
        </button>
      </div>
      <p className="demo-notice">{p.notice}</p>
      <code className="demo-email">{p.email}</code>
    </div>
  );

  return (
    <main className="wide demo-page">
      <header className="demo-hero">
        <div className="mono-label">Live demo · rebuilt nightly</div>
        <h1>
          Two sides of the
          <br />
          same hire.
        </h1>
        <p className="demo-lede">
          Organizations post roles. Staffing agencies submit candidates against
          them. InterVU runs both sides of that wall — and settles who
          introduced whom, which is what agencies get paid on.
        </p>
        <p className="muted demo-sub">
          Everything here is fabricated. Change it freely: the database is
          rebuilt from scratch every night at 03:00&nbsp;UTC.
        </p>
      </header>

      <SectionHead label="The mechanic everything hangs off" />
      <OwnershipDiagram />

      <SectionHead label="Pick a side, and sign in" />
      <p className="muted demo-hint">
        One click — no password to type. Every account uses{" "}
        <code>{PASSWORD}</code> if you would rather type it yourself.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="demo-sides">
        <section className="demo-side">
          <div className="demo-side-head">
            <div className="mono-label">Internal</div>
            <h2>Organization workspace</h2>
            <p>
              Recruiters, hiring managers and interviewers. Sees everything
              about its own hiring — including which agency introduced a
              candidate, and when.
            </p>
          </div>
          {ORG_PERSONAS.map(card)}
        </section>

        <section className="demo-side vendor">
          <div className="demo-side-head">
            <div className="mono-label">External</div>
            <h2>Vendor portal</h2>
            <p>
              Staffing agencies. Sees only its own submissions and a coarse
              status vocabulary. Never a stage name, an interviewer, a
              scorecard, or another agency&rsquo;s existence.
            </p>
          </div>
          {VENDOR_PERSONAS.map(card)}
        </section>
      </div>

      <SectionHead label="What you are looking at" />
      <ScreenPreviews />

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
          <strong>Resumes are read, then discarded.</strong> There is no file
          storage attached, so uploads are parsed for the matcher and the
          original is not kept.
        </li>
        <li>
          <strong>No email leaves the building.</strong> Notifications appear in
          the portal rather than being delivered.
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
