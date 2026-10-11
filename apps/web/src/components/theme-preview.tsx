"use client";

import type { CSSProperties } from "react";
import { themeStyle, type ResolvedTheme } from "@/lib/theme";
import { PREVIEW_KEYS } from "@/components/mock-screens";
import { ScreenStrip } from "@/components/screen-strip";

/**
 * The main screens rendered with a theme that may not be saved yet
 * (docs/01 §4, White-labeling).
 *
 * An admin choosing a palette should not have to open eight pages to see
 * what it does to a debrief or the vendor portal. The frame sets the draft
 * theme's tokens as inline custom properties, so what the strip shows is
 * what the product will do. The screens themselves live in mock-screens.
 */
export function ThemePreview({ theme, mode, onMode }: { theme: ResolvedTheme; mode: "light" | "dark"; onMode: (m: "light" | "dark") => void }) {
  const tokens = mode === "dark" ? theme.dark : theme.light;
  const style = themeStyle(tokens, theme.font) as CSSProperties;
  return (
    <ScreenStrip
      keys={PREVIEW_KEYS}
      label={theme.label}
      style={style}
      mode={mode}
      ariaLabel="Preview of the main screens in this theme"
      controls={
        <span className="tp-seg" role="group" aria-label="Preview mode">
          <button type="button" className={mode === "light" ? "on" : ""} onClick={() => onMode("light")}>Light</button>
          <button type="button" className={mode === "dark" ? "on" : ""} onClick={() => onMode("dark")}>Dark</button>
        </span>
      }
    />
  );
}
