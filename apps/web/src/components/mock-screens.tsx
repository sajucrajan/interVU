import type { ReactNode } from "react";

/**
 * The main screens, mocked (docs/01 §4, White-labeling; docs/14).
 *
 * Each mock is the real components and classes (cards, badges, chips, the
 * matrix cell) laid out with made-up data at a fixed size, so a frame that
 * scales it down shows what the product does. Two places browse them:
 * Admin → Appearance previews a draft theme on PREVIEW_KEYS, and the /guide
 * page drops one at each step so a reader sees the screen the text is
 * about without opening it. No hooks here: a mock is a function of the
 * product label only.
 */

export const W = 1120;
export const H = 700;

function Rail({ items, active, who, role, label }: { items: string[]; active: number; who: string; role: string; label: string | null }) {
  return (
    <div className="tp-rail">
      <div className="tp-rail-brand">
        {label ?? (
          <>
            Inter<span style={{ color: "var(--accent)" }}>/</span>VU
          </>
        )}
      </div>
      <div className="tp-rail-org mono-label">{role}</div>
      <div className="tp-rail-nav">
        {items.map((it, i) => (
          <div key={it} className={`tp-rail-item${i === active ? " on" : ""}`}>
            {it}
          </div>
        ))}
      </div>
      <div className="tp-rail-foot">
        <span className="tp-avatar">{who.split(" ").map((w) => w[0]).join("")}</span>
        <span>{who}</span>
      </div>
    </div>
  );
}

const ORG_NAV = ["Today", "Pipeline", "Match reviews", "Question bank", "Positions", "Templates", "Analytics"];

function Today(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={0} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main">
        <div className="mono-label">Monday · Recruiter</div>
        <h1 className="tp-h1">12 things are waiting on you.</h1>
        <p className="muted tp-lede">You run hiring day to day: screen what agencies send, settle duplicate claims, and move candidates through the loop.</p>
        <div className="tp-stats">
          <div><div className="mono-label">In flight</div><div className="figure tp-figure">27</div></div>
          <div><div className="mono-label">Median time to offer</div><div className="figure tp-figure">3d</div></div>
          <div><div className="mono-label">SLA breached</div><div className="figure tp-figure" style={{ color: "var(--bad)" }}>2</div></div>
        </div>
        <div className="mono-label tp-section">Your queue</div>
        <div className="tp-queue">
          <div className="tp-queue-row"><span className="figure tp-qn">5</span><span><strong>New submissions to screen</strong><br /><span className="muted">Across 4 roles · 3 from tier-1 vendors</span></span><span className="badge ok">2d SLA</span><span className="mono-label">oldest 1d 6h</span></div>
          <div className="tp-queue-row"><span className="figure tp-qn" style={{ color: "var(--bad)" }}>7</span><span><strong>Duplicate submission contests</strong><br /><span className="muted">Two vendors claim the same candidate</span></span><span className="badge bad">Breached</span><span className="mono-label">oldest 3d 6h</span></div>
          <div className="tp-queue-row"><span className="figure tp-qn">2</span><span><strong>Candidates awaiting a decision</strong><br /><span className="muted">Waiting on hiring managers · scorecards in</span></span><span className="badge warn">Aging</span><span className="mono-label">oldest 4d</span></div>
        </div>
      </div>
    </div>
  );
}

function Card({ name, pos, chip, tone, cta }: { name: string; pos: string; chip: string; tone?: string; cta: string }) {
  return (
    <div className="pipe-card tp-card">
      <div className="pipe-card-top"><span className="pipe-name">{name}</span><span className="mono-label">{chip}</span></div>
      <div className="muted tp-small">{pos}</div>
      <div className="tp-chips"><span className="skill-chip">TalentBridge</span>{tone && <span className={`badge ${tone}`}>{tone === "bad" ? "SLA breached" : "Decision due"}</span>}</div>
      <div className="tp-cta"><button type="button">{cta} →</button><span className="skill-chip">⋯</span></div>
    </div>
  );
}

