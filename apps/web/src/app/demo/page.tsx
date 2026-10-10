"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
 * The page is built from things a visitor will actually find once signed in:
 * real seeded names, real role references, the real debrief split. Abstract
 * placeholder art told people nothing, and paragraphs per persona made them
 * read before they could click. Every vignette is drawn with the product's
 * own tokens, so it follows the accent and dark mode.
 *
 * KEEP IN STEP WITH prisma/seed.ts. The names, role counts, the hybrid
 * Data Engineer ladder and Lucía Fernández's 5-vs-2 MLOps split all come from the
 * seed. Counts that drift with the synthetic corpus (pipeline totals, SLA
 * breaches) are deliberately left out.
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

interface Step {
  where: string;
  what: string;
}

interface Persona {
  key: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  scope: string;
  blurb: string;
  can: string[];
  cannot: string[];
  tryThis: Step[];
  vendor?: boolean;
  landing: string;
}

/** Internal staff, widest scope first. Names match prisma/seed.ts exactly. */
const ORG_PERSONAS: Persona[] = [
  {
    key: "riley",
    email: "recruiter@acme.test",
    name: "Rafael Recruiter",
    initials: "RR",
    role: "Recruiter",
    scope: "Whole organization",
    blurb: "Runs hiring day to day. The widest view in the demo, and the best place to start.",
    can: [
      "See all 6 roles and every candidate",
      "Screen, move and reject at screening",
      "Settle duplicate claims between agencies",
      "Release roles to agencies",
    ],
    cannot: ["Record the final hire or no-hire. That belongs to the hiring manager."],
    tryThis: [
      {
        where: "Today",
        what: "The queue. Anything past its SLA is red, and each row opens the work it describes.",
      },
      {
        where: "Match reviews",
        what: "Two agencies sent someone already on file under a different name and email. The matcher scored each 81% and shows its working.",
      },
      {
        where: "Positions → POS-004 Frontend Engineer",
        what: "Switch sourcing to Direct only. It refuses, and tells you how many agency candidates are still active.",
      },
    ],
    landing: "/dashboard",
  },
  {
    key: "harper",
    email: "hm.eng@acme.test",
    name: "Harper Manager",
    initials: "HM",
    role: "Hiring manager",
    scope: "Engineering only",
    blurb: "Owns the outcome for the engineering teams, and sits on one panel — so this is the account with two personas.",
    can: [
      "See the 4 engineering roles",
      "Move and reject candidates",
      "Record offers and rejections",
    ],
    cannot: [
      "See the 2 sales and marketing roles. They are not behind an error; they do not exist here.",
      "Settle duplicate claims between agencies",
    ],
    tryThis: [
      {
        where: "Pipeline → Lucía Fernández → Open debrief",
        what: "MLOps splits the panel 5 to 2. The right-hand column previews exactly what the agency will be told.",
      },
      {
        where: "Sign in",
        what: "You are asked: Hiring manager or Interviewer? Pick Hiring manager. Today flags the scorecard waiting in your Interviewer persona; the account menu (⋯) switches.",
      },
    ],
    landing: "/pipeline",
  },
  {
    key: "parker",
    email: "pm.gtm@acme.test",
    name: "Parker PM",
    initials: "PP",
    role: "Project manager",
    scope: "Sales & marketing · read-only",
    blurb: "Watches the funnel for the go-to-market teams without touching it.",
    can: ["See the 2 sales and marketing roles and their candidates"],
    cannot: [
      "Move, reject or decide anything",
      "See the engineering roles",
      "Open a candidate's cross-team history",
    ],
    tryThis: [
      {
        where: "Positions",
        what: "Two roles: Sales Operations Analyst and Growth Marketer. Harper, on the same day, sees four different ones.",
      },
    ],
    landing: "/positions",
  },
  {
    key: "indira",
    email: "interviewer1@acme.test",
    name: "Ingrid Interviewer",
    initials: "II",
    role: "Interviewer",
    scope: "Assigned interviews only",
    blurb: "Sees only the interviews on their own panels. Being on the panel is the permission.",
    can: [
      "See 3 assigned interviews",
      "File a scorecard for each, then read the rest of the panel's",
      "Open the candidates on those panels, until a decision is recorded",
    ],
    cannot: [
      "Browse positions or the pipeline",
      "Read a colleague's scorecard before filing their own",
    ],
    tryThis: [
      {
        where: "My interviews → Jordan Mitchell → Quick file",
        what: "This one is overdue. Leave a competency blank: it records as “not assessed”, which the debrief shows differently from a low score.",
      },
      {
        where: "My interviews → Jordan Mitchell → View scorecards",
        what: "Once filed: your scorecard, then Ikenna's, which stayed hidden until yours was in.",
      },
    ],
    landing: "/interviews",
  },
  {
    key: "sasha",
    email: "vendors@acme.test",
    name: "Mei Sourcing",
    initials: "MS",
    role: "Vendor manager",
    scope: "Read-only · a custom role",
    blurb: "Reviews how each agency performs. Not a built-in role: the organization defined it from three permissions.",
    can: [
      "Compare every agency side by side",
      "Filter by role, technology and seniority",
      "Read positions and the pipeline",
    ],
    cannot: ["Change a contract, a tier or a fee", "Move, reject or decide on a candidate"],
    tryThis: [
      {
        where: "Vendor performance",
        what: "Four agencies from one computation, the same one each agency sees for itself in its own portal.",
      },
    ],
    landing: "/analytics/vendors",
  },
];

