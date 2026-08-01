"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface Application {
  id: string;
  currentStage: string;
  status: string;
  candidate: { id: string; displayName: string };
  position: { id: string; title: string; orgUnit: { name: string } };
  interviews: { id: string; roundName: string; status: string }[];
  decision: { outcome: string } | null;
}
interface Submission {
  id: string;
  status: string;
  ownershipStatus: string;
  receivedAt: string;
  position: { title: string; orgUnit: { name: string } };
  vendorOrg: { vendor: { name: string } };
  candidate: { id: string; displayName: string } | null;
}
interface OrgUserRow {
  id: string;
  name: string;
  roles: string[];
}

const STAGES = [
  { key: "submitted", label: "New" },
  { key: "screening", label: "Screening" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
];

function PipelineBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const filter = params.get("filter");
  const stageParam = params.get("stage");

  const [apps, setApps] = useState<Application[] | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [users, setUsers] = useState<OrgUserRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, s, u] = await Promise.all([
      api<Application[]>("/applications"),
      api<Submission[]>("/submissions").catch(() => []),
      api<OrgUserRow[]>("/org-users").catch(() => []),
    ]);
    setApps(a);
    setSubs(s);
    setUsers(u);
  }, []);

  useEffect(() => {
    refresh().catch(() => router.push("/login"));
  }, [refresh, router]);

  if (!apps) return <main className="wide muted">Loading…</main>;

  // The duplicate view is about submissions, not pipeline stages.
  if (filter === "duplicates") {
    const dups = subs.filter((s) => s.ownershipStatus === "duplicate");
    return (
      <main className="wide">
        <PipelineHeader active="duplicates" />
        <h2>Duplicate submission contests ({dups.length})</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          The same candidate arrived from more than one source. The first valid
          submission owns by default; the losing vendor sees only
          &ldquo;not eligible&rdquo;.
        </p>
        {dups.length === 0 ? (
          <p className="muted">No contested submissions.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Position</th>
                <th>Blocked vendor</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {dups.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.candidate ? (
                      <Link href={`/candidates/${s.candidate.id}`}>
                        <strong>{s.candidate.displayName}</strong>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {s.position.title}{" "}
                    <span className="muted">· {s.position.orgUnit.name}</span>
                  </td>
                  <td>{s.vendorOrg.vendor.name}</td>
                  <td className="muted">{new Date(s.receivedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    );
  }

  let visible = apps.filter((a) => a.status === "active");
  if (filter === "awaiting_decision") {
    visible = visible.filter(
      (a) => !a.decision && a.interviews.some((i) => i.status === "completed"),
    );
  } else if (filter === "unscreened") {
    visible = visible.filter((a) => a.currentStage === "submitted");
  }
  if (stageParam) visible = visible.filter((a) => a.currentStage === stageParam);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  return (
    <main className="wide">
      <PipelineHeader active={filter ?? stageParam ?? "all"} />
      {error && <p className="error">{error}</p>}
      <div className="board">
        {STAGES.filter((s) => !stageParam || s.key === stageParam).map((stage) => {
          const cards = visible.filter((a) => a.currentStage === stage.key);
          return (
            <div className="board-col" key={stage.key}>
              <div className="board-col-head">
                <span>{stage.label}</span>
                <span className="board-col-count">{cards.length}</span>
              </div>
              {cards.length === 0 && <p className="board-empty">—</p>}
              {cards.map((a) => (
                <div className="board-card" key={a.id}>
                  <Link href={`/candidates/${a.candidate.id}`}>
                    <strong>{a.candidate.displayName}</strong>
                  </Link>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {a.position.title} · {a.position.orgUnit.name}
                  </div>
                  <div style={{ margin: "0.35rem 0" }}>
                    {a.interviews.length > 0 && (
                      <span className="badge">
                        {a.interviews.filter((i) => i.status === "completed").length}/
                        {a.interviews.length} interviews
                      </span>
                    )}
                    {!a.decision &&
                      a.interviews.some((i) => i.status === "completed") && (
                        <span className="badge warn">decision due</span>
                      )}
                    {a.decision && (
                      <span
                        className={`badge ${a.decision.outcome === "offer" ? "ok" : "bad"}`}
                      >
                        {a.decision.outcome}
                      </span>
                    )}
                  </div>
                  <button
                    className="secondary board-action"
                    onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  >
                    {expanded === a.id ? "Close" : "Actions"}
                  </button>
                  {expanded === a.id && (
                    <div className="board-actions">
                      <label>Move to stage</label>
                      <select
                        value={a.currentStage}
                        onChange={(e) =>
                          act(() =>
                            api(`/applications/${a.id}/transition`, {
                              method: "POST",
                              body: { to_stage: e.target.value },
                            }),
                          )
                        }
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <ScheduleInterview
                        applicationId={a.id}
                        users={users}
                        onDone={refresh}
                      />
                      {!a.decision && (
                        <div className="row" style={{ marginTop: "0.5rem" }}>
                          <button
                            onClick={() =>
                              act(() =>
                                api(`/applications/${a.id}/decision`, {
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
                              act(() =>
                                api(`/applications/${a.id}/decision`, {
                                  method: "POST",
                                  body: { outcome: "reject", reason: "" },
                                }),
                              )
                            }
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function PipelineHeader({ active }: { active: string }) {
  const chips = [
    { key: "all", label: "All active", href: "/pipeline" },
    { key: "unscreened", label: "New to screen", href: "/pipeline?filter=unscreened" },
    {
      key: "awaiting_decision",
      label: "Awaiting decision",
      href: "/pipeline?filter=awaiting_decision",
    },
    { key: "duplicates", label: "Duplicates", href: "/pipeline?filter=duplicates" },
  ];
  return (
    <>
      <h1>Pipeline</h1>
      <div className="tabs" style={{ marginBottom: "1.2rem" }}>
        {chips.map((c) => (
          <Link key={c.key} href={c.href}>
            <button type="button" className={active === c.key ? "active" : ""}>
              {c.label}
            </button>
          </Link>
        ))}
      </div>
    </>
  );
}

function ScheduleInterview({
  applicationId,
  users,
  onDone,
}: {
  applicationId: string;
  users: OrgUserRow[];
  onDone: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState("Technical Round 1");
  const [when, setWhen] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<
    { org_user: { id: string; name: string }; matched_skills: { name: string }[] }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ suggestions: typeof suggested }>(
      `/applications/${applicationId}/panel-suggestions`,
    )
      .then((r) => setSuggested(r.suggestions))
      .catch(() => setSuggested([]));
  }, [open, applicationId]);

  if (!open) {
    return (
      <button
        className="secondary"
        style={{ marginTop: "0.5rem" }}
        onClick={() => setOpen(true)}
      >
        Schedule interview
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <label>Round</label>
      <input value={round} onChange={(e) => setRound(e.target.value)} />
      <label>When</label>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      {suggested.length > 0 && (
        <>
          <label>Suggested panelists (skill-matched)</label>
          {suggested.map((s) => (
            <div
              key={s.org_user.id}
              className={`suggestion-row ${panel.includes(s.org_user.id) ? "selected" : ""}`}
              onClick={() =>
                setPanel((p) =>
                  p.includes(s.org_user.id)
                    ? p.filter((x) => x !== s.org_user.id)
                    : [...p, s.org_user.id],
                )
              }
            >
              <strong style={{ fontSize: "0.85rem" }}>{s.org_user.name}</strong>
              <span style={{ marginLeft: "auto" }}>
                {s.matched_skills.slice(0, 3).map((k) => (
                  <span key={k.name} className="skill-chip">
                    {k.name}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </>
      )}
      <label>All panelists</label>
      <select
        multiple
        value={panel}
        onChange={(e) =>
          setPanel(Array.from(e.target.selectedOptions).map((o) => o.value))
        }
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <div className="row" style={{ marginTop: "0.5rem" }}>
        <button
          disabled={!when || panel.length === 0}
          onClick={async () => {
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
              setOpen(false);
              await onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
            }
          }}
        >
          Schedule
        </button>
        <button className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<main className="wide muted">Loading…</main>}>
      <PipelineBoard />
    </Suspense>
  );
}
