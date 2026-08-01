"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface Application {
  id: string;
  currentStage: string;
  status: string;
  createdAt?: string;
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
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

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

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  if (!apps) return <main className="wide muted">Loading…</main>;

  // Duplicates are about submissions, not pipeline stages.
  if (filter === "duplicates") {
    const dups = subs.filter((s) => s.ownershipStatus === "duplicate");
    return (
      <main className="wide">
        <PipelineHeader active="duplicates" subtitle={`${dups.length} contested submission${dups.length === 1 ? "" : "s"}`} />
        <p className="muted section-intro">
          The same candidate arrived from more than one source. The first valid
          submission owns by default; the losing vendor only ever sees
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
                <th>Team</th>
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
                  <td>{s.position.title}</td>
                  <td className="muted">{s.position.orgUnit.name}</td>
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

  // A single stage or a filtered view is a focused LIST — a one-column board
  // would stretch each card across the whole screen. The board is only for
  // comparing stages side by side.
  const focused = !!stageParam || filter === "unscreened" || filter === "awaiting_decision";

  const subtitle = focused
    ? `${visible.length} candidate${visible.length === 1 ? "" : "s"}`
    : `${visible.length} active across ${STAGES.length} stages`;

  return (
    <main className="wide">
      <PipelineHeader
        active={filter ?? (stageParam ? `stage:${stageParam}` : "all")}
        subtitle={subtitle}
      />
      {error && <p className="error">{error}</p>}

      {focused ? (
        <FocusedTable
          rows={visible}
          users={users}
          expanded={expanded}
          setExpanded={setExpanded}
          act={act}
          refresh={refresh}
          showStage={!stageParam}
        />
      ) : (
        <div className="board">
          {STAGES.map((stage) => {
            const cards = visible.filter((a) => a.currentStage === stage.key);
            return (
              <div className="board-col" key={stage.key}>
                <div className="board-col-head">
                  <Link href={`/pipeline?stage=${stage.key}`}>{stage.label}</Link>
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
                      <StatusBadges app={a} />
                    </div>
                    <button
                      className="secondary board-action"
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                    >
                      {expanded === a.id ? "Close" : "Actions"}
                    </button>
                    {expanded === a.id && (
                      <div className="board-actions">
                        <ActionPanel a={a} users={users} act={act} refresh={refresh} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function StatusBadges({ app }: { app: Application }) {
  const done = app.interviews.filter((i) => i.status === "completed").length;
  return (
    <>
      {app.interviews.length > 0 && (
        <span className="badge">
          {done}/{app.interviews.length} interviews
        </span>
      )}
      {!app.decision && done > 0 && <span className="badge warn">decision due</span>}
      {app.decision && (
        <span className={`badge ${app.decision.outcome === "offer" ? "ok" : "bad"}`}>
          {app.decision.outcome}
        </span>
      )}
    </>
  );
}

/** Dense list for a focused view — uses the width instead of wasting it. */
function FocusedTable({
  rows,
  users,
  expanded,
  setExpanded,
  act,
  refresh,
  showStage,
}: {
  rows: Application[];
  users: OrgUserRow[];
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  showStage: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="card empty-state">
        <span className="empty-icon">✓</span>
        <div>
          <strong>Nothing here.</strong>
          <p className="muted" style={{ margin: 0 }}>
            No candidates match this view right now.
          </p>
        </div>
      </div>
    );
  }
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Candidate</th>
          <th>Position</th>
          <th>Team</th>
          {showStage && <th>Stage</th>}
          <th>Progress</th>
          <th style={{ width: 200 }}>Move to</th>
          <th style={{ width: 130 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <>
            <tr key={a.id}>
              <td>
                <Link href={`/candidates/${a.candidate.id}`}>
                  <strong>{a.candidate.displayName}</strong>
                </Link>
              </td>
              <td>{a.position.title}</td>
              <td className="muted">{a.position.orgUnit.name}</td>
              {showStage && (
                <td>
                  <span className="badge">{STAGE_LABEL[a.currentStage] ?? a.currentStage}</span>
                </td>
              )}
              <td>
                <StatusBadges app={a} />
              </td>
              <td>
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
              </td>
              <td>
                <button
                  className="secondary board-action"
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                >
                  {expanded === a.id ? "Close" : "Actions"}
                </button>
              </td>
            </tr>
            {expanded === a.id && (
              <tr key={`${a.id}-x`}>
                <td colSpan={showStage ? 7 : 6} style={{ background: "var(--page)" }}>
                  <div style={{ maxWidth: 620 }}>
                    <ActionPanel a={a} users={users} act={act} refresh={refresh} hideStage />
                  </div>
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
}

function ActionPanel({
  a,
  users,
  act,
  refresh,
  hideStage,
}: {
  a: Application;
  users: OrgUserRow[];
  act: (fn: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  hideStage?: boolean;
}) {
  return (
    <>
      {!hideStage && (
        <>
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
        </>
      )}
      <ScheduleInterview applicationId={a.id} users={users} onDone={refresh} />
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
    </>
  );
}

function PipelineHeader({ active, subtitle }: { active: string; subtitle?: string }) {
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
  const stageChip = active.startsWith("stage:")
    ? STAGE_LABEL[active.slice(6)] ?? active.slice(6)
    : null;
  return (
    <>
      <div className="row spread">
        <h1 style={{ marginBottom: "0.2rem" }}>
          Pipeline{stageChip ? ` · ${stageChip}` : ""}
        </h1>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      <div className="tabs" style={{ marginBottom: "1.4rem" }}>
        {chips.map((c) => (
          <Link key={c.key} href={c.href}>
            <button type="button" className={active === c.key ? "active" : ""}>
              {c.label}
            </button>
          </Link>
        ))}
        {stageChip && (
          <Link href="/pipeline">
            <button type="button" className="active">
              {stageChip} ✕
            </button>
          </Link>
        )}
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
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
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
        onChange={(e) => setPanel(Array.from(e.target.selectedOptions).map((o) => o.value))}
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