function Pipeline(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={1} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main">
        <div className="mono-label">Work / Pipeline</div>
        <h1 className="tp-h1">27 candidates in flight</h1>
        <div className="tp-filters"><span className="badge tp-on">All active 27</span><span className="badge">New to screen 11</span><span className="badge">Awaiting decision 2</span><span className="badge bad">SLA breached 3</span></div>
        <div className="tp-board">
          {[
            ["New", 11, [["Nguyen Van An", "POS-003 Sales Ops Analyst", "5h", "Screen"], ["Haruto Sato", "POS-004 Frontend Engineer", "8h", "Screen"]]],
            ["Screening", 9, [["Maria Santos", "POS-004 Frontend Engineer", "13h", "Screen"], ["Wei Zhang", "POS-001 Senior Platform", "1d 2h", "Screen"]]],
            ["Interviewing", 4, [["Jordan Mitchell", "POS-004 Frontend Engineer", "2d", "Decide", "warn"], ["Lucía Fernández", "POS-005 ML Engineer", "3d 18h", "Decide", "bad"]]],
            ["Offer", 3, [["Yuna Choi", "POS-004 Frontend Engineer", "17h", "Open debrief"]]],
          ].map(([col, n, cards]) => (
            <div key={col as string} className="tp-col">
              <div className="tp-col-head"><span className="mono-label">{col as string}</span><span className="figure">{n as number}</span></div>
              {(cards as string[][]).map((c) => (
                <Card key={c[0]} name={c[0]!} pos={c[1]!} chip={c[2]!} cta={c[3]!} tone={c[4]} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Position(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={4} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">POS-001 · Platform · Open</div>
          <h1 className="tp-h1">Senior Platform Engineer</h1>
          <div className="card">
            <div className="mono-label tp-section-first">Skill matrix</div>
            <div className="tp-chips"><span className="skill-chip must">★ Kubernetes</span><span className="skill-chip must">★ Go</span><span className="skill-chip">Terraform</span><span className="skill-chip">PostgreSQL</span><span className="skill-chip">Observability</span></div>
            <div className="mono-label tp-section">About the role</div>
            <p className="muted tp-small">Own the platform the product teams build on: the clusters, the pipelines, the on-call that keeps both honest. Hybrid, Austin.</p>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="mono-label tp-section-first">Who can see this role</div>
            <p className="tp-small"><strong>Shared with TalentBridge.</strong> HireWorks and StaffPro can't see it.</p>
            <table className="data tp-table"><tbody>
              <tr><td>TalentBridge</td><td className="num"><span className="badge ok">yes · since 3 Oct</span></td></tr>
              <tr><td>HireWorks</td><td className="num"><span className="badge">from 10 Oct</span></td></tr>
              <tr><td>StaffPro</td><td className="num"><span className="badge">not shared</span></td></tr>
            </tbody></table>
            <div className="tp-cta"><button type="button">Share with agencies…</button><button type="button" className="secondary">Publish…</button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dots({ on }: { on: number }) {
  return (
    <span className="iv-scale">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`iv-dot${n === on ? " on" : ""}`}>{n}</span>
      ))}
    </span>
  );
}

function Room(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={["Today", "My interviews", "Question bank"]} active={1} who="Ingrid Interviewer" role="Interviewer" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">POS-004 Frontend Engineer · Technical round</div>
          <h1 className="tp-h1">Jordan Mitchell</h1>
          <div className="mono-label tp-section">Required, and whether the CV shows it</div>
          <div className="tp-chips"><span className="skill-chip must">★ React</span><span className="skill-chip must">★ TypeScript</span><span className="skill-chip">Design Systems</span></div>
          <div className="mono-label tp-section">Questions for this round</div>
          <div className="card tp-q"><strong>Tell me about a time you disagreed with a technical decision that had already been made.</strong><div className="mono-label">L3 · situational · spread 3 over 4 asks</div></div>
          <div className="card tp-q"><strong>How would you design a read path that stays fast as the dataset grows 100×?</strong><div className="mono-label">L4 · system design</div></div>
        </div>
        <div className="card">
          <div className="mono-label tp-section-first">Score as you go · 2/3</div>
          <div className="tp-rate"><span className="skill-chip must">★ React</span><Dots on={4} /></div>
          <div className="tp-rate"><span className="skill-chip must">★ TypeScript</span><Dots on={4} /></div>
          <div className="tp-rate"><span className="skill-chip">Design Systems</span><Dots on={0} /></div>
          <div className="mono-label tp-section">How they'd work here · 1/5</div>
          <div className="tp-rate"><span><strong>Collaboration</strong></span><Dots on={5} /></div>
          <div className="tp-well muted tp-small">A 5 needs evidence: what did you see?</div>
          <div className="tp-cta"><button type="button">File scorecard</button></div>
        </div>
      </div>
    </div>
  );
}

function Cell({ v }: { v: number | null }) {
  const bg = v === null ? "var(--sunk)" : v >= 4 ? "var(--ok-wash)" : v <= 2 ? "var(--warn-wash)" : "var(--sunk)";
  const fg = v === null ? "var(--faint)" : v >= 4 ? "var(--ok)" : v <= 2 ? "var(--warn)" : "var(--fg)";
  return <span className="matrix-cell" style={{ background: bg, color: fg }}>{v ?? "—"}</span>;
}

function Debrief(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={["Today", "Pipeline", "Question bank", "Positions", "Templates", "Analytics"]} active={1} who="Harper Manager" role="Hiring manager" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Debrief · POS-005 ML Engineer</div>
          <h1 className="tp-h1">Lucía Fernández</h1>
          <div className="tp-recbar"><span style={{ flex: 1, background: "var(--ok)" }}>1</span><span style={{ flex: 1, background: "var(--bad)" }}>1</span></div>
          <div className="mono-label tp-section">Competency matrix</div>
          <table className="data matrix tp-table">
            <thead><tr><th>Competency</th><th className="num">Ingrid</th><th className="num">Ikenna</th><th className="num">Consensus</th></tr></thead>
            <tbody>
              <tr><td><strong>Python ★</strong></td><td className="num"><Cell v={4} /></td><td className="num"><Cell v={4} /></td><td className="num"><span className="mono-label" style={{ color: "var(--ok)" }}>strong</span></td></tr>
              <tr className="diverged"><td><strong>MLOps ★</strong></td><td className="num"><Cell v={5} /></td><td className="num"><Cell v={2} /></td><td className="num"><span className="mono-label" style={{ color: "var(--warn)" }}>split 5/2</span></td></tr>
              <tr><td><strong>Spark</strong></td><td className="num"><Cell v={4} /></td><td className="num"><Cell v={4} /></td><td className="num"><span className="mono-label" style={{ color: "var(--ok)" }}>strong</span></td></tr>
            </tbody>
          </table>
          <div className="leak tp-leak"><div className="mono-label">Divergence · resolve before deciding</div><p className="tp-small"><strong>MLOps</strong> splits the panel by 3 points against the same rubric.</p></div>
        </div>
        <div className="card">
          <div className="mono-label tp-section-first">Feedback to vendor</div>
          <p className="muted tp-small">Composed from the panel, never copied verbatim. Choose what leaves the building.</p>
          <div className="tp-well"><strong>Lucía Fernández</strong> <span className="badge">not selected</span><div className="tp-chips"><span className="skill-chip">Python</span><span className="skill-chip">Spark</span><span className="badge warn">MLOps</span></div></div>
          <div className="tp-cta"><button type="button">Record decision &amp; release feedback</button></div>
        </div>
      </div>
    </div>
  );
}

function Candidate(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={1} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main">
        <div className="mono-label">Candidate · C-0412</div>
        <h1 className="tp-h1">Catherine Walsh</h1>
        <div className="tp-chips"><span className="badge ok">Identity confidence 0.98</span><span className="badge">2 applications</span><span className="badge warn">Considered before · Data team</span></div>
        <div className="mono-label tp-section">Timeline · all teams, all vendors</div>
        <div className="card">
          {[
            ["12 Sep", "Submitted by HireWorks for POS-005 ML Engineer", ""],
            ["14 Sep", "Screened · advanced to the loop", "ok"],
            ["19 Sep", "Technical round · Ingrid Interviewer filed: yes (4/5)", "ok"],
            ["21 Sep", "Decision: hold · feedback released to HireWorks", "warn"],
            ["Mar 2025", "Rejected after interview for POS-002 Data Engineer (Data team)", "bad"],
          ].map(([d, t, tone]) => (
            <div key={d + t} className="tp-tl"><span className="mono-label">{d}</span><span className="tp-dot" style={{ background: tone ? `var(--${tone})` : "var(--faint)" }} /><span className="tp-small">{t}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Vendor(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={["Open roles", "Performance"]} active={0} who="Bridge Talent" role="Vendor portal" label={label} />
      <div className="tp-main">
        <div className="mono-label">Released to you</div>
        <h1 className="tp-h1">3 open roles</h1>
        <table className="data tp-table">
          <thead><tr><th>Ref</th><th>Role</th><th>Rate</th><th className="num">Status</th></tr></thead>
          <tbody>
            <tr><td className="mono-label">POS-001</td><td><strong>Senior Platform Engineer</strong><div className="muted tp-small">Hybrid · Austin</div></td><td>$95–120/h</td><td className="num"><span className="badge ok">open</span></td></tr>
            <tr><td className="mono-label">POS-004</td><td><strong>Frontend Engineer</strong><div className="muted tp-small">Remote</div></td><td>$80–100/h</td><td className="num"><span className="badge ok">open</span></td></tr>
            <tr><td className="mono-label">POS-006</td><td><strong>Growth Marketer</strong><div className="muted tp-small">Onsite · Denver</div></td><td>€60–75/h</td><td className="num"><span className="badge">tier 1 only</span></td></tr>
          </tbody>
        </table>
        <div className="mono-label tp-section">My submissions</div>
        <table className="data tp-table"><tbody>
          <tr><td><strong>Jordan Mitchell</strong></td><td>POS-004 Frontend Engineer</td><td className="num"><span className="badge warn">interviewing</span></td></tr>
          <tr><td><strong>Lucía Fernández</strong></td><td>POS-005 ML Engineer</td><td className="num"><span className="badge">not selected · feedback</span></td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

function SignIn(label: string | null) {
  return (
    <div className="tp-auth">
      <div className="tp-auth-side">
        <div className="tp-rail-brand">{label ?? <>Inter<span style={{ color: "var(--accent)" }}>/</span>VU</>}</div>
        <div className="mono-label tp-section">Organization workspace</div>
        <p className="tp-statement">One candidate record across every agency, every team, every year.</p>
        <ul className="muted tp-small tp-points"><li>Duplicates caught at submission</li><li>Scorecards hidden until yours is in</li><li>Agencies see only what you release</li></ul>
      </div>
      <div className="tp-auth-main">
        <div className="card tp-form">
          <h2 className="tp-h2">Sign in</h2>
          <label className="mono-label">Email</label><div className="tp-input">riley@northwind.test</div>
          <label className="mono-label">Password</label><div className="tp-input">••••••••••</div>
          <button type="button">Sign in</button>
          <p className="muted tp-small">Agency? <span style={{ color: "var(--accent)" }}>Go to the vendor portal</span></p>
        </div>
      </div>
    </div>
  );
}


// ---- The set-up (docs/14 §4) and the rest of the hire (§5) ----

const ADMIN_NAV = ["Today", "Pipeline", "Match reviews", "Positions", "Analytics", "People & access", "Vendors", "Ways of working", "Appearance", "Settings"];
const ADMIN = { who: "QA Lead", role: "Organization admin" };

function Teams(label: string | null) {
  const rows: [number, string, string][] = [
    [0, "Northwind Labs", "organization"],
    [1, "Engineering", "unit"],
    [2, "Platform", "team"],
    [2, "Frontend", "team"],
    [1, "Sales", "unit"],
    [2, "Sales Ops", "team"],
  ];
  return (
    <div className="tp-shell">
      <Rail items={ADMIN_NAV} active={5} {...ADMIN} label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Admin · structure</div>
          <h1 className="tp-h1">Teams</h1>
          <p className="muted tp-lede">Verticals and units contain other units or teams, and positions attach to teams. Access granted at any node covers everything beneath it.</p>
          <div className="card">
            {rows.map(([depth, name, kind]) => (
              <div key={name} className="tp-tree-row" style={{ paddingLeft: depth * 22 }}>
                <span className="tp-dot" style={{ background: kind === "team" ? "var(--accent)" : "var(--faint)" }} />
                <strong>{name}</strong>
                <span className="mono-label">{kind}</span>
                {kind !== "organization" && <span className="mono-label tp-right">⋯</span>}
              </div>
            ))}
          </div>
          <div className="tp-cta"><button type="button">Add a vertical</button><button type="button" className="secondary">Add a team under Engineering</button></div>
        </div>
        <div className="card">
          <div className="mono-label tp-section-first">Why the tree matters</div>
          <p className="tp-small">Morgan, hiring manager for <strong>Engineering</strong>, sees Platform and Frontend and nothing of Sales. Pat, project manager for <strong>Sales</strong>, sees the opposite.</p>
          <p className="muted tp-small">A position needs a team, so make at least one before the first role.</p>
        </div>
      </div>
    </div>
  );
}

function People(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ADMIN_NAV} active={5} {...ADMIN} label={label} />
      <div className="tp-main">
        <div className="mono-label">Admin · people &amp; access</div>
        <h1 className="tp-h1">People</h1>
        <div className="tp-cta" style={{ margin: "0 0 14px" }}><button type="button">Invite someone</button></div>
        <table className="data tp-table">
          <thead><tr><th>Person</th><th>Role</th><th>Scope</th><th className="num">Status</th></tr></thead>
          <tbody>
            <tr><td><strong>QA Lead</strong><div className="muted tp-small">qa@northwind.test</div></td><td>Organization admin</td><td>Organization</td><td className="num"><span className="badge ok">active</span></td></tr>
            <tr><td><strong>Riley Recruiter</strong><div className="muted tp-small">riley@northwind.test</div></td><td>Recruiter</td><td>Organization</td><td className="num"><span className="badge ok">active</span></td></tr>
            <tr><td><strong>Morgan Manager</strong><div className="muted tp-small">morgan@northwind.test</div></td><td>Hiring manager</td><td>Engineering</td><td className="num"><span className="badge warn">awaiting activation</span></td></tr>
            <tr><td><strong>Pat Project</strong><div className="muted tp-small">pat@northwind.test</div></td><td>Project manager</td><td>Sales</td><td className="num"><span className="badge warn">awaiting activation</span></td></tr>
            <tr><td><strong>Ira Interviewer</strong><div className="muted tp-small">ira@northwind.test</div></td><td>Interviewer</td><td>Organization</td><td className="num"><span className="badge">invited</span></td></tr>
          </tbody>
        </table>
        <div className="leak tp-leak"><div className="mono-label">Activation link · Ira Interviewer</div><div className="tp-input tp-small" style={{ fontFamily: "var(--font-mono)" }}>https://hiring.northwind.test/activate?token=4f2c…9a</div><p className="muted tp-small">Open it in that person&apos;s own browser window and set a password. The row reads <em>awaiting activation</em> until they do.</p></div>
      </div>
    </div>
  );
}

function Vendors(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ADMIN_NAV} active={6} {...ADMIN} label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Admin · agencies</div>
          <h1 className="tp-h1">Vendors</h1>
          <table className="data tp-table">
            <thead><tr><th>Agency</th><th>Tier</th><th>Contract</th><th className="num">People</th></tr></thead>
            <tbody>
              <tr><td><strong>Bridge Talent</strong></td><td><span className="badge ok">tier 1</span></td><td>active · to 31 Mar 2027</td><td className="num">1</td></tr>
              <tr><td><strong>Second Street Staffing</strong></td><td><span className="badge">tier 2</span></td><td>active · to 30 Sep 2027</td><td className="num">1</td></tr>
            </tbody>
          </table>
          <div className="tp-cta"><button type="button">Add a vendor</button></div>
        </div>
        <div className="card tp-form" style={{ width: "auto" }}>
          <h2 className="tp-h2">Add a vendor</h2>
          <label className="mono-label">Agency name</label><div className="tp-input">Second Street Staffing</div>
          <label className="mono-label">Tier</label><div className="tp-chips"><span className="badge">1 · preferred</span><span className="badge tp-on">2</span><span className="badge">3</span></div>
          <label className="mono-label">First person at the agency</label><div className="tp-input">Sam Street · sam@secondstreet.test</div>
          <button type="button">Create and get an activation link</button>
        </div>
      </div>
    </div>
  );
}

function NewPosition(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={4} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Positions · new</div>
          <h1 className="tp-h1">New position</h1>
          <div className="tp-fields">
            <div><label className="mono-label">Title</label><div className="tp-input">Senior Platform Engineer</div></div>
            <div><label className="mono-label">Team</label><div className="tp-input">Engineering / Platform</div></div>
            <div><label className="mono-label">Seniority</label><div className="tp-input">Senior</div></div>
            <div><label className="mono-label">Location</label><div className="tp-input">Hybrid · Austin</div></div>
          </div>
          <div className="mono-label tp-section">Skill matrix</div>
          <div className="tp-chips"><span className="skill-chip must">★ Kubernetes · 5y</span><span className="skill-chip must">★ Go · 3y</span><span className="skill-chip">Terraform</span><span className="skill-chip">PostgreSQL</span><span className="badge">+ add a skill</span></div>
          <div className="mono-label tp-section">Sourcing channel</div>
          <div className="tp-chips"><span className="badge tp-on">Vendors only</span><span className="badge">Hybrid</span><span className="badge">Direct only</span></div>
        </div>
        <div className="card">
          <div className="mono-label tp-section-first">Vendor terms</div>
          <div className="tp-fields">
            <div><label className="mono-label">Rate band</label><div className="tp-input">$95–120 / h</div></div>
            <div><label className="mono-label">Vendors join on</label><div className="tp-input">tier 1 now · rest after 7 days</div></div>
          </div>
          <div className="mono-label tp-section">Publish</div>
          <div className="tp-cta" style={{ flexWrap: "wrap" }}><button type="button">Tier 1 now, tier 2 after 7 days</button><button type="button" className="secondary">Save as draft</button></div>
          <p className="muted tp-small">This is the first time the organization has any skills at all: the question bank, panel suggestions and scorecards key off this list.</p>
        </div>
      </div>
    </div>
  );
}

function Questions(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={3} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Question bank · 14 questions</div>
          <h1 className="tp-h1">What we ask</h1>
          <div className="tp-filters"><span className="badge tp-on">All</span><span className="badge">Kubernetes 4</span><span className="badge">Go 3</span><span className="badge">Behavioural 5</span></div>
          <div className="card tp-q"><strong>Walk me through a rollout that went wrong and what you changed afterwards.</strong><div className="mono-label">L3 · behavioural · Kubernetes, Ownership</div></div>
          <div className="card tp-q"><strong>How would you keep a Go service&apos;s p99 flat as traffic triples?</strong><div className="mono-label">L4 · system design · Go, Observability</div></div>
          <div className="card tp-q"><strong>When would you refuse a Terraform change in review?</strong><div className="mono-label">L2 · technical · Terraform</div></div>
        </div>
        <div className="card tp-form" style={{ width: "auto" }}>
          <h2 className="tp-h2">Add a question</h2>
          <label className="mono-label">Prompt</label><div className="tp-input">Tell me about a time you disagreed with a decision already made.</div>
          <div className="tp-fields">
            <div><label className="mono-label">Kind</label><div className="tp-input">situational</div></div>
            <div><label className="mono-label">Level</label><div className="tp-input">3</div></div>
          </div>
          <label className="mono-label">Competencies it probes</label><div className="tp-chips"><span className="skill-chip">Collaboration</span><span className="skill-chip">Go</span></div>
          <label className="mono-label">A strong answer usually covers</label><div className="tp-input">Named the trade-off, changed their mind or not, and why.</div>
          <button type="button">Add to the bank</button>
        </div>
      </div>
    </div>
  );
}

function Attributes(label: string | null) {
  const rows: [string, string][] = [
    ["Communication", "Says the hard thing clearly, in writing and in the room."],
    ["Collaboration", "Makes the people around them better, and asks for help early."],
    ["Ownership", "Treats the outcome as theirs, including the boring parts."],
    ["Curiosity", "Pulls on threads. Learns things nobody asked them to."],
    ["Values alignment", "Would we be proud of how they got the result?"],
  ];
  return (
    <div className="tp-shell">
      <Rail items={ADMIN_NAV} active={7} {...ADMIN} label={label} />
      <div className="tp-main">
        <div className="mono-label">Admin · scorecards</div>
        <h1 className="tp-h1">Ways of working</h1>
        <p className="muted tp-lede">Rated on every scorecard, next to the role&apos;s skills. The same list for every role; a 1 or a 5 needs a note on what was seen. Never shared with agencies.</p>
        <div className="card">
          {rows.map(([name, meaning], i) => (
            <div key={name} className="tp-rate"><span><strong>{name}</strong><div className="muted tp-small">{meaning}</div></span><span className="tp-chips"><span className="skill-chip">↑</span><span className="skill-chip">↓</span><span className="skill-chip">Edit</span><span className="skill-chip">{i === 4 ? "Retire" : "Retire"}</span></span></div>
          ))}
        </div>
        <div className="tp-cta"><button type="button">Add an attribute</button><span className="muted tp-small">Retired ones stay on old scorecards and can come back.</span></div>
      </div>
    </div>
  );
}

function Settings(label: string | null) {
  const Radio = ({ on, text }: { on: boolean; text: ReactNode }) => (
    <div className="tp-radio"><span className={`tp-radio-dot${on ? " on" : ""}`} /><span className="tp-small">{text}</span></div>
  );
  return (
    <div className="tp-shell">
      <Rail items={ADMIN_NAV} active={9} {...ADMIN} label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Admin · rules</div>
          <h1 className="tp-h1">Settings</h1>
          <div className="card">
            <div className="mono-label tp-section-first">Agency ownership</div>
            <Radio on text={<><strong>Per position.</strong> The claim covers this role only.</>} />
            <Radio on={false} text={<><strong>Organization-wide.</strong> Whoever introduced the person first owns them for every role.</>} />
            <div className="tp-fields" style={{ marginTop: 10 }}><div><label className="mono-label">Length of the claim</label><div className="tp-input">30 days</div></div><div><label className="mono-label">Default phone country</label><div className="tp-input">US</div></div></div>
          </div>
        </div>
        <div>
          <div className="card" style={{ marginTop: 58 }}>
            <div className="mono-label tp-section-first">Scorecards</div>
            <Radio on text={<><strong>Hidden until you have filed your own.</strong> Nobody is swayed by what a colleague wrote.</>} />
            <Radio on={false} text={<><strong>Open.</strong> Readable as soon as it is filed.</>} />
            <div className="mono-label tp-section">Work-in-progress caps</div>
            <div className="tp-fields"><div><label className="mono-label">Screening</label><div className="tp-input">12</div></div><div><label className="mono-label">Interviewing</label><div className="tp-input">10</div></div></div>
          </div>
          <div className="tp-cta"><button type="button">Save</button><button type="button" className="secondary">Discard changes</button></div>
        </div>
      </div>
    </div>
  );
}

function Appearance(label: string | null) {
  const swatches: [string, string, string, boolean][] = [
    ["Ledger", "#f6f3ec", "#2a78d6", true], ["Paper & navy", "#ffffff", "#1f3a68", false], ["Clean white", "#ffffff", "#1a6ff0", false], ["Forest", "#f4f3ee", "#1f6b3a", false],
    ["Oxblood", "#f8f3ee", "#7a1f2b", false], ["Graphite", "#f2f2f2", "#111111", false], ["Midnight", "#0f1626", "#79b8ff", false], ["Carbon", "#1a1a1a", "#ff8a3d", false],
  ];
  return (
    <div className="tp-shell">
      <Rail items={ADMIN_NAV} active={8} {...ADMIN} label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Admin · white-label</div>
          <h1 className="tp-h1">Appearance</h1>
          <div className="mono-label tp-section-first">Palette · 19 built in</div>
          <div className="tp-swatches">
            {swatches.map(([name, page, accent, on]) => (
              <div key={name} className={`tp-swatch${on ? " on" : ""}`}><span className="tp-swatch-chip" style={{ background: page }}><span style={{ background: accent }} /></span><span className="tp-small">{name}</span></div>
            ))}
          </div>
          <div className="mono-label tp-section">Override a colour</div>
          <div className="tp-rate"><span className="tp-small">Accent</span><span className="tp-chips"><span className="tp-swatch-chip" style={{ background: "#2a78d6" }} /><span className="mono-label">#2a78d6</span></span></div>
          <div className="tp-rate"><span className="tp-small">Rail background</span><span className="tp-chips"><span className="tp-swatch-chip" style={{ background: "#14130f" }} /><span className="mono-label">#14130f</span></span></div>
        </div>
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="tp-bar"><span className="tp-small"><strong>Today</strong> <span className="mono-label">1 / 8</span></span><span className="tp-chips"><span className="badge tp-on">Light</span><span className="badge">Dark</span><span className="skill-chip">‹</span><span className="skill-chip">›</span></span></div>
            <div style={{ height: 230, background: "var(--sunk)", display: "grid", placeItems: "center" }} className="muted tp-small">The eight main screens in the draft theme, browsed like pictures.</div>
          </div>
          <div className="tp-cta"><button type="button">Save for everyone</button><button type="button" className="secondary">Reset to palette</button></div>
        </div>
      </div>
    </div>
  );
}

function Submit(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={["Open roles", "Performance"]} active={0} who="Bridge Talent" role="Vendor portal" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">POS-001 · released to you 3 Oct</div>
          <h1 className="tp-h1">Senior Platform Engineer</h1>
          <p className="muted tp-lede">Hybrid · Austin · $95–120 / h. Must-haves: Kubernetes, Go.</p>
          <div className="card">
            <div className="mono-label tp-section-first">Your submissions for this role</div>
            <table className="data tp-table"><tbody>
              <tr><td><strong>Wei Zhang</strong></td><td className="num"><span className="badge">submitted</span></td></tr>
              <tr><td><strong>Maria Santos</strong></td><td className="num"><span className="badge warn">interviewing</span></td></tr>
            </tbody></table>
          </div>
        </div>
        <div className="card tp-form" style={{ width: "auto" }}>
          <h2 className="tp-h2">Submit a candidate</h2>
          <div className="tp-fields">
            <div><label className="mono-label">Full name</label><div className="tp-input">Nguyen Van An</div></div>
            <div><label className="mono-label">Email</label><div className="tp-input">an.nguyen@example.test</div></div>
            <div><label className="mono-label">Phone</label><div className="tp-input">+1 512 555 0142</div></div>
            <div><label className="mono-label">Current employer</label><div className="tp-input">Halcyon Data</div></div>
          </div>
          <label className="mono-label">Resume</label><div className="tp-input muted">an-nguyen-cv.pdf · 212 KB</div>
          <div className="tp-radio"><span className="tp-check on" /><span className="tp-small">The candidate agreed to be put forward for this role.</span></div>
          <button type="button">Submit</button>
          <p className="muted tp-small">If another agency introduced this person first, the answer is <em>already in process from another source</em>, and nothing more.</p>
        </div>
      </div>
    </div>
  );
}

