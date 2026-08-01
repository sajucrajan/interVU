"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Position {
  id: string;
  reference: string;
  title: string;
  status: string;
  openings: number;
  seniority: string | null;
  employmentType: string;
  orgUnit: { name: string };
  skills: { level: string; skill: { name: string } }[];
  releasePolicy?: { mode: string } | null;
  releases: { visibleFrom: string }[];
}

export default function PositionsPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<Position[]>("/positions")
      .then(setPositions)
      .catch(() => router.push("/login"));
  }, [router]);

  if (!positions) return <main className="wide muted">Loading…</main>;

  const filtered = positions.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q.toLowerCase()) ||
      p.orgUnit.name.toLowerCase().includes(q.toLowerCase()),
  );
  const open = filtered.filter((p) => p.status === "open");
  const other = filtered.filter((p) => p.status !== "open");

  return (
    <main className="wide">
      <div className="row spread">
        <h1>Positions</h1>
        <Link href="/positions/new">
          <button>+ New position</button>
        </Link>
      </div>
      <input
        placeholder="Filter by title or team…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 340, marginBottom: "1rem" }}
      />

      <PositionTable title={`Open (${open.length})`} rows={open} />
      {other.length > 0 && (
        <PositionTable title={`Draft & closed (${other.length})`} rows={other} />
      )}
    </main>
  );
}

function PositionTable({ title, rows }: { title: string; rows: Position[] }) {
  if (rows.length === 0) return null;
  const now = new Date();
  return (
    <section>
      <h2>{title}</h2>
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 110 }}>Ref</th>
            <th>Role</th>
            <th>Team</th>
            <th>Status</th>
            <th>Release</th>
            <th>Vendors</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="ref-code">{p.reference}</span>
              </td>
              <td>
                <Link href={`/positions/${p.id}`}>
                  <strong>{p.title}</strong>
                </Link>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {[p.seniority, p.employmentType?.replaceAll("_", " ")]
                    .filter(Boolean)
                    .join(" · ")}
                  {p.openings > 1 ? ` · ${p.openings} openings` : ""}
                </div>
                {p.skills.length > 0 && (
                  <div style={{ marginTop: "0.2rem" }}>
                    {p.skills.slice(0, 4).map((s) => (
                      <span
                        key={s.skill.name}
                        className={`skill-chip ${s.level === "must_have" ? "must" : ""}`}
                      >
                        {s.skill.name}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td>{p.orgUnit.name}</td>
              <td>
                <span className={`badge ${p.status === "open" ? "ok" : ""}`}>{p.status}</span>
              </td>
              <td className="muted">{p.releasePolicy?.mode.replaceAll("_", " ") ?? "—"}</td>
              <td className="muted">
                {p.releases.filter((r) => new Date(r.visibleFrom) <= now).length} / {p.releases.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
