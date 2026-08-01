"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_BASE, ApiError, apiErrorMessage } from "@/lib/api";

interface Me {
  kind: string;
  name: string;
  vendor: string;
  organization?: { name: string; slug: string } | null;
}
interface VendorPosition {
  id: string;
  reference: string;
  organization: string;
  title: string;
  description: string;
  openings: number;
  seniority: string | null;
  employment_type: string;
  location_policy: string | null;
  location_text: string | null;
  min_total_years: number | null;
  rate_band: string | null;
  must_haves: string[];
  skills: { name: string; level: string; proficiency: string; min_years: number | null }[];
}
interface VendorSubmission {
  id: string;
  position_title: string;
  candidate_name: string;
  status: string;
  submitted_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  submitted: "ok",
  received: "",
  not_eligible: "bad",
  not_selected: "bad",
  withdrawn: "",
};

export default function VendorHome() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [positions, setPositions] = useState<VendorPosition[]>([]);
  const [submissions, setSubmissions] = useState<VendorSubmission[]>([]);
  const [submitFor, setSubmitFor] = useState<VendorPosition | null>(null);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([
      api<VendorPosition[]>("/vendor/positions"),
      api<VendorSubmission[]>("/vendor/submissions"),
    ]);
    setPositions(p);
    setSubmissions(s);
  }, []);

  useEffect(() => {
    api<Me>("/auth/me")
      .then((m) => {
        if (m.kind !== "vendor") throw new Error();
        setMe(m);
        return refresh();
      })
      .catch(() => router.push("/vendor/login"));
  }, [router, refresh]);

  if (!me) return <main className="wide muted">Loading…</main>;

  return (
    <main className="wide">
      <div className="row spread">
        <h1>Vendor portal</h1>
        <div className="row">
          {me.organization && (
            <span className="badge">client: {me.organization.name}</span>
          )}
          <span className="muted">
            {me.name} · {me.vendor}
          </span>
          <button
            className="secondary"
            onClick={() =>
              api("/auth/logout", { method: "POST" }).then(() => router.push("/vendor/login"))
            }
          >
            Sign out
          </button>
        </div>
      </div>

      <h2>Open positions</h2>
      {positions.length === 0 && (
        <p className="muted">No positions have been released to you yet.</p>
      )}
      {positions.map((p) => (
        <div className="card" key={p.id}>
          <div className="row spread">
            <div>
              <span className="ref-code">{p.reference}</span>{" "}
              <strong>{p.title}</strong>{" "}
              <span className="muted">
                · {p.organization} · {p.openings} opening{p.openings > 1 ? "s" : ""}
              </span>
              <p className="muted" style={{ margin: "0.15rem 0" }}>
                {[
                  p.seniority,
                  p.employment_type?.replaceAll("_", " "),
                  [p.location_policy, p.location_text].filter(Boolean).join(" · "),
                  p.min_total_years != null ? `${p.min_total_years}+ yrs` : null,
                  p.rate_band,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {p.skills.length > 0 && (
                <div style={{ margin: "0.25rem 0" }}>
                  {p.skills.map((s) => (
                    <span
                      key={s.name}
                      className={`skill-chip ${s.level === "must_have" ? "must" : ""}`}
                      title={`${s.proficiency}${s.min_years ? ` · ${s.min_years}+ yrs` : ""}`}
                    >
                      {s.name} · {s.proficiency}
                    </span>
                  ))}
                </div>
              )}
              {p.must_haves.length > 0 && (
                <p className="muted" style={{ margin: "0.15rem 0", fontSize: "0.85rem" }}>
                  Must-haves: {p.must_haves.join(" · ")}
                </p>
              )}
              {p.description && <p className="muted">{p.description}</p>}
            </div>
            <button onClick={() => setSubmitFor(submitFor?.id === p.id ? null : p)}>
              {submitFor?.id === p.id ? "Close form" : "Submit candidate"}
            </button>
          </div>
          {submitFor?.id === p.id && (
            <SubmitForm
              position={p}
              onDone={() => {
                setSubmitFor(null);
                void refresh();
              }}
              onRefresh={() => void refresh()}
            />
          )}
        </div>
      ))}

      <h2>My submissions</h2>
      {submissions.length === 0 ? (
        <p className="muted">No submissions yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Position</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>{s.candidate_name}</td>
                <td>{s.position_title}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[s.status] ?? ""}`}>
                    {s.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="muted">{new Date(s.submitted_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function SubmitForm({
  position,
  onDone,
  onRefresh,
}: {
  position: VendorPosition;
  onDone: () => void;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState({
    candidate_name: "",
    email: "",
    phone: "",
    current_title: "",
    current_employer: "",
    vendor_notes: "",
  });
  const [consent, setConsent] = useState(false);
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api<{ submission: { id: string } }>(
        `/vendor/positions/${position.id}/submissions`,
        {
          method: "POST",
          body: {
            candidate_name: form.candidate_name,
            email: form.email,
            phone: form.phone,
            current_title: form.current_title || undefined,
            current_employer: form.current_employer || undefined,
            vendor_notes: form.vendor_notes || undefined,
            candidate_consent_confirmed: consent,
          },
        },
      );
      if (resume && created.submission?.id) {
        const fd = new FormData();
        fd.append("file", resume);
        await fetch(`${API_BASE}/vendor/submissions/${created.submission.id}/resume`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      }
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
      // A duplicate rejection still records the submission, so refresh the
      // list — otherwise the "not eligible" row only appears after a reload.
      if (err instanceof ApiError && err.status === 409) onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.75rem" }}>
      <div className="row">
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Candidate name *</label>
          <input value={form.candidate_name} onChange={set("candidate_name")} required />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Email *</label>
          <input type="email" value={form.email} onChange={set("email")} required />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Phone *</label>
          <input value={form.phone} onChange={set("phone")} required />
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Current title</label>
          <input value={form.current_title} onChange={set("current_title")} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Current employer</label>
          <input value={form.current_employer} onChange={set("current_employer")} />
        </div>
      </div>
      <label>Notes</label>
      <input value={form.vendor_notes} onChange={set("vendor_notes")} />
      <label>Resume (PDF, TXT, or DOCX — max 10&nbsp;MB)</label>
      <input
        type="file"
        accept=".pdf,.txt,.docx"
        onChange={(e) => setResume(e.target.files?.[0] ?? null)}
      />
      <label className="row" style={{ marginTop: "0.75rem" }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        <span>The candidate has consented to this submission</span>
      </label>
      <div style={{ marginTop: "0.75rem" }}>
        <button disabled={busy}>{busy ? "Submitting…" : "Submit profile"}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