function AddCandidate(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={4} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main">
        <div className="mono-label">POS-001 · Platform · Open</div>
        <h1 className="tp-h1">Senior Platform Engineer</h1>
        <div className="tp-cta" style={{ margin: 0 }}><button type="button">Add a candidate</button><button type="button" className="secondary">Share with agencies…</button></div>
      </div>
      <div className="tp-modal">
        <div className="card tp-form" style={{ width: 560 }}>
          <h2 className="tp-h2">Add a candidate</h2>
          <div className="tp-fields">
            <div><label className="mono-label">Full name</label><div className="tp-input">Katherine Walsh</div></div>
            <div><label className="mono-label">Email</label><div className="tp-input">k.walsh.new@example.test</div></div>
            <div><label className="mono-label">Phone</label><div className="tp-input">+1 512 555 0177</div></div>
            <div><label className="mono-label">Current employer</label><div className="tp-input">Halcyon Data</div></div>
          </div>
          <label className="mono-label">How they came to us</label>
          <div className="tp-radio"><span className="tp-radio-dot on" /><span className="tp-small"><strong>Applied directly.</strong> Careers site, a job board, an email to the team.</span></div>
          <div className="tp-radio"><span className="tp-radio-dot" /><span className="tp-small"><strong>Referred by an employee.</strong></span></div>
          <div className="tp-radio"><span className="tp-radio-dot" /><span className="tp-small"><strong>Internal move.</strong></span></div>
          <div className="leak tp-leak" style={{ borderLeftColor: "var(--warn)" }}><div className="mono-label">Already on file?</div><p className="tp-small">This may be <strong>Catherine Walsh</strong> (Halcyon Data), who is already on file with a different email. Same person?</p><div className="tp-cta"><button type="button">Yes, same person: attach their history</button><button type="button" className="secondary">No, a new person</button></div></div>
        </div>
      </div>
    </div>
  );
}

