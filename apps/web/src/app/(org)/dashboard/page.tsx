"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Me {
  kind: string;
  name: string;
  email: string;
  memberships: { role: string; org_unit_id: string | null }[];
}
interface Position {
  id: string;
  title: string;
  status: string;
  openings: number;
  orgUnit: { name: string };
  releasePolicy?: { mode: string } | null;
  releases: { visibleFrom: string; vendorOrg: { vendor: { name: string } } }[];
}
interface Submission {
  id: string;
  status: string;
  ownershipStatus: string;
  receivedAt: string;
  position: { title: string; orgUnit: { name: string } };
  vendorOrg: { vendor: { name: string } };
  candidate: { id: string; displayName: string } | null;
  matchDecision: { outcome: string } | null;
}

export default function OrgDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([
      api<Position[]>("/positions"),
      api<Submission[]>("/submissions"),
    ]);
    setPositions(p);
    setSubmissions(s);
  }, []);

  useEffect(() => {
    api<Me>("/auth/me")
      .then((m) => {
        if (m.kind !== "org") throw new Error();
        setMe(m);
        return refresh();
      })
      .catch(() => router.push("/login"));
  }, [router, refresh]);

  if (!me) return <main className="wide muted">Loading…</main>;

  const duplicates = submissions.filter((s) => s.ownershipStatus === "duplicate");

  return (
    <main className="wide">
      <div className="row spread">
        <h1>Organization workspace</h1>
        <div className="row">
          <span className="muted">
            {me.name} · {me.memberships.map((m) => m.role).join(", ")}
          </span>
          <button
            className="secondary"
            onClick={() =>
              api("/auth/logout", { method: "POST" }).then(() => router.push("/login"))
            }
          >
            Sign out
          </button>
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="card">
          <strong>⚠ {duplicates.length} duplicate submission contest{duplicates.length > 1 ? "s" : ""}</strong>
          <p className="muted">
            The same candidate arrived from more than one source. First valid
            submission owns by default; arbitration is available on each row.
          </p>
        </div>
      )}

      <h2>Positions</h2>
      <table className="data">
        <thead>
          <tr>
            <th>Title</th>
            <th>Team</th>
            <th>Status</th>
            <th>Release</th>
            <th>Vendors</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.title}</strong>
              </td>
              <td>{p.orgUnit.name}</td>
              <td>
                <span className={`badge ${p.status === "open" ? "ok" : ""}`}>{p.status}</span>
              </td>
              <td className="muted">{p.releasePolicy?.mode.replaceAll("_", " ") ?? "—"}</td>
              <td className="muted">
                {p.releases.filter((r) => new Date(r.visibleFrom) <= new Date()).length}
                {" / "}
                {p.releases.length} released
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Submissions</h2>
      {submissions.length === 0 ? (
        <p className="muted">No submissions yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Position</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Ownership</th>
              <th>Match</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.candidate?.displayName ?? "—"}</strong>
                </td>
                <td>
                  {s.position.title}{" "}
                  <span className="muted">· {s.position.orgUnit.name}</span>
                </td>
                <td>{s.vendorOrg.vendor.name}</td>
                <td>
                  <span className={`badge ${s.status === "accepted" ? "ok" : s.status === "duplicate" ? "bad" : ""}`}>
                    {s.status}
                  </span>
                </td>
                <td>
                  <span className={`badge ${s.ownershipStatus === "owner" ? "ok" : s.ownershipStatus === "duplicate" ? "warn" : ""}`}>
                    {s.ownershipStatus.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="muted">{s.matchDecision?.outcome.replaceAll("_", " ") ?? "—"}</td>
                <td className="muted">{new Date(s.receivedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
