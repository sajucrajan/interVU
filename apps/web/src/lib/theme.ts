/**
 * White-labelling (docs/01 §4, White-labeling).
 *
 * An organization picks a palette, optionally overrides any token in it,
 * chooses a type family, and the whole product follows: workspace, vendor
 * portal and sign-in. Everything here is pure so the Appearance screen can
 * preview a theme it has not saved, and the same function then applies it
 * for real.
 *
 * Two rules from globals.css still hold:
 * - meaning colours (ok / warn / bad) are never themed, so a red brand does
 *   not read as an error;
 * - a palette always carries BOTH a light and a dark set, because every
 *   person keeps their own light/dark toggle. A "dark palette" is one whose
 *   default mode is dark, not one that removes the choice.
 */

/** The tokens an organization may set, per mode. */
export interface Tokens {
  page: string;
  bg: string;
  sunk: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  /** The rail (the left-hand band). Defaults to the page surfaces. */
  rail_bg: string;
  rail_fg: string;
}

export type TokenKey = keyof Tokens;

export const TOKEN_LABELS: { key: TokenKey; label: string; hint: string }[] = [
  { key: "accent", label: "Accent", hint: "Buttons, links, the active item" },
  { key: "page", label: "Page", hint: "Behind everything" },
  { key: "bg", label: "Cards", hint: "Cards, tables, the form fields" },
  { key: "sunk", label: "Wells", hint: "Inset areas and row hover" },
  { key: "fg", label: "Text", hint: "Headings and body" },
  { key: "muted", label: "Secondary text", hint: "Descriptions" },
  { key: "faint", label: "Labels", hint: "Small uppercase labels" },
  { key: "border", label: "Rules", hint: "Borders and dividers" },
  { key: "rail_bg", label: "Rail", hint: "The left-hand band" },
  { key: "rail_fg", label: "Rail text", hint: "Text on the rail" },
];

/** What is stored on organization.settings.branding. */
export interface Branding {
  /** Legacy, pre-palette: an accent alone. Still honoured. */
  accent?: string;
  product_label?: string;
  palette?: string | null;
  /** The mode people get before they touch the light/dark toggle. */
  mode?: "light" | "dark" | null;
  font?: string | null;
  overrides?: { light?: Partial<Tokens>; dark?: Partial<Tokens> } | null;
}

// ---------------------------------------------------------------- surfaces

type Surface = Omit<Tokens, "accent" | "rail_bg" | "rail_fg">;

/** Surface families: the paper the product is printed on. */
const LIGHT: Record<string, Surface> = {
  paper: { page: "#f2f0e9", bg: "#faf9f5", sunk: "#eceadf", fg: "#14130f", muted: "#5c5850", faint: "#6d695f", border: "#dcd8ca" },
  white: { page: "#f4f5f7", bg: "#ffffff", sunk: "#eceef1", fg: "#111318", muted: "#555b66", faint: "#636974", border: "#d9dce2" },
  cool: { page: "#eef1f5", bg: "#f7f9fb", sunk: "#e3e8ee", fg: "#141a22", muted: "#4f5a68", faint: "#5e6876", border: "#d3dae3" },
  mist: { page: "#e9f0f7", bg: "#f5f9fd", sunk: "#dde7f1", fg: "#0f1a26", muted: "#4b5a6b", faint: "#5a697a", border: "#cfdbe7" },
  sand: { page: "#f3ede2", bg: "#fbf7ef", sunk: "#ebe3d3", fg: "#1c1710", muted: "#5f564a", faint: "#6c6356", border: "#ddd3c2" },
  lilac: { page: "#f0edf6", bg: "#f9f7fc", sunk: "#e7e2f0", fg: "#16121f", muted: "#585069", faint: "#655d75", border: "#d9d2e4" },
};