function Screen(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={1} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Screening · POS-001 Senior Platform Engineer · from Bridge Talent</div>
          <h1 className="tp-h1">Wei Zhang</h1>
          <div className="mono-label tp-section">What the role needs, and whether the CV shows it</div>
          <div className="tp-rate"><span className="skill-chip must">★ Kubernetes · 5y</span><span className="badge ok">6 years · Halcyon, Vireo</span></div>
          <div className="tp-rate"><span className="skill-chip must">★ Go · 3y</span><span className="badge warn">no evidence</span></div>
          <div className="tp-rate"><span className="skill-chip">Terraform</span><span className="badge ok">mentioned</span></div>
          <div className="tp-rate"><span className="skill-chip">PostgreSQL</span><span className="badge ok">4 years</span></div>
          <div className="leak tp-leak"><div className="mono-label">Considered before</div><p className="tp-small">Interviewed by the <strong>Data</strong> team in March 2025 for POS-002 · not selected after interview.</p></div>
        </div>
        <div className="card">
          <div className="mono-label tp-section-first">Your call</div>
          <p className="muted tp-small">One must-have has no evidence on the CV. Move them on if the agency&apos;s notes cover it, or reject at screening with a reason; a screening rejection is recorded apart from a panel one.</p>
          <div className="tp-cta" style={{ flexWrap: "wrap" }}><button type="button">Move into the loop</button><button type="button" className="secondary">Reject at screening…</button></div>
          <div className="mono-label tp-section">Resume</div>
          <div className="tp-well muted tp-small">wei-zhang-cv.pdf · 3 pages · parsed 14 skills</div>
        </div>
      </div>
    </div>
  );
}

