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
          <Link href="/dashboard">Organization workspace</Link> (M1)
        </li>
        <li>
          <Link href="/vendor">Vendor portal</Link> (M1)
        </li>
      </ul>
    </main>
  );
}