const DARK: Record<string, Surface> = {
  ink: { page: "#100f0e", bg: "#1a1917", sunk: "#141312", fg: "#f5f3ec", muted: "#a6a196", faint: "#858176", border: "#2b2926" },
  midnight: { page: "#0b1220", bg: "#121a2b", sunk: "#0e1524", fg: "#e9eef7", muted: "#9aa6ba", faint: "#8491a6", border: "#243049" },
  carbon: { page: "#0f1012", bg: "#17191c", sunk: "#121316", fg: "#f0f1f3", muted: "#a3a7ad", faint: "#8a8f96", border: "#2a2d32" },
  pine: { page: "#0b1410", bg: "#122019", sunk: "#0d1813", fg: "#e8f1ec", muted: "#9db3a6", faint: "#86998e", border: "#223229" },
  plum: { page: "#130d18", bg: "#1c1424", sunk: "#150f1c", fg: "#f1eaf6", muted: "#ad9fba", faint: "#95889f", border: "#2e2338" },
  black: { page: "#000000", bg: "#0d0d0d", sunk: "#070707", fg: "#f2f2f2", muted: "#a0a0a0", faint: "#8a8a8a", border: "#262626" },
};

// ---------------------------------------------------------------- palettes

export interface Palette {
  key: string;
  name: string;
  blurb: string;
  /** Designed for this mode; people can still flip. */
  mode: "light" | "dark";
  light: Tokens;
  dark: Tokens;
}

type Rail = { bg: string; fg: string } | null;

function build(
  key: string,
  name: string,
  blurb: string,
  mode: "light" | "dark",
  light: { surface: string; accent: string; rail?: Rail },
  dark: { surface: string; accent: string; rail?: Rail },
): Palette {
  const l = LIGHT[light.surface]!;
  const d = DARK[dark.surface]!;
  return {
    key,
    name,
    blurb,
    mode,
    light: { ...l, accent: light.accent, rail_bg: light.rail?.bg ?? l.bg, rail_fg: light.rail?.fg ?? l.fg },
    dark: { ...d, accent: dark.accent, rail_bg: dark.rail?.bg ?? d.bg, rail_fg: dark.rail?.fg ?? d.fg },
  };
}

/**
 * The built-in palettes. Light ones first, then dark. Each is a complete
 * look, not just a colour: paper, rail and accent chosen together.
 */
export const PALETTES: Palette[] = [
  build("ledger", "Ledger", "Warm paper and signal blue. The default.", "light",
    { surface: "paper", accent: "#2a78d6" }, { surface: "ink", accent: "#4f93e6" }),
  build("paper-navy", "Paper & navy", "White pages, a navy rail, blue accents. The classic enterprise look.", "light",
    { surface: "white", accent: "#1f5fbf", rail: { bg: "#1b2a4a", fg: "#f4f6fb" } },
    { surface: "midnight", accent: "#6ea3f0", rail: { bg: "#0b1220", fg: "#e9eef7" } }),
  build("clean-white", "Clean white", "Pure white, bright blue, nothing else.", "light",
    { surface: "white", accent: "#1a73e8" }, { surface: "carbon", accent: "#7ab3ff" }),
  build("slate", "Slate", "Cool grey surfaces with an indigo accent.", "light",
    { surface: "cool", accent: "#4f5bd5" }, { surface: "midnight", accent: "#8e97f0" }),
  build("sky", "Sky", "Blue-tinted pages and a cobalt accent.", "light",
    { surface: "mist", accent: "#1457c7" }, { surface: "midnight", accent: "#6ea3f0" }),
  build("forest", "Forest", "Paper, a deep green rail, green accents.", "light",
    { surface: "paper", accent: "#1f7a5a", rail: { bg: "#16382b", fg: "#e8f1ec" } },
    { surface: "pine", accent: "#5fcf9f" }),
  build("teal", "Teal", "White pages, a teal rail, teal accents.", "light",
    { surface: "white", accent: "#0f7c86", rail: { bg: "#0f5c63", fg: "#e6f6f7" } },
    { surface: "pine", accent: "#5fc9d2" }),
  build("oxblood", "Oxblood", "Cream pages and a burgundy accent.", "light",
    { surface: "sand", accent: "#a32f3a" }, { surface: "ink", accent: "#e07a82" }),
  build("amber", "Amber", "Warm pages, a charcoal rail, amber accents.", "light",
    { surface: "sand", accent: "#c9790f", rail: { bg: "#26231f", fg: "#f5efe3" } },
    { surface: "carbon", accent: "#f0b25a" }),
  build("lavender", "Lavender", "Lilac pages with a violet accent.", "light",
    { surface: "lilac", accent: "#6b4bd6" }, { surface: "plum", accent: "#b39cf5" }),
  build("graphite", "Graphite", "No colour at all: greys, a black rail, a black accent.", "light",
    { surface: "white", accent: "#2b2b2b", rail: { bg: "#1c1c1c", fg: "#f2f2f2" } },
    { surface: "carbon", accent: "#e6e6e6" }),
  build("terracotta", "Terracotta", "Sand pages with a terracotta accent.", "light",
    { surface: "sand", accent: "#c2552c" }, { surface: "ink", accent: "#f08a66" }),
  build("rose", "Rose", "White pages with a rose accent.", "light",
    { surface: "white", accent: "#c2366b" }, { surface: "plum", accent: "#f27aa6" }),
  build("midnight", "Midnight", "Navy-black surfaces and a sky-blue accent. Dark by default.", "dark",
    { surface: "mist", accent: "#1f5fbf" }, { surface: "midnight", accent: "#6ea3f0" }),
  build("carbon", "Carbon", "Neutral dark greys with an orange accent. Dark by default.", "dark",
    { surface: "white", accent: "#d9570f" }, { surface: "carbon", accent: "#ff8a3d" }),
  build("pine", "Pine", "Green-black surfaces with a mint accent. Dark by default.", "dark",
    { surface: "paper", accent: "#1f7a5a" }, { surface: "pine", accent: "#5fcf9f" }),
  build("plum", "Plum", "Purple-black surfaces with a pink accent. Dark by default.", "dark",
    { surface: "lilac", accent: "#8a3fb3" }, { surface: "plum", accent: "#e38cf2" }),
  build("oled", "OLED black", "True black with a blue accent. Dark by default.", "dark",
    { surface: "white", accent: "#1a73e8" }, { surface: "black", accent: "#4f93e6" }),
  build("ember", "Ember", "Warm dark surfaces, a brown rail, amber accents. Dark by default.", "dark",
    { surface: "sand", accent: "#b86a0a" },
    { surface: "ink", accent: "#f0a040", rail: { bg: "#1e1612", fg: "#f5efe3" } }),
];