function MatchReview(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={2} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main">
        <div className="mono-label">Match reviews · 1 waiting</div>
        <h1 className="tp-h1">Is this the same person?</h1>
        <p className="muted tp-lede">The matcher could not place this submission with confidence. Linking merges it into the existing candidate&apos;s history; keeping them separate creates a new candidate and teaches the engine not to ask again.</p>
        <div className="card">
          <table className="data tp-table">
            <thead><tr><th></th><th>Submitted by Second Street</th><th>On file · from Bridge Talent</th><th className="num">Evidence</th></tr></thead>
            <tbody>
              <tr><td className="mono-label">Name</td><td><strong>Catherine Walsh</strong></td><td><strong>Katherine Walsh</strong></td><td className="num"><span className="badge warn">name 92%</span></td></tr>
              <tr><td className="mono-label">Email</td><td>cwalsh@gmail.test</td><td>katherine.walsh@halcyon.test</td><td className="num"><span className="badge">different</span></td></tr>
              <tr><td className="mono-label">Phone</td><td>+1 512 555 0177</td><td>+1 (512) 555-0177</td><td className="num"><span className="badge ok">same number</span></td></tr>
              <tr><td className="mono-label">Employer</td><td>Halcyon Data</td><td>Halcyon Data</td><td className="num"><span className="badge ok">same</span></td></tr>
            </tbody>
          </table>
          <div className="tp-cta"><button type="button">Same person — link</button><button type="button" className="secondary">Keep separate</button><span className="mono-label">score 0.81 · review band</span></div>
        </div>
      </div>
    </div>
  );
}

