"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Detail {
  id: string;
  title: string;
  description: string;
  status: string;
  openings: number;
  seniority: string | null;
  employmentType: string;
  locationPolicy: string | null;
  locationText: string | null;
  minTotalYears: number | null;
  rateMin: number | null;
  rateMax: number | null;
  rateCurrency: string;
  ratePeriod: string | null;
  mustHaves: string[];
  orgUnit: { name: string };
  skills: { level: string; proficiency: string; minYears: number | null; skill: { name: string } }[];
  releasePolicy: { mode: string } | null;
  releases: { visibleFrom: string; vendorOrg: { tier: number; vendor: { name: string } } }[];
}

const nice = (s: string | null | undefined) => (s ? s.replaceAll("_", " ") : null);

export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Detail | null>(null);

  useEffect(() => {
    api<Detail>(`/positions/${id}`).then(setP).catch(() => router.push("/login"));
  }, [id, router]);

  if (!p) return <main className="wide muted">Loading…</main>;

  const meta = [
    p.orgUnit.name,
    nice(p.seniority),
    nice(p.employmentType),
    [nice(p.locationPolicy), p.locationText].filter(Boolean).join(" · "),
    p.minTotalYears != null ? `${p.minTotalYears}+ yrs` : null,
    p.rateMin != null && p.rateMax != null
      ? `${p.rateCurrency} ${p.rateMin}–${p.rateMax}${p.ratePeriod ? ` / ${nice(p.ratePeriod)}` : ""}`
      : null,
    `${p.openings} opening${p.openings > 1 ? "s" : ""}`,
  ].filter(Boolean);

  const musts = p.skills.filter((s) => s.level === "must_have");
  const goods = p.skills.filter((s) => s.level === "good_to_have");

  return (
    <main className="wide">
      <p><a href="/dashboard">← Dashboard</a></p>
      <div className="row spread">
        <h1 style={{ marginBottom: 0 }}>{p.title}</h1>
        <span className={`badge ${p.status === "open" ? "ok" : ""}`}>{p.status}</span>
      </div>
      <p className="muted" style={{ marginTop: "0.4rem" }}>
        {meta.map((m, i) => (
          <span key={i}>
            {i > 0 && " · "}
            {m}
          </span>
        ))}
      </p>

      {p.description && (
        <div className="card">
          <p className="chart-title">About the role</p>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{p.description}</p>
        </div>
      )}

      <div className="viz-grid">
        <div className="card">
          <p className="chart-title">Requirements</p>
          <table className="data">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Importance</th>
                <th>Proficiency</th>
                <th className="num">Min yrs</th>
              </tr>
            </thead>
            <tbody>
              {[...musts, ...goods].map((s) => (
                <tr key={s.skill.name}>
                  <td><strong>{s.skill.name}</strong></td>
                  <td>
                    <span className={`badge ${s.level === "must_have" ? "warn" : ""}`}>
                      {nice(s.level)}
                    </span>
                  </td>
                  <td>{s.proficiency}</td>
                  <td className="num">{s.minYears ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.mustHaves.length > 0 && (
            <>
              <p className="chart-title" style={{ marginTop: "1rem" }}>Other must-haves</p>
              <ul style={{ margin: 0 }}>
                {p.mustHaves.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card">
          <p className="chart-title">Vendor release</p>
          <p className="chart-sub">
            Policy: {nice(p.releasePolicy?.mode) ?? "not published"}
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Tier</th>
                <th>Visible from</th>
              </tr>
            </thead>
            <tbody>
              {p.releases.map((r, i) => (
                <tr key={i}>
                  <td>{r.vendorOrg.vendor.name}</td>
                  <td>{r.vendorOrg.tier}</td>
                  <td className="muted">{new Date(r.visibleFrom).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
