import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>InterVU</h1>
      <p className="muted">
        Open-source interview &amp; vendor-sourced hiring management platform.
      </p>
      <ul>
        <li>
          <Link href="/dashboard">Organization workspace</Link>
        </li>
        <li>
          <Link href="/vendor">Vendor portal</Link>
        </li>
        <li>
          <Link href="/login">Sign in</Link>
        </li>
      </ul>
    </main>
  );
}
