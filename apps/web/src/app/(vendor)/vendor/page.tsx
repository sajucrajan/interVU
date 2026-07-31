"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, apiErrorMessage } from "@/lib/api";

interface Me {
  kind: string;
  name: string;
  vendor: string;
}
interface VendorPosition {
  id: string;
  organization: string;
  title: string;
  description: string;
  openings: number;
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
      .catch(() => router.push("/login"));
  }, [router, refresh]);

  if (!me) return <main className="wide muted">Loading…</main>;

  return (
    <main className="wide">
      <div className="row spread">
        <h1>Vendor portal</h1>
        <div className="row">
          <span className="muted">
            {me.name} · {me.vendor}
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

      <h2>Open positions</h2>
      {positions.length === 0 && (
        <p className="muted">No positions have been released to you yet.</p>
      )}
      {positions.map((p) => (
        <div className="card" key={p.id}>
          <div className="row spread">
            <div>
              <strong>{p.title}</strong>{" "}
              <span className="muted">
                · {p.organization} · {p.openings} opening{p.openings > 1 ? "s" : ""}
              </span>
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
}: {
  position: VendorPosition;
  onDone: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/vendor/positions/${position.id}/submissions`, {
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
      });
      onDone();
    } catch (err) {
      // The duplicate probe answers here: "not eligible, already in process
      // from another source" — with no source revealed (docs/05 §3).
      setError(
        err instanceof ApiError && err.status === 409
          ? apiErrorMessage(err)
          : apiErrorMessage(err),
      );
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
