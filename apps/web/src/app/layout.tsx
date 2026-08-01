import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Comparable numbers — counts, scores, hero figures.
 *
 * Loaded as the VARIABLE font including the optical-size axis, matching the
 * design's `opsz,wght@12..96,400..800`. Pinning static weights would drop
 * opsz, and Bricolage's optical sizing is what keeps a 46px headline and a
 * 20px figure looking like the same typeface.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz"],
});

/** Anything a human wrote. */
const ui = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: ["400", "500", "600", "700"],
});

/** Anything the machine produced — refs, timestamps, labels, column headers. */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "InterVU",
  description:
    "Open-source interview & vendor-sourced hiring management platform",
};

/**
 * Runs before first paint, so a dark-mode user never sees a flash of the light
 * theme. The stored choice wins; the OS preference is only the default.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("intervu-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
