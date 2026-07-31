"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

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
  skills: { level: string; skill: { name: string } }[];
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
interface Application {
  id: string;
  currentStage: string;
  status: string;
  candidate: { id: string; displayName: string };
  position: { title: string; orgUnit: { name: string } };
  interviews: { id: string; roundName: string; status: string }[];
  decision: { outcome: string } | null;
}
interface OrgUserRow {
  id: string;
  name: string;
  roles: string[];
}

const STAGES = ["submitted", "screening", "interviewing", "offer"];

export default function OrgDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [users, setUsers] = useState<OrgUserRow[]>([]);

  const refresh = useCallback(async () => {
    const [p, s, a, u] = await Promise.all([
      api<Position[]>("/positions"),
      api<Submission[]>("/submissions"),
      api<Application[]>("/applications"),
      api<OrgUserRow[]>("/org-users").catch(() => []),
    ]);
    setPositions(p);
    setSubmissions(s);
    setApplications(a);
    setUsers(u);
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
                {p.skills.length > 0 && (
                  <div style={{ marginTop: "0.2rem" }}>
                    {p.skills.map((s) => (
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
                {p.releases.filter((r) => new Date(r.visibleFrom) <= new Date()).length}
                {" / "}
                {p.releases.length} released
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Applications</h2>
      {applications.length === 0 ? (
        <p className="muted">No applications yet.</p>
      ) : (
        applications.map((a) => (
          <ApplicationCard key={a.id} app={a} users={users} onChange={refresh} />
        ))
      )}

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
                  {s.candidate ? (
                    <a href={`/candidates/${s.candidate.id}`}>
                      <strong>{s.candidate.displayName}</strong>
                    </a>
                  ) : (
                    "—"
                  )}
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

function ApplicationCard({
  app,
  users,
  onChange,
}: {
  app: Application;
  users: OrgUserRow[];
  onChange: () => void;
}) {
  const [action, setAction] = useState<"none" | "interview">("none");
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  return (
    <div className="card">
      <div className="row spread">
        <div>
          <a href={`/candidates/${app.candidate.id}`}>
            <strong>{app.candidate.displayName}</strong>
          </a>{" "}
          <span className="muted">
            · {app.position.title} · {app.position.orgUnit.name}
          </span>{" "}
          <span className={`badge ${app.status === "active" ? "ok" : app.status === "rejected" ? "bad" : ""}`}>
            {app.status}
          </span>{" "}
          <span className="badge">{app.currentStage}</span>
          {app.decision && (
            <span className={`badge ${app.decision.outcome === "offer" ? "ok" : "warn"}`}>
              decision: {app.decision.outcome}
            </span>
          )}
          {app.interviews.length > 0 && (
            <span className="muted"> · {app.interviews.length} interview(s)</span>
          )}
        </div>
        {app.status === "active" && (
          <div className="row">
            <select
              value={app.currentStage}
              onChange={(e) =>
                run(() =>
                  api(`/applications/${app.id}/transition`, {
                    method: "POST",
                    body: { to_stage: e.target.value },
                  }),
                )
              }
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              className="secondary"
              onClick={() => setAction(action === "interview" ? "none" : "interview")}
            >
              Schedule interview
            </button>
            {!app.decision && (
              <>
                <button
                  onClick={() =>
                    run(() =>
                      api(`/applications/${app.id}/decision`, {
                        method: "POST",
                        body: { outcome: "offer", reason: "" },
                      }),
                    )
                  }
                >
                  Offer
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run(() =>
                      api(`/applications/${app.id}/decision`, {
                        method: "POST",
                        body: { outcome: "reject", reason: "" },
                      }),
                    )
                  }
                >
                  Reject
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {action === "interview" && (
        <InterviewForm
          applicationId={app.id}
          users={users}
          onDone={() => {
            setAction("none");
            onChange();
          }}
        />
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

interface PanelSuggestions {
  position_skills: { name: string; level: string }[];
  suggestions: {
    org_user: { id: string; name: string };
    panels: string[];
    matched_skills: { name: string; level: string }[];
    score: number;
  }[];
}

function InterviewForm({
  applicationId,
  users,
  onDone,
}: {
  applicationId: string;
  users: OrgUserRow[];
  onDone: () => void;
}) {
  const [round, setRound] = useState("Technical Round 1");
  const [when, setWhen] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<PanelSuggestions | null>(null);

  useEffect(() => {
    api<PanelSuggestions>(`/applications/${applicationId}/panel-suggestions`)
      .then(setSuggested)
      .catch(() => setSuggested(null));
  }, [applicationId]);

  const toggle = (id: string) =>
    setPanel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${applicationId}/interviews`, {
        method: "POST",
        body: {
          round_name: round,
          scheduled_at: new Date(when).toISOString(),
          duration_min: 60,
          panelist_ids: panel,
        },
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.75rem" }}>
      {suggested && suggested.position_skills.length > 0 && (
        <div style={{ margin: "0.4rem 0 0.6rem" }}>
          <span className="muted" style={{ fontSize: "0.8rem", marginRight: "0.5rem" }}>
            Position skills:
          </span>
          {suggested.position_skills.map((s) => (
            <span key={s.name} className={`skill-chip ${s.level === "must_have" ? "must" : ""}`}>
              {s.name}
            </span>
          ))}
        </div>
      )}
      {suggested && suggested.suggestions.length > 0 && (
        <div style={{ marginBottom: "0.6rem" }}>
          <label style={{ marginTop: 0 }}>
            Suggested panelists (skill-matched — click to add)
          </label>
          {suggested.suggestions.map((s) => (
            <div
              key={s.org_user.id}
              className={`suggestion-row ${panel.includes(s.org_user.id) ? "selected" : ""}`}
              onClick={() => toggle(s.org_user.id)}
            >
              <strong>{s.org_user.name}</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                {s.panels.join(" · ")}
              </span>
              <span style={{ marginLeft: "auto" }}>
                {s.matched_skills.map((sk) => (
                  <span
                    key={sk.name}
                    className={`skill-chip ${sk.level === "must_have" ? "must" : ""}`}
                  >
                    {sk.name}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>Round</label>
          <input value={round} onChange={(e) => setRound(e.target.value)} required />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>When</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>All panelists (cmd/ctrl-click for multiple)</label>
          <select
            multiple
            value={panel}
            onChange={(e) =>
              setPanel(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.roles.join(", ") || "member"})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <button disabled={busy || panel.length === 0}>
          {busy ? "Scheduling…" : "Schedule"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
