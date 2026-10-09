import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The frame around a sign-in form.
 *
 * Both entry points used to be an unbranded form at the top of an empty
 * page — the first screen most people see, and the only one that did not
 * look like the product. The side panel says which door this is and what is
 * behind it, so an agency recruiter who followed a link knows they are in the
 * right place before they type anything.
 *
 * The two doors stay separate (docs/05 §1). The vendor variant never mentions
 * the organization workspace: /vendor/* may be the only part of a deployment
 * that is published to the internet.
 */
export function AuthShell({
  variant,
  kicker,
  statement,
  points,
  children,
}: {
  variant: "org" | "vendor";
  kicker: string;
  statement: string;
  points: string[];
  children: ReactNode;
}) {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return (
    <div className={`auth-shell ${variant}`}>
      <aside className="auth-side">
        <Link href="/" className="brand auth-brand">
          Inter<span className="brand-accent">/</span>VU
        </Link>
        <div className="auth-side-body">
          <div className="mono-label auth-kicker">{kicker}</div>
          <p className="auth-statement">{statement}</p>
          <ul className="auth-points">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="mono-label auth-foot">Open source · self-hostable</div>
      </aside>
      <main className="auth-main">
        <div className="auth-form">
          {children}
          {demo && (
            <Link href="/demo" className="auth-demo">
              <span className="mono-label">Exploring the demo?</span>
              <span>
                Pick an account on the demo guide and sign in with one click,
                no password to type →
              </span>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