function Schedule(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={1} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main">
        <div className="mono-label">Work / Pipeline</div>
        <h1 className="tp-h1">27 candidates in flight</h1>
      </div>
      <div className="tp-modal">
        <div className="card tp-form" style={{ width: 520 }}>
          <h2 className="tp-h2">Schedule interview</h2>
          <p className="muted tp-small"><strong>Wei Zhang</strong> · POS-001 Senior Platform Engineer</p>
          <div className="tp-fields">
            <div><label className="mono-label">Round</label><div className="tp-input">Technical round</div></div>
            <div><label className="mono-label">When</label><div className="tp-input">Thu 16 Oct · 14:00 · 60 min</div></div>
          </div>
          <label className="mono-label">Suggested panelists (skill-matched — click to add)</label>
          <div className="tp-chips"><span className="skill-chip must">✓ Ira Interviewer · Kubernetes, Go</span><span className="skill-chip must">✓ Morgan Manager · Go</span><span className="skill-chip">Ivo Interviewer · Terraform</span></div>
          <p className="muted tp-small">A seat on the panel is what gives Morgan a second persona: Interviewer, alongside Hiring manager.</p>
          <button type="button">Schedule</button>
        </div>
      </div>
    </div>
  );
}

function Interviews(label: string | null) {
  return (
    <div className="tp-shell">
      <Rail items={["Today", "My interviews", "Question bank"]} active={1} who="Ira Interviewer" role="Interviewer" label={label} />
      <div className="tp-main">
        <div className="mono-label">Panel assignments</div>
        <h1 className="tp-h1">My interviews</h1>
        <div className="mono-label tp-section" style={{ color: "var(--bad)" }}>Waiting on you · 1</div>
        <div className="tp-queue-row"><span className="figure tp-qn" style={{ color: "var(--bad)" }}>!</span><span><strong>Jordan Mitchell</strong> · POS-004 Frontend Engineer<br /><span className="muted">Technical round · finished yesterday · scorecard owed</span></span><span className="badge bad">overdue</span><span className="tp-chips"><span className="skill-chip">Quick file</span><span className="skill-chip">View scorecards</span></span></div>
        <div className="mono-label tp-section">Upcoming · 1</div>
        <div className="tp-queue-row"><span className="figure tp-qn">16</span><span><strong>Wei Zhang</strong> · POS-001 Senior Platform Engineer<br /><span className="muted">Technical round · Thu 16 Oct 14:00 · with Morgan Manager</span></span><span className="badge">in 3 days</span><span className="tp-chips"><span className="badge tp-on">Prepare →</span></span></div>
        <div className="mono-label tp-section">Filed · 2</div>
        <div className="tp-queue-row"><span className="figure tp-qn muted">✓</span><span><strong>Lucía Fernández</strong> · POS-005 ML Engineer<br /><span className="muted">Technical round · filed 19 Sep · yes (4/5)</span></span><span className="badge ok">filed</span><span className="mono-label">panel 2/2 in</span></div>
      </div>
    </div>
  );
}

