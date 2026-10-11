"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { themeStyle, type ResolvedTheme } from "@/lib/theme";

/**
 * The main screens, mocked, rendered with a theme that may not be saved yet
 * (docs/01 §4, White-labeling).
 *
 * An admin choosing a palette should not have to open eight pages to see
 * what it does to a debrief or the vendor portal. Each mock is the real
 * components and classes (cards, badges, chips, the matrix cell) laid out
 * with made-up data, inside a frame that sets the theme's tokens as inline
 * custom properties, so what the strip shows is what the product will do.
 *
 * Browsed like pictures: one screen at a time, scroll-snapped, arrows and
 * dots, keyboard left/right.
 */

const W = 1120;
const H = 700;

interface Screen {
  key: string;
  name: string;
  body: ReactNode;
}

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

export function ThemePreview({ theme, mode, onMode }: { theme: ResolvedTheme; mode: "light" | "dark"; onMode: (m: "light" | "dark") => void }) {
  const tokens = mode === "dark" ? theme.dark : theme.light;
  const style = themeStyle(tokens, theme.font) as CSSProperties;
  const label = theme.label;
  const screens: Screen[] = [
    { key: "today", name: "Today", body: Today(label) },
    { key: "pipeline", name: "Pipeline", body: Pipeline(label) },
    { key: "position", name: "Position", body: Position(label) },
    { key: "room", name: "Interview room", body: Room(label) },
    { key: "debrief", name: "Debrief", body: Debrief(label) },
    { key: "candidate", name: "Candidate history", body: Candidate(label) },
    { key: "vendor", name: "Vendor portal", body: Vendor(label) },
    { key: "signin", name: "Sign-in", body: SignIn(label) },
  ];

  const stripRef = useRef<HTMLDivElement>(null);
  // Where the strip is heading, so a quick run of clicks counts from the
  // target rather than from wherever the smooth scroll happens to be.
  const target = useRef(0);
  const [scale, setScale] = useState(0.5);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    setScale(el.clientWidth / W);
    // A swipe or a scrollbar drag: adopt the frame once the scroll settles.
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const i = Math.round(el.scrollLeft / el.clientWidth);
        target.current = i;
        setIndex(i);
      }, 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      clearTimeout(t);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const go = (i: number) => {
    const el = stripRef.current;
    if (!el) return;
    const next = (i + screens.length) % screens.length;
    target.current = next;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  };

  return (
    <div
      className="tp"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(target.current + 1);
        if (e.key === "ArrowLeft") go(target.current - 1);
      }}
      aria-label="Preview of the main screens in this theme"
    >
      <div className="tp-bar">
        <div className="tp-title">
          <strong>{screens[index]?.name}</strong>
          <span className="mono-label">
            {index + 1} / {screens.length}
          </span>
        </div>
        <div className="tp-controls">
          <span className="tp-seg" role="group" aria-label="Preview mode">
            <button type="button" className={mode === "light" ? "on" : ""} onClick={() => onMode("light")}>Light</button>
            <button type="button" className={mode === "dark" ? "on" : ""} onClick={() => onMode("dark")}>Dark</button>
          </span>
          <button type="button" className="secondary tp-arrow" aria-label="Previous screen" onClick={() => go(target.current - 1)}>‹</button>
          <button type="button" className="secondary tp-arrow" aria-label="Next screen" onClick={() => go(target.current + 1)}>›</button>
        </div>
      </div>
      <div className="tp-strip" ref={stripRef}>
        {screens.map((s) => (
          <div key={s.key} className="tp-frame" style={{ height: H * scale }}>
            <div className="tp-screen" data-mode={mode} style={{ ...style, width: W, height: H, transform: `scale(${scale})` }}>
              {s.body}
            </div>
          </div>
        ))}
      </div>
      <div className="tp-dots">
        {screens.map((s, i) => (
          <button key={s.key} type="button" className={i === index ? "on" : ""} aria-label={s.name} title={s.name} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  );
}
