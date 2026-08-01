"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const KEY = "intervu-theme";

/**
 * Light/dark switch. The inline script in the root layout has already set
 * `data-theme` before paint; this only reads it back so the button label
 * matches, then writes both the attribute and localStorage on click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "light");
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice just won't survive a reload.
    }
    setTheme(next);
  };

  // Render nothing until mounted, so the server and client agree.
  if (!theme) return <span className="theme-toggle" aria-hidden />;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={flip}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
