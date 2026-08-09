import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Text tokens must stay readable.
 *
 * `--faint` shipped at 2.99:1 against the page in light mode, where WCAG AA
 * asks 4.5:1 for text this size — and `.mono-label`, its loudest consumer, is
 * 10px uppercase mono, the hardest thing on the page to read. Nothing caught
 * it because contrast is invisible to a type checker and to a reviewer who
 * can see well on a good monitor.
 *
 * Checking every surface matters as much as checking every token: the first
 * fix cleared --page and --bg and still failed on --sunk at 4.28:1. A label
 * that passes until you hover the row is not a label that passes.
 *
 * Lives in the API package because that is the only workspace with a test
 * runner; `how-it-works.test.ts` next door already reads from apps/web for
 * the same reason. If the web app ever gains one, this belongs there.
 */

const CSS = readFileSync(
  join(__dirname, "../../../../apps/web/src/app/globals.css"),
  "utf8",
);

/** The declarations inside a selector's first block. */
function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`No ${selector} block in globals.css`);
  const block = CSS.slice(start, CSS.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    out[name!] = value!;
  }
  return out;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (
    0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
  );
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Every background a run of text can land on. */
const SURFACES = ["--page", "--bg", "--sunk"] as const;
/** Tokens used as `color` on those surfaces. */
const INKS = ["--faint", "--muted", "--fg"] as const;

const THEMES = {
  light: tokens(":root"),
  dark: tokens('[data-theme="dark"]'),
};

describe("text tokens meet WCAG AA on every surface", () => {
  it("parsed both theme blocks (the regex still matches)", () => {
    // Without this, a restructure of globals.css would make the loops below
    // iterate over nothing and pass while checking absolutely nothing.
    for (const [name, t] of Object.entries(THEMES)) {
      expect(Object.keys(t).length, `${name} token count`).toBeGreaterThan(8);
      for (const key of [...SURFACES, ...INKS]) {
        expect(t[key], `${name} ${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  for (const [theme, t] of Object.entries(THEMES)) {
    for (const ink of INKS) {
      for (const surface of SURFACES) {
        it(`${theme}: ${ink} on ${surface}`, () => {
          const ratio = contrast(t[ink]!, t[surface]!);
          expect(
            ratio,
            `${ink} (${t[ink]}) on ${surface} (${t[surface]}) is ${ratio}:1, ` +
              `below the 4.5:1 AA minimum for normal-size text`,
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

/**
 * --accent is knowingly excluded above and pinned here instead.
 *
 * It measures 3.87:1 in light and 3.98:1 in dark: fine for large or bold text,
 * short of AA for body-size links. Raising it means moving the brand colour,
 * which touches buttons, chart series and the sunburst — a decision about the
 * product's identity rather than a contrast patch.
 *
 * This asserts it has not drifted WORSE while we wait, and will fail as a
 * useful reminder if someone improves it, at which point delete this and add
 * --accent to INKS.
 */
describe("--accent, known below AA for body text", () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    it(`${theme}: still clears 3:1 for large/bold text`, () => {
      for (const surface of SURFACES) {
        expect(
          contrast(t["--accent"] ?? THEMES.light["--accent"]!, t[surface]!),
          `--accent on ${surface} in ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
