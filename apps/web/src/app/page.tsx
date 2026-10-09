import Link from "next/link";

/**
 * The front door.
 *
 * It was a heading and a bulleted list of links — on the public demo, the
 * very first thing anyone saw. Now it says what the product is in one line
 * and offers each audience its own door. The demo card appears only when
 * NEXT_PUBLIC_DEMO_MODE is on: a real install must never advertise a page of
 * working credentials.
 *
 * How it works is not demo-gated: a self-hosted team needs the walkthrough
 * more than a visitor does — it is the page you send someone on day one.
 */
export default function Home() {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const doors = [
    ...(demo
      ? [
          {
            href: "/demo",
            kicker: "Start here",
            title: "Try the live demo",
            body: "Pick a person to be, from recruiter to agency, and sign in with one click. Everything is made up and rebuilt every night.",
            tone: "primary",
          },
        ]
      : []),
    {
      href: "/login",
      kicker: "Internal",
      title: "Organization workspace",
      body: "For recruiters, hiring managers and interviewers: positions, candidates, interviews and decisions.",
      tone: "",
    },
    {
      href: "/vendor/login",
      kicker: "External",
      title: "Vendor portal",
      body: "For staffing agencies: the roles released to you, your submissions and how they went.",
      tone: "vendor",
    },
    {
      href: "/how-it-works",
      kicker: "About 5 minutes",
      title: "How it works",
      body: "The whole path from an open role to a signed offer, step by step, and who may do what.",
      tone: "",
    },
  ];

  return (
    <main className="wide home">
      <header className="home-top">
        <span className="brand home-brand">
          Inter<span className="brand-accent">/</span>VU
        </span>
        <a href="https://github.com/sajucrajan/interVU" className="home-src">
          Source on GitHub
        </a>
      </header>

      <section className="home-hero">
        <div className="mono-label">Open-source hiring platform</div>
        <h1>
          Hire through agencies <span className="home-accent">without the arguments.</span>
        </h1>
        <p className="home-lede">
          InterVU releases your roles to staffing agencies on your schedule,
          catches the same candidate sent twice, records who introduced them
          first, and runs the interviews through to an offer. Agencies see only
          their own candidates and a plain status for each.
        </p>
      </section>

      <nav className={`home-doors${demo ? " with-demo" : ""}`} aria-label="Where to go">
        {doors.map((d) => (
          <Link key={d.href} href={d.href} className={`home-door ${d.tone}`}>
            <span className="mono-label">{d.kicker}</span>
            <strong>{d.title}</strong>
            <span className="home-door-body">{d.body}</span>
            <span className="home-door-go" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
