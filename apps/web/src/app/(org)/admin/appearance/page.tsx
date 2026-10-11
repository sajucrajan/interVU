"use client";

import { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage, isForbidden } from "@/lib/api";
import { AccessDenied } from "@/components/access-denied";
import { PageHead } from "@/components/page-head";
import { SectionHead } from "@/components/section-head";
import { ThemePreview } from "@/components/theme-preview";
import {
  applyBranding,
  FONTS,
  HEX,
  PALETTES,
  resolveTheme,
  TOKEN_LABELS,
  type Branding,
  type TokenKey,
} from "@/lib/theme";

interface Settings {
  name: string;
  slug: string;
  settings: { branding?: Branding | null } & Record<string, unknown>;
}

const EMPTY: Branding = { palette: "ledger", mode: null, font: "ledger", overrides: { light: {}, dark: {} }, product_label: "" };

/**
 * Appearance (docs/01 §4, White-labeling): the organization's look.
 *
 * Pick a palette, then change anything in it; choose a type family; name
 * the product. The strip on the right shows the main screens in the draft
 * before it is saved, so nobody has to open eight pages to judge a colour.
 * Saving applies it to everyone in the organization, the vendor portal and
 * the sign-in page, on their next load.
 */
export default function AppearancePage() {
  const [saved, setSaved] = useState<Branding | null>(null);
  const [draft, setDraft] = useState<Branding>(EMPTY);
  const [orgName, setOrgName] = useState("");
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const [editMode, setEditMode] = useState<"light" | "dark">("light");
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api<Settings>("/settings")
      .then((s) => {
        const b: Branding = { ...EMPTY, ...(s.settings.branding ?? {}) };
        if (!b.overrides) b.overrides = { light: {}, dark: {} };
        if (!b.palette) b.palette = "ledger";
        setSaved(b);
        setDraft(b);
        setOrgName(s.name);
        const t = resolveTheme(b);
        setPreviewMode(t.mode);
        setEditMode(t.mode);
      })
      .catch((e) => {
        if (isForbidden(e)) setDenied(true);
        else setError(apiErrorMessage(e));
      });
  }, []);

  const theme = useMemo(() => resolveTheme(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  if (denied) {
    return (
      <AccessDenied
        what="Appearance"
        why="The organization's look is a setting, so it sits with the admin."
        back={{ href: "/dashboard", label: "Back to Today" }}
      />
    );
  }
  if (!saved) return <main className="wide muted">{error ?? "Loading…"}</main>;

  const palette = theme.palette;
  const overrides = draft.overrides?.[editMode] ?? {};
  const base = editMode === "dark" ? palette.dark : palette.light;
  const current = editMode === "dark" ? theme.dark : theme.light;

  const pick = (key: string) => {
    const p = PALETTES.find((x) => x.key === key)!;
    // A new palette starts clean: overrides were tuned against the old one.
    setDraft({ ...draft, palette: key, overrides: { light: {}, dark: {} } });
    setPreviewMode(draft.mode ?? p.mode);
    setEditMode(draft.mode ?? p.mode);
  };

  const setToken = (key: TokenKey, value: string | null) => {
    const next = { ...overrides };
    if (value === null || value.toLowerCase() === base[key].toLowerCase()) delete next[key];
    else if (HEX.test(value)) next[key] = value.toLowerCase();
    setDraft({ ...draft, overrides: { ...draft.overrides, [editMode]: next } });
  };

  const overrideCount = Object.keys(draft.overrides?.light ?? {}).length + Object.keys(draft.overrides?.dark ?? {}).length;

  async function save() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const body: Branding = {
        palette: draft.palette ?? "ledger",
        mode: draft.mode ?? null,
        font: draft.font ?? "ledger",
        product_label: draft.product_label?.trim() ?? "",
        overrides: { light: draft.overrides?.light ?? {}, dark: draft.overrides?.dark ?? {} },
      };
      await api("/settings", { method: "PATCH", body: { branding: body } });
      setSaved({ ...EMPTY, ...body });
      setDraft({ ...EMPTY, ...body });
      // Immediately, for this window; everyone else on their next load.
      applyBranding(body);
      setFlash("Saved. Everyone sees it on their next page load.");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wide">
      <PageHead
        kicker="Admin · look and feel"
        title="Appearance"
        lede={`How InterVU looks for everyone at ${orgName}: the workspace, the vendor portal and the sign-in page. Start from a palette, change anything in it, and watch the main screens on the right before you save.`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setDraft(saved)}>
              Discard changes
            </button>
            <button type="button" disabled={!dirty || busy} onClick={save}>
              {busy ? "Saving…" : "Save for everyone"}
            </button>
          </div>
        }
      />
      {error && <p className="error">{error}</p>}
      {flash && !dirty && <p className="ap-flash">{flash}</p>}
      {dirty && <p className="ap-flash muted">Unsaved changes. The preview shows them; nobody else does yet.</p>}

      <div className="ap">
        <div className="ap-controls">
          <SectionHead label={`Palette · ${palette.name}`} action={<span className="mono-label">{PALETTES.length} built in</span>} />
          <div className="ap-palettes" role="radiogroup" aria-label="Palette">
            {PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={draft.palette === p.key}
                className={`ap-palette${draft.palette === p.key ? " on" : ""}`}
                onClick={() => pick(p.key)}
                title={p.blurb}
              >
                <span className="ap-swatches" aria-hidden>
                  {(p.mode === "dark" ? [p.dark, p.light] : [p.light, p.dark]).map((t, i) => (
                    <span key={i} className="ap-swatch" style={{ background: t.page }}>
                      <i style={{ background: t.rail_bg, borderColor: t.border }} />
                      <i style={{ background: t.bg, borderColor: t.border }} />
                      <b style={{ background: t.accent }} />
                    </span>
                  ))}
                </span>
                <span className="ap-palette-name">
                  {p.name}
                  {p.mode === "dark" && <span className="mono-label"> · dark</span>}
                </span>
                <span className="ap-palette-blurb muted">{p.blurb}</span>
              </button>
            ))}
          </div>

          <SectionHead
            label={`Fine-tune${overrideCount ? ` · ${overrideCount} changed` : ""}`}
            action={
              <span className="tp-seg" role="group" aria-label="Which mode to edit">
                <button type="button" className={editMode === "light" ? "on" : ""} onClick={() => { setEditMode("light"); setPreviewMode("light"); }}>Light</button>
                <button type="button" className={editMode === "dark" ? "on" : ""} onClick={() => { setEditMode("dark"); setPreviewMode("dark"); }}>Dark</button>
              </span>
            }
          />
          <p className="muted ap-hint">
            Every palette has a light and a dark set, because people keep their own light/dark switch. Change a colour here and it applies to the {editMode} set only.
            Status colours (green, amber, red) are never themed, so a red brand can never read as an error.
          </p>
          <div className="ap-tokens">
            {TOKEN_LABELS.map(({ key, label, hint }) => {
              const changed = key in overrides;
              return (
                <label key={key} className={`ap-token${changed ? " changed" : ""}`}>
                  <input
                    type="color"
                    id={`tok-${editMode}-${key}`}
                    value={current[key]}
                    onChange={(e) => setToken(key, e.target.value)}
                    aria-label={`${label} colour`}
                  />
                  <span className="ap-token-main">
                    <span className="ap-token-label">{label}</span>
                    <span className="muted ap-token-hint">{hint}</span>
                  </span>
                  <input
                    type="text"
                    className="ap-hex"
                    value={current[key]}
                    maxLength={7}
                    spellCheck={false}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (HEX.test(v)) setToken(key, v);
                    }}
                    aria-label={`${label} hex value`}
                  />
                  {changed ? (
                    <button type="button" className="secondary ap-reset" onClick={() => setToken(key, null)} title={`Back to the palette's ${base[key]}`}>
                      ↺
                    </button>
                  ) : (
                    <span className="ap-reset" aria-hidden />
                  )}
                </label>
              );
            })}
          </div>

          <SectionHead label="Type" />
          <div className="ap-fonts" role="radiogroup" aria-label="Type family">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={(draft.font ?? "ledger") === f.key}
                className={`ap-font${(draft.font ?? "ledger") === f.key ? " on" : ""}`}
                onClick={() => setDraft({ ...draft, font: f.key })}
                style={{ fontFamily: f.ui ?? undefined }}
              >
                <span className="ap-font-sample" style={{ fontFamily: f.display ?? undefined }}>Aa 27</span>
                <span className="ap-font-name">{f.name}</span>
                <span className="muted ap-font-blurb">{f.blurb}</span>
              </button>
            ))}
          </div>

          <SectionHead label="Name and default mode" />
          <div className="ap-misc">
            <label>
              <span className="ap-token-label">Product name</span>
              <input
                type="text"
                id="product-label"
                value={draft.product_label ?? ""}
                maxLength={60}
                placeholder="InterVU"
                onChange={(e) => setDraft({ ...draft, product_label: e.target.value })}
              />
              <span className="muted ap-token-hint">Shown in the rail and on sign-in instead of InterVU.</span>
            </label>
            <div>
              <span className="ap-token-label">Mode before anyone touches the switch</span>
              <div className="row" style={{ gap: 14, marginTop: 6 }}>
                {([
                  [null, `Palette default (${palette.mode})`],
                  ["light", "Light"],
                  ["dark", "Dark"],
                ] as const).map(([v, l]) => (
                  <label key={String(v)} className="ap-radio">
                    <input type="radio" name="mode" checked={(draft.mode ?? null) === v} onChange={() => { setDraft({ ...draft, mode: v }); setPreviewMode(v ?? palette.mode); }} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
              <span className="muted ap-token-hint">A person's own light/dark choice always wins once they have made one.</span>
            </div>
          </div>
        </div>

        <div className="ap-preview">
          <ThemePreview theme={theme} mode={previewMode} onMode={(m) => { setPreviewMode(m); setEditMode(m); }} />
          <p className="muted ap-hint">
            Eight of the main screens with made-up data, in the draft above. Use the arrows, the dots or the keyboard. Save to apply it for real.
          </p>
        </div>
      </div>
    </main>
  );
}
