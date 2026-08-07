import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>InterVU</h1>
      <p className="muted">
        Open-source interview &amp; vendor-sourced hiring management platform.
      </p>
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <p>
          <Link href="/demo">
            <strong>Start here</strong>
          </Link>{" "}
          — what this is, who you can sign in as, and what to look at.
        </p>
      )}
      <ul>
        <li>
          <Link href="/login">Organization workspace</Link> — internal sign-in
        </li>
        <li>
          <Link href="/vendor/login">Vendor portal</Link> — agency sign-in
        </li>
      </ul>
    </main>
  );
}