function Persona(label: string | null) {
  return (
    <div className="tp-auth">
      <div className="tp-auth-side">
        <div className="tp-rail-brand">{label ?? <>Inter<span style={{ color: "var(--accent)" }}>/</span>VU</>}</div>
        <div className="mono-label tp-section">Northwind Labs</div>
        <p className="tp-statement">One person, two jobs. Pick the hat for today.</p>
      </div>
      <div className="tp-auth-main">
        <div className="card tp-form" style={{ width: 420 }}>
          <h2 className="tp-h2">Hiring manager or Interviewer?</h2>
          <p className="muted tp-small">Morgan, you have two roles here. Each sees its own Today and its own menu.</p>
          <div className="tp-radio"><span className="tp-radio-dot on" /><span className="tp-small"><strong>Hiring manager</strong> · Engineering<br /><span className="muted">Pipeline, debriefs, decisions. 1 thing waiting as Interviewer.</span></span></div>
          <div className="tp-radio"><span className="tp-radio-dot" /><span className="tp-small"><strong>Interviewer</strong><br /><span className="muted">My interviews, the room, your scorecards.</span></span></div>
          <div className="tp-radio"><span className="tp-check" /><span className="tp-small muted">Remember this choice; I can switch from the ⋯ menu.</span></div>
          <button type="button">Continue as Hiring manager</button>
        </div>
      </div>
    </div>
  );
}