/**
 * External agencies. Four are seeded; three are offered here, which is enough
 * for tiers and duplicate contests to have a cast. The fourth, NorthStar,
 * exists so the agency benchmark has the peers it requires.
 */
const VENDOR_PERSONAS: Persona[] = [
  {
    key: "talentbridge",
    email: "recruiter@talentbridge.test",
    name: "TalentBridge",
    initials: "TB",
    role: "Agency · tier 1",
    scope: "Own submissions",
    blurb: "The preferred agency. First in line on tiered roles, and holds one role nobody else has.",
    can: [
      "See 5 released roles",
      "Submit candidates and track them",
      "See what happened to everyone it sent",
    ],
    cannot: ["See stage names, interviewers or scores", "See another agency's name or numbers"],
    tryThis: [
      {
        where: "Open roles",
        what: "Two roles nobody else has yet: Data Engineer is the tier-1 head start, and Sales Operations Analyst was released by hand.",
      },
      {
        where: "Performance",
        what: "Its funnel from submitted to offered, then against the other three agencies, pooled so none can be singled out.",
      },
    ],
    vendor: true,
    landing: "/vendor",
  },
  {
    key: "hireworks",
    email: "recruiter@hireworks.test",
    name: "HireWorks",
    initials: "HW",
    role: "Agency · tier 2",
    scope: "Own submissions",
    blurb: "A tier-2 agency. Waits its turn on tiered roles, and is never told it is waiting.",
    can: ["See 3 released roles", "Submit candidates and track them"],
    cannot: ["See roles still inside the tier-1 head start", "See how the panel scored"],
    tryThis: [
      {
        where: "My submissions → Lucía Fernández",
        what: "Acme's panel split 5 to 2. HireWorks sees one plain status.",
      },
    ],
    vendor: true,
    landing: "/vendor",
  },
  {
    key: "staffpro",
    email: "recruiter@staffpro.test",
    name: "StaffPro",
    initials: "SP",
    role: "Agency · tier 2",
    scope: "Own submissions",
    blurb: "The agency that keeps arriving second, which is what ownership rules exist for.",
    can: ["See 3 released roles", "Submit candidates and track them"],
    cannot: ["Learn which agency got there first", "See another agency's candidates"],
    tryThis: [
      {
        where: "My submissions, then Performance",
        what: "Duplicate claims read “Not eligible”. Performance counts them as already claimed by another agency, and never says which one.",
      },
    ],
    vendor: true,
    landing: "/vendor",
  },
];