export const DEFAULT_PALETTE = "ledger";

export const paletteByKey = (key: string | null | undefined): Palette =>
  PALETTES.find((p) => p.key === key) ?? PALETTES[0]!;

// ---------------------------------------------------------------- fonts

export interface FontChoice {
  key: string;
  name: string;
  blurb: string;
  /** CSS font-family stacks. Null keeps the bundled face. */
  display: string | null;
  ui: string | null;
  mono: string | null;
}

/**
 * Type families. The default is the bundled trio; the others are system
 * stacks, so a choice never costs a download and reads the same everywhere
 * the organization's people happen to be.
 */
export const FONTS: FontChoice[] = [
  { key: "ledger", name: "Ledger", blurb: "Bricolage for figures, Instrument for text, JetBrains for labels. The default.", display: null, ui: null, mono: null },
  { key: "system", name: "System", blurb: "Whatever the device uses: San Francisco, Segoe, Roboto.", display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", ui: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", mono: null },
  { key: "classic", name: "Classic", blurb: "Serif headings over a plain sans body.", display: "Georgia, 'Times New Roman', Times, serif", ui: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", mono: null },
  { key: "grotesk", name: "Grotesk", blurb: "Helvetica and Arial throughout.", display: "'Helvetica Neue', Helvetica, Arial, sans-serif", ui: "'Helvetica Neue', Helvetica, Arial, sans-serif", mono: null },
  { key: "humanist", name: "Humanist", blurb: "Palatino headings, Verdana body. Wide and easy to read.", display: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", ui: "Verdana, Geneva, Tahoma, sans-serif", mono: null },
];

export const fontByKey = (key: string | null | undefined): FontChoice =>
  FONTS.find((f) => f.key === key) ?? FONTS[0]!;

// ---------------------------------------------------------------- colour maths

export const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Relative luminance, for picking ink on an accent. */
export function luminance(hex: string): number {
  const srgb = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
}

/** Text that reads on a colour: near-black on light, white on dark. */
export const inkFor = (hex: string) => (luminance(hex) > 0.45 ? "#14130f" : "#ffffff");

export const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** `t` of `b` mixed into `a`. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// ---------------------------------------------------------------- resolution

export interface ResolvedTheme {
  palette: Palette;
  font: FontChoice;
  mode: "light" | "dark";
  light: Tokens;
  dark: Tokens;
  label: string | null;
}

const clean = (o: Partial<Tokens> | undefined | null): Partial<Tokens> => {
  const out: Partial<Tokens> = {};
  for (const { key } of TOKEN_LABELS) {
    const v = o?.[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v.toLowerCase();
  }
  return out;
};

/** Palette, then the organization's overrides on top. */
export function resolveTheme(branding: Branding | null | undefined): ResolvedTheme {
  const palette = paletteByKey(branding?.palette);
  const font = fontByKey(branding?.font);
  // The legacy accent-only setting still works: it is an override of the
  // accent in both modes.
  const legacy: Partial<Tokens> =
    branding?.accent && HEX.test(branding.accent) && !branding.palette ? { accent: branding.accent.toLowerCase() } : {};
  return {
    palette,
    font,
    mode: branding?.mode === "dark" || branding?.mode === "light" ? branding.mode : palette.mode,
    light: { ...palette.light, ...legacy, ...clean(branding?.overrides?.light) },
    dark: { ...palette.dark, ...legacy, ...clean(branding?.overrides?.dark) },
    label: branding?.product_label?.trim() || null,
  };
}

/** The CSS custom properties for one mode, as a declaration block. */
export function declarations(t: Tokens): string {
  const railMuted = mix(t.rail_fg, t.rail_bg, 0.32);
  const railFaint = mix(t.rail_fg, t.rail_bg, 0.45);
  const railBorder = mix(t.rail_fg, t.rail_bg, 0.86);
  const railSunk = mix(t.rail_fg, t.rail_bg, 0.92);
  return [
    `--page:${t.page}`,
    `--bg:${t.bg}`,
    `--sunk:${t.sunk}`,
    `--fg:${t.fg}`,
    `--muted:${t.muted}`,
    `--faint:${t.faint}`,
    `--border:${t.border}`,
    `--hairline:${alpha(t.fg, 0.1)}`,
    `--hatch:${alpha(t.fg, 0.1)}`,
    `--accent:${t.accent}`,
    `--accent-ink:${inkFor(t.accent)}`,
    `--accent-wash:${alpha(t.accent, 0.1)}`,
    `--rail-bg:${t.rail_bg}`,
    `--rail-fg:${t.rail_fg}`,
    `--rail-muted:${railMuted}`,
    `--rail-faint:${railFaint}`,
    `--rail-border:${railBorder}`,
    `--rail-sunk:${railSunk}`,
  ].join(";");
}

function fontDeclarations(f: FontChoice): string {
  const out: string[] = [];
  if (f.display) out.push(`--font-display:${f.display}`);
  if (f.ui) out.push(`--font-ui:${f.ui}`);
  if (f.mono) out.push(`--font-mono:${f.mono}`);
  return out.join(";");
}

/**
 * The stylesheet for a theme. Scoped to a selector so the Appearance page
 * can render several previews side by side; `:root` for the real thing.
 */
export function themeCss(theme: ResolvedTheme, scope = ":root"): string {
  const fonts = fontDeclarations(theme.font);
  const light = `${scope}{${declarations(theme.light)}${fonts ? ";" + fonts : ""}}`;
  const dark =
    scope === ":root"
      ? `html[data-theme="dark"]{${declarations(theme.dark)}}`
      : `${scope}[data-theme="dark"]{${declarations(theme.dark)}}`;
  return light + "\n" + dark;
}

const STYLE_ID = "intervu-org-theme";
const TOGGLE_KEY = "intervu-theme";

/**
 * Apply an organization's branding to the live document: one style element
 * in the head, replaced on every call so previewing and saving share a
 * path. The default mode is applied only to someone who has never touched
 * the light/dark toggle; a stored choice always wins.
 */
export function applyBranding(branding: Branding | null | undefined): ResolvedTheme {
  const theme = resolveTheme(branding);
  if (typeof document === "undefined") return theme;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = themeCss(theme);
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(TOGGLE_KEY);
  } catch {
    // Private mode: fall through to the organization's default.
  }
  if (!stored) document.documentElement.dataset.theme = theme.mode;
  return theme;
}

/** Inline style for a scoped preview element. */
export function themeStyle(t: Tokens, font: FontChoice): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of declarations(t).split(";")) {
    const i = d.indexOf(":");
    out[d.slice(0, i)] = d.slice(i + 1);
  }
  for (const d of fontDeclarations(font).split(";").filter(Boolean)) {
    const i = d.indexOf(":");
    out[d.slice(0, i)] = d.slice(i + 1);
  }
  return out;
}