function Analytics(label: string | null) {
  const funnel: [string, number][] = [["Submitted", 48], ["Screened", 31], ["Interviewed", 14], ["Offered", 5], ["Hired", 4]];
  return (
    <div className="tp-shell">
      <Rail items={ORG_NAV} active={6} who="Riley Recruiter" role="Recruiter" label={label} />
      <div className="tp-main tp-two">
        <div>
          <div className="mono-label">Insight · last 90 days</div>
          <h1 className="tp-h1">Where hiring stands</h1>
          <div className="tp-stats">
            <div><div className="mono-label">Time to offer</div><div className="figure tp-figure">18d</div></div>
            <div><div className="mono-label">Offer accept rate</div><div className="figure tp-figure">80%</div></div>
            <div><div className="mono-label">Open roles</div><div className="figure tp-figure">6</div></div>
          </div>
          <div className="mono-label tp-section">Funnel</div>
          {funnel.map(([stage, n]) => (
            <div key={stage} className="tp-funnel-row"><span className="mono-label">{stage}</span><span className="tp-funnel-bar"><span style={{ width: `${(n / 48) * 100}%` }} /></span><span className="figure tp-small">{n}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="mono-label tp-section-first">Channels</div>
          <table className="data tp-table">
            <thead><tr><th>Source</th><th className="num">Submitted</th><th className="num">Hired</th></tr></thead>
            <tbody>
              <tr><td>Bridge Talent</td><td className="num">22</td><td className="num">2</td></tr>
              <tr><td>Second Street Staffing</td><td className="num">15</td><td className="num">1</td></tr>
              <tr><td>Direct · careers</td><td className="num">8</td><td className="num">1</td></tr>
              <tr><td>Referral</td><td className="num">3</td><td className="num">0</td></tr>
            </tbody>
          </table>
          <p className="muted tp-small">Vendor performance (admin) puts the agencies side by side; Explorer draws the org chart as a sunburst down to positions.</p>
        </div>
      </div>
    </div>
  );
}

// ---- The registry ----

export interface MockScreen {
  key: string;
  name: string;
  body: (label: string | null) => ReactNode;
}

export const SCREENS: MockScreen[] = [
  { key: "today", name: "Today", body: Today },
  { key: "pipeline", name: "Pipeline", body: Pipeline },
  { key: "position", name: "Position", body: Position },
  { key: "room", name: "Interview room", body: Room },
  { key: "debrief", name: "Debrief", body: Debrief },
  { key: "candidate", name: "Candidate history", body: Candidate },
  { key: "vendor", name: "Vendor portal", body: Vendor },
  { key: "signin", name: "Sign-in", body: SignIn },
  { key: "teams", name: "Admin · Teams", body: Teams },
  { key: "people", name: "Admin · People & access", body: People },
  { key: "vendors", name: "Admin · Vendors", body: Vendors },
  { key: "new-position", name: "New position", body: NewPosition },
  { key: "questions", name: "Question bank", body: Questions },
  { key: "attributes", name: "Admin · Ways of working", body: Attributes },
  { key: "settings", name: "Admin · Settings", body: Settings },
  { key: "appearance", name: "Admin · Appearance", body: Appearance },
  { key: "submit", name: "Vendor portal · Submit a candidate", body: Submit },
  { key: "add-candidate", name: "Add a candidate", body: AddCandidate },
  { key: "screen", name: "Screening", body: Screen },
  { key: "match-review", name: "Match reviews", body: MatchReview },
  { key: "schedule", name: "Schedule interview", body: Schedule },
  { key: "interviews", name: "My interviews", body: Interviews },
  { key: "persona", name: "Choose a persona", body: Persona },
  { key: "analytics", name: "Analytics", body: Analytics },
];

/** What Admin → Appearance previews: the eight everyone meets. */
export const PREVIEW_KEYS = ["today", "pipeline", "position", "room", "debrief", "candidate", "vendor", "signin"];

export const findScreen = (key: string) => SCREENS.find((s) => s.key === key);