const PERSONAS = [...ORG_PERSONAS, ...VENDOR_PERSONAS];

/* ------------------------------------------------------------------------ */
/* Hero: things that are genuinely waiting once you sign in                  */
/* ------------------------------------------------------------------------ */

const WAITING = [
  {
    label: "Pipeline · duplicates",
    title: "Camila Torres",
    meta: "POS-006 Growth Marketer · via StaffPro",
    badge: "Duplicate",
    tone: "dup",
  },
  {
    label: "Debrief · POS-005 ML Engineer",
    title: "Lucía Fernández",
    meta: "Panel split 5 vs 2 on MLOps",
    badge: "Split 5/2",
    tone: "warn",
  },
  {
    label: "My interviews · Ingrid",
    title: "Jordan Mitchell",
    meta: "Scorecard overdue · debrief sealed",
    badge: "1 of 2 filed",
    tone: "bad",
  },
  {
    label: "Match reviews · NorthStar",
    title: "An Nguyen",
    meta: "Already on file as Nguyen Van An? The matcher is not sure",
    badge: "Score 81%",
    tone: "accent",
  },
] as const;

function WaitingStack() {
  return (
    <div className="dg-stack" aria-label="Waiting for you in the demo">
      <div className="mono-label dg-stack-head">Waiting for you inside</div>
      {WAITING.map((w, i) => (
        <div
          key={w.title}
          className={`dg-receipt tone-${w.tone}`}
          style={{ animationDelay: `${120 + i * 110}ms` }}
        >
          <div className="mono-label">{w.label}</div>
          <div className="dg-receipt-row">
            <strong>{w.title}</strong>
            <span
              className={`badge ${
                w.tone === "warn" ? "warn" : w.tone === "bad" ? "bad" : ""
              } ${w.tone === "dup" ? "hatched dg-badge-dup" : ""} ${
                w.tone === "accent" ? "dg-badge-accent" : ""
              }`}
            >
              {w.badge}
            </span>
          </div>
          <div className="dg-receipt-meta">{w.meta}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Feature vignettes                                                         */
/* ------------------------------------------------------------------------ */

/**
 * POS-002's real schedule, as the seed writes it: hybrid, so the careers site
 * had it first; a day later the tier-1 agency; the tier-2 agencies three days
 * from now. The nightly reset moves the whole ladder along with it, so on the
 * public demo the tier-2 step is always just ahead.
 */
function ReleaseLadder() {
  // Positions along the track, as a share of its width.
  const TODAY = 76;
  const lanes = [
    { who: "Careers site & referrals", note: "direct", from: 0, label: "since publish", tone: "ink" },
    { who: "TalentBridge", note: "tier 1", from: 8, label: "a day later", tone: "accent" },
    { who: "HireWorks · StaffPro · NorthStar", note: "tier 2", from: 97, label: "in 3 days", tone: "accent2" },
  ];
  return (
    <figure className="dg-vignette dg-ladder">
      <div className="dg-vignette-head">
        <span className="mono-label">POS-002 · Data Engineer · hybrid</span>
        <span className="badge">Tiered release</span>
      </div>
      <div className="dg-ladder-lanes">
        {lanes.map((l) => (
          <div key={l.who} className="dg-lane">
            <div className="dg-lane-who">
              <strong>{l.who}</strong>
              <span className="mono-label">{l.note}</span>
            </div>
            <div className="dg-lane-track">
              <span
                className={`dg-lane-fill ${l.tone}${l.from > TODAY ? " future" : ""}`}
                style={{ left: `${l.from}%` }}
              />
              <span
                className={`dg-lane-day${l.from > TODAY ? " future" : ""}`}
                // A future step labels itself just before its marker, so the
                // words never sit on top of the dashed line.
                style={
                  l.from > TODAY
                    ? { right: `calc(${100 - l.from}% + 8px)` }
                    : { left: `calc(${l.from}% + 10px)` }
                }
              >
                {l.label}
              </span>
              <span className="dg-today" style={{ left: `${TODAY}%` }} aria-hidden="true" />
            </div>
          </div>
        ))}
        <div className="dg-ladder-axis" aria-hidden="true">
          <span />
          <span className="dg-axis-ticks">
            <i style={{ left: "0%" }}>published</i>
            <i className="today" style={{ left: `${TODAY}%` }}>
              today
            </i>
            <i style={{ left: "100%" }}>+3d</i>
          </span>
        </div>
      </div>
      <figcaption>
        Sales Operations Analyst went the other way: released by hand to
        TalentBridge alone.
      </figcaption>
    </figure>
  );
}

/**
 * The core mechanic. Two agencies introduce the same person; the system
 * decides who owns the introduction, because that is what an agency
 * invoices for.
 */
function OwnershipDiagram() {
  return (
    <figure className="dg-vignette dg-own">
      <svg
        className="dg-own-svg"
        viewBox="0 0 560 230"
        role="img"
        aria-label="Two agencies submit the same candidate; the earlier submission owns the introduction, the later one is flagged as a duplicate."
      >
        <defs>
          <pattern id="dg-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--warn)" strokeWidth="1.4" opacity="0.45" />
          </pattern>
          <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
          </marker>
        </defs>

        <g className="d-box">
          <rect x="2" y="16" width="150" height="58" rx="7" />
          <text x="16" y="40" className="d-title">TalentBridge</text>
          <text x="16" y="60" className="d-meta">MON 09:14</text>
        </g>
        <g className="d-box">
          <rect x="2" y="146" width="150" height="58" rx="7" />
          <text x="16" y="170" className="d-title">StaffPro</text>
          <text x="16" y="190" className="d-meta">MON 14:02</text>
        </g>

        <path d="M156 45 L196 45 L196 100 L224 100" className="d-line" markerEnd="url(#dg-arrow)" />
        <path d="M156 175 L196 175 L196 120 L224 120" className="d-line" markerEnd="url(#dg-arrow)" />

        <g className="d-box accent">
          <rect x="228" y="78" width="128" height="64" rx="7" />
          <text x="292" y="104" className="d-title mid">Same person</text>
          <text x="292" y="124" className="d-meta mid">EARLIEST WINS</text>
        </g>

        <path d="M360 98 L396 62" className="d-line" markerEnd="url(#dg-arrow)" />
        <path d="M360 122 L396 158" className="d-line" markerEnd="url(#dg-arrow)" />

        <g className="d-box ok">
          <rect x="400" y="26" width="156" height="58" rx="7" />
          <text x="414" y="50" className="d-title">Owner</text>
          <text x="414" y="70" className="d-meta">TALENTBRIDGE · FEE</text>
        </g>
        <g className="d-box warn">
          <rect x="400" y="136" width="156" height="58" rx="7" fill="url(#dg-hatch)" />
          <rect x="400" y="136" width="156" height="58" rx="7" fill="none" />
          <text x="414" y="160" className="d-title">Duplicate</text>
          <text x="414" y="180" className="d-meta">STAFFPRO · EVIDENCE</text>
        </g>
      </svg>
      <figcaption>
        The system lays out the evidence. A recruiter makes the call.
      </figcaption>
    </figure>
  );
}

/** Lucía Fernández's real debrief, as the seed writes it. */
function DebriefMatrix() {
  const rows = [
    { skill: "Python", a: 4, b: 4, verdict: "Strong" },
    { skill: "MLOps", a: 5, b: 2, verdict: "Split 5/2" },
    { skill: "Spark", a: 4, b: 4, verdict: "Strong" },
  ];
  const tone = (v: number) => (v >= 4 ? "hi" : v <= 2 ? "lo" : "");
  return (
    <figure className="dg-vignette dg-debrief">
      <div className="dg-vignette-head">
        <span className="mono-label">Debrief · Lucía Fernández · ML Engineer</span>
        <span className="badge ok">2 of 2 filed</span>
      </div>
      <table className="dg-matrix">
        <thead>
          <tr>
            <th className="mono-label">Competency</th>
            <th className="mono-label">Ingrid</th>
            <th className="mono-label">Ikenna</th>
            <th className="mono-label">Consensus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const split = Math.abs(r.a - r.b) >= 2;
            return (
              <tr key={r.skill} className={split ? "split" : ""}>
                <td>{r.skill}</td>
                <td>
                  <span className={`dg-score ${tone(r.a)}`}>{r.a}</span>
                </td>
                <td>
                  <span className={`dg-score ${tone(r.b)}`}>{r.b}</span>
                </td>
                <td className={`mono-label dg-verdict ${split ? "warn" : "ok"}`}>
                  {r.verdict}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <figcaption>
        Neither saw the other&rsquo;s card until both had filed. The split is
        the conversation to have before anyone makes an offer.
      </figcaption>
    </figure>
  );
}

/** The wall: one candidate, two audiences. */
function TheWall() {
  const rows: [string, ReactNode, ReactNode][] = [
    ["Stage", "Interviewing", <span key="s" className="badge ok">Submitted</span>],
    ["Panel", "Ingrid: strong yes · Ikenna: no", <span key="p" className="dg-none">hidden</span>],
    ["Ratings", "MLOps 5 vs 2", <span key="r" className="dg-none">hidden</span>],
    ["A rival's claim", "Flagged, both timestamps", <span key="d" className="badge">Not eligible</span>],
    ["Feedback", "Full scorecards", "A summary and skill tags you approve"],
  ];
  return (
    <figure className="dg-vignette dg-wall">
      <div className="dg-wall-grid" role="table" aria-label="What Acme sees compared with what the agency sees">
        <div className="dg-wall-row head" role="row">
          <span role="columnheader" />
          <span role="columnheader" className="mono-label">Acme sees</span>
          <span role="columnheader" className="mono-label dg-wall-agency">The agency sees</span>
        </div>
        {rows.map(([k, org, agency]) => (
          <div key={k} className="dg-wall-row" role="row">
            <span role="rowheader" className="mono-label">{k}</span>
            <span role="cell">{org}</span>
            <span role="cell" className="dg-wall-agency">{agency}</span>
          </div>
        ))}
      </div>
      <figcaption>
        Agencies get five words for a candidate&rsquo;s status: received,
        submitted, not eligible, not selected, withdrawn.
      </figcaption>
    </figure>
  );
}

interface Feature {
  n: string;
  title: string;
  body: string;
  art: ReactNode;
  see: { as: string; persona: string; what: string };
}

const FEATURES: Feature[] = [
  {
    n: "01",
    title: "Roles reach agencies on your schedule",
    body: "Each role picks how it is released: to every agency at once, by hand, or on a tiered ladder that gives preferred agencies a head start. Hybrid roles go to your careers site first and open to agencies on a set date.",
    art: <ReleaseLadder />,
    see: {
      as: "TalentBridge, then HireWorks",
      persona: "talentbridge",
      what: "Count the open roles: 5 against 3. HireWorks gets Data Engineer in three days and is never told it is waiting.",
    },
  },
  {
    n: "02",
    title: "The same person, sent twice, is caught",
    body: "Candidates are matched on email, phone and fuzzy name scoring, so a second agency's submission lands on the person already on file. The earliest valid one owns the introduction, and the fee. Later ones are flagged, not silently dropped.",
    art: <OwnershipDiagram />,
    see: {
      as: "Rafael",
      persona: "riley",
      what: "Match reviews for the near-misses the matcher was unsure of; Pipeline → Duplicates for the contests it was sure of.",
    },
  },
  {
    n: "03",
    title: "Interviewers score alone, then compare",
    body: "Each panelist files a scorecard without seeing anyone else's. The debrief stays sealed until the whole panel has filed, then lines every rating up and calls out where they disagree.",
    art: <DebriefMatrix />,
    see: {
      as: "Ingrid, then Harper",
      persona: "indira",
      what: "Ingrid's overdue scorecard is what keeps Jordan Mitchell's debrief sealed. Harper can open Lucía Fernández's.",
    },
  },
  {
    n: "04",
    title: "Agencies see what you decide, nothing more",
    body: "The vendor portal is a separate door with its own vocabulary. Interviewer names, ratings, notes and your internal reasons never cross it. Feedback to an agency is composed from the panel and released on purpose.",
    art: <TheWall />,
    see: {
      as: "HireWorks",
      persona: "hireworks",
      what: "Find Lucía Fernández in My submissions, then compare it with Harper's debrief.",
    },
  },
];

/* ------------------------------------------------------------------------ */
/* Who can do what                                                           */
/* ------------------------------------------------------------------------ */

type Cell = boolean | string;
const GRID_COLS = ["Rafael", "Harper", "Parker", "Ingrid", "Mei", "TalentBridge", "HireWorks", "StaffPro"];
/** Columns from here on are agencies, drawn behind the wall. */
const FIRST_AGENCY = 5;
const GRID_ROWS: { what: string; cells: Cell[] }[] = [
  { what: "Open roles they can see", cells: ["6", "4", "2", "0", "6", "5", "3", "3"] },
  { what: "Which agency sent a candidate", cells: [true, true, true, false, true, "own", "own", "own"] },
  { what: "Open candidate history", cells: [true, true, false, "panel", false, false, false, false] },
  { what: "Move or reject candidates", cells: [true, true, false, false, false, false, false, false] },
  { what: "Settle duplicate claims", cells: [true, false, false, false, false, false, false, false] },
  { what: "Record hire or no-hire", cells: [false, true, false, false, false, false, false, false] },
  { what: "Release roles to agencies", cells: [true, false, false, false, false, false, false, false] },
  { what: "See vendor performance", cells: [false, false, false, false, true, "own", "own", "own"] },
];

function AccessGrid() {
  return (
    <div className="dg-grid-wrap">
      <table className="dg-grid">
        <thead>
          <tr>
            <th />
            {GRID_COLS.map((c, i) => (
              <th key={c} className={`mono-label ${i >= FIRST_AGENCY ? "agency" : ""}`} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRID_ROWS.map((r) => (
            <tr key={r.what}>
              <th scope="row">{r.what}</th>
              {r.cells.map((c, i) => (
                <td key={i} className={i >= FIRST_AGENCY ? "agency" : ""}>
                  {typeof c === "string" ? (
                    /^\d+$/.test(c) ? (
                      <span className="figure dg-count">{c}</span>
                    ) : (
                      <span className="mono-label dg-own-only">{c} only</span>
                    )
                  ) : c ? (
                    <span className="dg-yes" aria-label="yes">●</span>
                  ) : (
                    <span className="dg-no" aria-label="no">·</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

export default function DemoPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("riley");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const peopleRef = useRef<HTMLElement | null>(null);

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

  const persona = PERSONAS.find((p) => p.key === selected) ?? PERSONAS[0]!;

  async function signIn(p: Persona) {
    setBusy(p.email);
    setError(null);
    try {
      const result = await api<{ needs_persona?: boolean }>(
        p.vendor ? "/auth/vendor/login" : "/auth/org/login",
        {
          method: "POST",
          body: { org_slug: ORG_SLUG, email: p.email, password: PASSWORD },
        },
      );
      // Harper holds two personas; the picker is part of the demo.
      router.push(
        result.needs_persona
          ? `/choose-persona?next=${encodeURIComponent(p.landing)}`
          : p.landing,
      );
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(null);
    }
  }

  /** Jump from a feature's "see it" line to that person in the picker. */
  function pick(key: string) {
    setSelected(key);
    peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Arrow keys move between tabs, per the WAI-ARIA tabs pattern. */
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = PERSONAS.findIndex((p) => p.key === selected);
    let next = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % PERSONAS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      next = (i - 1 + PERSONAS.length) % PERSONAS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = PERSONAS.length - 1;
    else return;
    e.preventDefault();
    const key = PERSONAS[next]!.key;
    setSelected(key);
    tabRefs.current[key]?.focus();
  }

  const tab = (p: Persona) => (
    <button
      key={p.key}
      ref={(el) => {
        tabRefs.current[p.key] = el;
      }}
      type="button"
      role="tab"
      id={`dg-tab-${p.key}`}
      aria-selected={p.key === selected}
      aria-controls="dg-person-panel"
      tabIndex={p.key === selected ? 0 : -1}
      className={`dg-tab ${p.vendor ? "agency" : ""}`}
      onClick={() => setSelected(p.key)}
      onKeyDown={onTabKey}
    >
      <span className="dg-avatar" aria-hidden="true">
        {p.initials}
      </span>
      <span className="dg-tab-text">
        <strong>{p.name}</strong>
        <span>{p.role}</span>
      </span>
    </button>
  );

  return (
    <main className="wide dg-page">
      {/* ---------------------------------------------------------- hero -- */}
      <header className="dg-hero">
        <div className="dg-hero-copy">
          <div className="mono-label">Live demo · open source · rebuilt nightly</div>
          <h1>
            Agencies send the candidates.{" "}
            <span className="dg-h1-accent">InterVU keeps the receipts.</span>
          </h1>
          <p className="dg-lede">
            An open-source hiring platform for companies that recruit through
            staffing agencies. It decides which agency sees which role and when,
            catches the same person submitted twice, and runs the interviews
            through to an offer, with a wall between what you see and what the
            agencies see.
          </p>
          <div className="dg-cta">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => signIn(ORG_PERSONAS[0]!)}
            >
              {busy === ORG_PERSONAS[0]!.email ? "Signing in…" : "Start as Rafael, the recruiter →"}
            </button>
            <Link href="/how-it-works" className="dg-cta-secondary">
              How it works <span className="mono-label">5 min</span>
            </Link>
          </div>
          {error && <p className="error">{error}</p>}
          <dl className="dg-facts">
            <div>
              <dt className="mono-label">Open roles</dt>
              <dd className="figure">6</dd>
            </div>
            <div>
              <dt className="mono-label">Agencies</dt>
              <dd className="figure">4</dd>
            </div>
            <div>
              <dt className="mono-label">People to be</dt>
              <dd className="figure">8</dd>
            </div>
            <div>
              <dt className="mono-label">Passwords to type</dt>
              <dd className="figure">0</dd>
            </div>
          </dl>
        </div>
        <WaitingStack />
      </header>

      {/* ------------------------------------------------------ features -- */}
      <SectionHead label="What it does that a plain applicant tracker doesn't" />
      <div className="dg-features">
        {FEATURES.map((f) => (
          <section key={f.n} className="dg-feature">
            <div className="dg-feature-copy">
              <div className="dg-feature-n figure" aria-hidden="true">
                {f.n}
              </div>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
              <button type="button" className="dg-see" onClick={() => pick(f.see.persona)}>
                <span className="mono-label">See it as {f.see.as}</span>
                <span className="dg-see-what">{f.see.what}</span>
              </button>
            </div>
            <div className="dg-feature-art">{f.art}</div>
          </section>
        ))}
      </div>

      {/* -------------------------------------------------------- people -- */}
      <section ref={peopleRef} className="dg-people-section" aria-labelledby="dg-people-h">
        <SectionHead label="Pick someone to be" />
        <h2 id="dg-people-h" className="dg-people-h">
          Eight people, eight different products.
        </h2>
        <p className="muted dg-people-sub">
          Same database, same moment. What each person sees is decided by their
          role, their teams and, for agencies, what was released to them.
        </p>

        <div className="dg-people">
          <div className="dg-tabs" role="tablist" aria-label="Demo accounts" aria-orientation="vertical">
            <div className="mono-label dg-tabs-group">Acme Corp staff</div>
            {ORG_PERSONAS.map(tab)}
            <div className="mono-label dg-tabs-group">Staffing agencies</div>
            {VENDOR_PERSONAS.map(tab)}
          </div>

          <div
            id="dg-person-panel"
            role="tabpanel"
            aria-labelledby={`dg-tab-${persona.key}`}
            className={`dg-person ${persona.vendor ? "agency" : ""}`}
            key={persona.key}
          >
            <div className="dg-person-head">
              <span className="dg-avatar lg" aria-hidden="true">
                {persona.initials}
              </span>
              <div>
                <div className="mono-label">
                  {persona.role} · {persona.scope}
                </div>
                <h3>{persona.name}</h3>
              </div>
            </div>
            <p className="dg-person-blurb">{persona.blurb}</p>

            <div className="dg-person-cols">
              <div>
                <div className="mono-label dg-col-label ok">Can</div>
                <ul className="dg-list can">
                  {persona.can.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mono-label dg-col-label">Can&rsquo;t</div>
                <ul className="dg-list cannot">
                  {persona.cannot.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mono-label dg-col-label">Try this</div>
            <ol className="dg-try">
              {persona.tryThis.map((t) => (
                <li key={t.where}>
                  <strong>{t.where}</strong>
                  <span>{t.what}</span>
                </li>
              ))}
            </ol>

            <div className="dg-person-go">
              <button type="button" disabled={busy !== null} onClick={() => signIn(persona)}>
                {busy === persona.email ? "Signing in…" : `Sign in as ${persona.name} →`}
              </button>
              <code className="dg-cred">
                {persona.email} · {PASSWORD}
              </code>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- grid -- */}
      <SectionHead label="Who can do what" />
      <AccessGrid />
      <p className="muted dg-grid-note">
        Scoring an interview is missing on purpose. No role grants it: sitting on
        that interview&rsquo;s panel does, whoever you are.
      </p>

      {/* -------------------------------------------------------- limits -- */}
      <SectionHead label="Before you click" />
      <ul className="dg-limits">
        <li>
          <span className="mono-label dg-limit-tag">Speed</span>
          <strong>The first load is slow.</strong>
          <span>
            The demo sleeps when idle to stay free. The first request after a
            quiet spell takes up to a minute. It is not broken.
          </span>
        </li>
        <li>
          <span className="mono-label dg-limit-tag">Data</span>
          <strong>Break anything you like.</strong>
          <span>
            All data is made up, and the database is rebuilt from scratch
            every night.
          </span>
        </li>
        <li>
          <span className="mono-label dg-limit-tag">Email</span>
          <strong>No email leaves the building.</strong>
          <span>Notifications show up in the app instead of being sent.</span>
        </li>
        <li>
          <span className="mono-label dg-limit-tag">Access</span>
          <strong>Admin is not on the tour.</strong>
          <span>
            Settings, agency contracts and data erasure would wreck the demo for
            the next visitor, so no admin account is offered. Uploaded résumés
            are read for matching, then discarded.
          </span>
        </li>
      </ul>

      <p className="dg-foot">
        <Link href="/how-it-works">How it works</Link>
        <a href="https://github.com/sajucrajan/interVU">Source on GitHub</a>
        <Link href="/login">Sign in normally</Link>
        <Link href="/vendor/login">Vendor portal</Link>
      </p>
    </main>
  );
}
