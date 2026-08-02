"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { PipelineBoard as BoardView } from "./board";
import { ActionsMenu, Modal, type MenuItem } from "@/components/actions-menu";

interface Application {
  id: string;
  currentStage: string;
  status: string;
  candidate: { id: string; displayName: string };
  position: { id: string; reference?: string; title: string; orgUnit: { name: string } };
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
  const positionParam = params.get("position");

  const [apps, setApps] = useState<Application[] | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [users, setUsers] = useState<OrgUserRow[]>([]);
  const [scheduleFor, setScheduleFor] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped after any action so the board refetches alongside the page data. */
  const [reloadKey, setReloadKey] = useState(0);

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

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null);
      try {
        await fn();
        await refresh();
        setReloadKey((n) => n + 1);
      } catch (e) {
        setError(apiErrorMessage(e));
      }
    },
    [refresh],
  );

  /** One place that builds the action menu for an application. */
  const menuFor = useCallback(
    (a: Application): MenuItem[] => {
      const moves = STAGES.filter((s) => s.key !== a.currentStage).map((s) => ({
        label: `Move to ${s.label}`,
        onSelect: () =>
          act(() =>
            api(`/applications/${a.id}/transition`, {
              method: "POST",
              body: { to_stage: s.key },
            }),
          ),
      }));
      const items: MenuItem[] = [
        { label: "Move stage", heading: true },
        ...moves,
        { label: "Interview", heading: true },
        { label: "Schedule interview…", onSelect: () => setScheduleFor(a) },
      ];
      if (!a.decision) {
        items.push(
          { label: "Decision", heading: true },
          // Where a LOOP resolves. The one-click actions below stay for the
          // pre-interview case, which needs no panel to reconcile.
          {
            label: "Open debrief…",
            onSelect: () => router.push(`/applications/${a.id}/debrief`),
          },
          {
            label: "Record offer",
            tone: "primary",
            onSelect: () =>
              act(() =>
                api(`/applications/${a.id}/decision`, {
                  method: "POST",
                  body: { outcome: "offer", reason: "" },
                }),
              ),
          },
          {
            label: "Record rejection",
            tone: "danger",
            onSelect: () =>
              act(() =>
                api(`/applications/${a.id}/decision`, {
                  method: "POST",
                  body: { outcome: "reject", reason: "" },
                }),
              ),
          },
        );
      }
      items.push(
        { label: "View", heading: true },
        {
          label: "Candidate history",
          onSelect: () => router.push(`/candidates/${a.candidate.id}`),
        },
      );
      return items;
    },
    [act, router],
  );

  if (!apps) return <main className="wide muted">Loading…</main>;

  let visible = apps.filter((a) => a.status === "active");
  if (filter === "awaiting_decision") {
    visible = visible.filter(
      (a) => !a.decision && a.interviews.some((i) => i.status === "completed"),
    );
  } else if (filter === "unscreened") {
    visible = visible.filter((a) => a.currentStage === "submitted");
  }
  if (stageParam) visible = visible.filter((a) => a.currentStage === stageParam);
  if (positionParam) visible = visible.filter((a) => a.position.id === positionParam);

  const focused =
    !!stageParam || !!positionParam || filter === "unscreened" || filter === "awaiting_decision";
  const subtitle = focused
    ? `${visible.length} candidate${visible.length === 1 ? "" : "s"}`
    : `${visible.length} active across ${STAGES.length} stages`;

  return (
    <main className="wide">
      {error && <p className="error">{error}</p>}
      <BoardView
        view={filter ?? "all"}
        stage={stageParam}
        positionId={positionParam}
        reloadKey={reloadKey}
        actionsFor={(card) => {
          const app = apps.find((a) => a.id === card.id);
          return app ? menuFor(app) : [];
        }}
        onView={(key: string) =>
          router.push(key === "all" ? "/pipeline" : `/pipeline?filter=${key}`)
        }
      />
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


function ScheduleInterviewForm({
  application,
  users,
  onDone,
}: {
  application: Application;
  users: OrgUserRow[];
  onDone: () => Promise<void> | void;
}) {
  const [round, setRound] = useState("Technical Round 1");
  const [when, setWhen] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<
    { org_user: { id: string; name: string }; matched_skills: { name: string }[] }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ suggestions: typeof suggested }>(
      `/applications/${application.id}/panel-suggestions`,
    )
      .then((r) => setSuggested(r.suggestions))
      .catch(() => setSuggested([]));
  }, [application.id]);

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        {application.position.title} · {application.position.orgUnit.name}
      </p>
      <div className="row">
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>Round</label>
          <input value={round} onChange={(e) => setRound(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>When</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
      </div>
      {suggested.length > 0 && (
        <>
          <label>Suggested panelists (skill-matched — click to add)</label>
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
              <strong style={{ fontSize: "0.88rem" }}>{s.org_user.name}</strong>
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
      <label>All panelists (cmd/ctrl-click for multiple)</label>
      <select
        multiple
        size={5}
        value={panel}
        onChange={(e) => setPanel(Array.from(e.target.selectedOptions).map((o) => o.value))}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <div className="row" style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !when || panel.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/applications/${application.id}/interviews`, {
                method: "POST",
                body: {
                  round_name: round,
                  scheduled_at: new Date(when).toISOString(),
                  duration_min: 60,
                  panelist_ids: panel,
                },
              });
              await onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Scheduling…" : "Schedule"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<main className="wide muted">Loading…</main>}>
      <PipelineBoard />
    </Suspense>
  );
}
