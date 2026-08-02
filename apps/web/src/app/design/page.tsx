"use client";

import { useEffect, useState } from "react";
import { SectionHead } from "@/components/section-head";
import { AgePill } from "@/components/age-pill";
import { ActionsMenu } from "@/components/actions-menu";

/**
 * The design system, rendered with the REAL tokens and the REAL components
 * (design option 1g).
 *
 * Deliberately not in the rail: nobody doing hiring work needs a type scale.
 * It exists because a static mock cannot catch drift — the day a token moves,
 * a picture in a design file and the running app disagree and nobody notices.
 *
 * The accent swatches and theme toggle make it the executable form of the
 * acceptance checklist: set an oxblood brand and confirm at a glance that
 * nothing reads as an error, that no status becomes ambiguous, and that the
 * blocked texture still survives.
 */

/** Brands to test against. Meaning colours must not move when these do. */
const ACCENTS = [
  { name: "Signal blue (default)", hex: "#2a78d6" },
  { name: "Deep violet", hex: "#6b4bd6" },
  { name: "Forest", hex: "#1f7a5a" },
  { name: "Oxblood", hex: "#a32f3a" },
  { name: "Amber", hex: "#d98a12" },
  { name: "Graphite", hex: "#3b3a36" },
];

const STATE_CHIPS: { label: string; cls: string }[] = [
  { label: "Accepted", cls: "ok" },
  { label: "Duplicate", cls: "warn" },
  { label: "SLA breached", cls: "bad" },
  { label: "Do not hire", cls: "bad" },
  { label: "Re-applicant", cls: "warn" },
  { label: "Draft", cls: "" },
];

/** Mirrors rail.tsx, so the page proves the same derivation the app uses. */
function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
  return L > 0.45 ? "#14130f" : "#ffffff";
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export default function DesignSystemPage() {
  const [accent, setAccent] = useState(ACCENTS[0]!.hex);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);

  const applyAccent = (hex: string) => {
    const root = document.documentElement.style;
    const n = parseInt(hex.slice(1), 16);
    root.setProperty("--accent", hex);
    root.setProperty("--accent-ink", inkFor(hex));
    root.setProperty(
      "--accent-wash",
      `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.1)`,
    );
    setAccent(hex);
  };

  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <main className="wide">
      {/* ---- Control strip: everything below responds to these two ---- */}
      <header className="page-head">
        <div>
          <div className="mono-label">InterVU · design system</div>
          <h1 style={{ marginTop: 12 }}>Atoms</h1>
          <p className="dossier-meta" style={{ maxWidth: "62ch" }}>
            The live components, not a picture of them. Change the brand or the
            theme and every atom below re-reads — which is the acceptance test.
          </p>
        </div>
        <div>
          <div className="mono-label" style={{ marginBottom: 8 }}>
            Accent
          </div>
          <div className="row" style={{ gap: 6 }}>
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                title={a.name}
                aria-label={a.name}
                onClick={() => applyAccent(a.hex)}
                className={`swatch${accent === a.hex ? " active" : ""}`}
                style={{ background: a.hex }}
              />
            ))}
            <button type="button" className="range-chip" onClick={flipTheme}>
              {theme === "dark" ? "☾ dark" : "☀ light"}
            </button>
          </div>
        </div>
      </header>

      <div className="atoms-grid">
        <section>
          <SectionHead label="Type scale" />
          <div className="figure" style={{ fontSize: 58, lineHeight: 1 }}>
            248
          </div>
          <p className="mono-label" style={{ marginTop: 8 }}>
            Bricolage Grotesque 700 · −3.5% tracking · tabular
          </p>
          <h2 style={{ marginTop: "var(--step-5)" }}>Screening → Interviewing</h2>
          <p style={{ maxWidth: "48ch" }}>
            Instrument Sans carries all reading text at 15px minimum — the old UI
            dropped to 11.7px for table headers.
          </p>
          <p className="mono-label">POS-004 · 2026-08-01 · 96% · ⌘K</p>

          <SectionHead label="Buttons" />
          <div className="row">
            <button type="button">Record decision</button>
            <button type="button" className="secondary">
              Schedule
            </button>
            <button type="button" className="danger">
              Reject
            </button>
            <ActionsMenu
              items={[
                { label: "Example", heading: true },
                { label: "Open history" },
                { label: "Reject with reason", tone: "danger" },
              ]}
            />
          </div>
          <p style={{ marginTop: "var(--step-3)" }}>
            <a href="#">Open history</a>
          </p>
        </section>

        <section>
          <SectionHead label="State chips" />
          <div className="row" style={{ gap: 8 }}>
            {STATE_CHIPS.map((c) => (
              <span key={c.label} className={`badge ${c.cls}`}>
                {c.label}
              </span>
            ))}
          </div>

          <SectionHead label="Skill chips" />
          <div className="row" style={{ gap: 6 }}>
            <span className="skill-chip must">Go</span>
            <span className="skill-chip must">Kubernetes</span>
            <span className="skill-chip">Terraform</span>
          </div>

          <SectionHead label="Aging pills" />
          <div className="row" style={{ gap: 14 }}>
            <AgePill since={hoursAgo(4)} sla={48} />
            <AgePill since={hoursAgo(51)} sla={48} />
            <AgePill since={hoursAgo(264)} sla={48} />
            <AgePill since={null} />
          </div>

          <SectionHead label="Texture · blocked state" />
          <div className="hatched blocked-demo">Duplicate — ownership lost</div>
          <p className="muted" style={{ fontSize: 13 }}>
            Blocked states carry a texture as well as a colour, so they survive
            greyscale, colour blindness and a red brand.
          </p>
        </section>

        <section>
          <SectionHead label="Accent-proofing" />
          <p style={{ maxWidth: "44ch" }}>
            Accent is used for one structural fill, one active marker, and links.
            Meaning colours (ok / warn / bad) are fixed, so a red-branded org
            never reads its own brand as &ldquo;failure&rdquo;.
          </p>
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              type="button"
              className="swatch-row"
              style={{ borderLeftColor: a.hex }}
              onClick={() => applyAccent(a.hex)}
            >
              <span className="swatch-dot" style={{ background: a.hex }} />
              <span className="swatch-name">{a.name}</span>
              <span className="mono-label">{a.hex}</span>
            </button>
          ))}

          <SectionHead label="Meaning colours" />
          <div className="row" style={{ gap: 8 }}>
            <span className="badge ok">ok</span>
            <span className="badge warn">warn</span>
            <span className="badge bad">bad</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            These never move when the brand does. Cycle the swatches above and
            confirm nothing here changes.
          </p>
        </section>
      </div>
    </main>
  );
}
