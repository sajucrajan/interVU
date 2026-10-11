import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { renderMarkdown } from "@/lib/markdown";

/**
 * The guide, inside the product.
 *
 * /how-it-works is the five-minute story for someone deciding whether to
 * look further. This is the manual for someone who is going to use or test
 * it: every role and persona, the order to set an organization up in, one
 * full hire person by person, what has no screen yet, and a set of test
 * charters. It is docs/14 in the repository, rendered at build time, so the
 * page and the document cannot drift apart.
 *
 * Not demo-gated: a self-hosted team needs this more than the demo does.
 */

export const metadata: Metadata = {
  title: "Guide · InterVU",
  description: "Roles, personas, setting an organization up, and a full hire step by step.",
};

export const dynamic = "force-static";

function source(): string {
  // Dev runs from apps/web; the container build copies docs/ to /app/docs.
  for (const p of [
    join(process.cwd(), "..", "..", "docs", "14-tester-guide.md"),
    join(process.cwd(), "docs", "14-tester-guide.md"),
  ]) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      // try the next
    }
  }
  return "";
}

export default function GuidePage() {
  const md = source();
  // The environment sections (1 and 2) are about running the stack, which
  // whoever reads this page has already done; start at "Who is who".
  const start = md.indexOf("\n## 3.");
  const body = start >= 0 ? md.slice(start) : md;
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[`*_]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  return (
    <main className="wide guide">
      <header className="guide-top">
        <Link href="/" className="brand">
          Inter<span className="brand-accent">/</span>VU
        </Link>
        <nav className="guide-links">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/vendor/login">Vendor portal</Link>
        </nav>
      </header>

      <div className="mono-label">The manual</div>
      <h1>Who does what, and how a hire runs</h1>
      <p className="guide-lede">
        For anyone using or testing InterVU: every role and persona, the order
        to set an organization up in, one complete hire person by person, what
        has no screen yet, and a set of test charters. The same text lives in
        the repository as{" "}
        <a href="https://github.com/sajucrajan/interVU/blob/main/docs/14-tester-guide.md">
          docs/14
        </a>
        , whose first two sections cover running the stack and creating an
        organization.
      </p>

      <div className="guide-grid">
        <nav className="guide-toc" aria-label="Sections">
          <div className="mono-label">Sections</div>
          <ol>
            {headings.map((h) => (
              <li key={h}>
                <a href={`#${slug(h)}`}>{h.replace(/^\d+\.\s*/, "")}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="guide-body">{body ? renderMarkdown(body) : <p className="muted">The guide is not bundled in this build.</p>}</article>
      </div>

      <p className="dg-foot">
        <Link href="/how-it-works">How it works</Link>
        <a href="https://github.com/sajucrajan/interVU">Source on GitHub</a>
        <Link href="/login">Sign in</Link>
        <Link href="/vendor/login">Vendor portal</Link>
      </p>
    </main>
  );
}
