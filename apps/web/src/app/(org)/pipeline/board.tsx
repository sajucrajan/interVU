"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, apiErrorMessage } from "@/lib/api";
import { formatAge } from "@/components/age-pill";
import { ActionsMenu, type MenuItem } from "@/components/actions-menu";

export interface BoardCard {
  id: string;
  stage: string;
  candidate: { id: string; displayName: string };
  position_reference: string | null;
  position_title: string;
  source: string;
  source_channel: string;
  position_id: string;
  age_hours: number;
  age_state: "ok" | "aging" | "breached";
  interviews_label: string;
  vendor: string;
  flags: { label: string; tone: "bad" | "warn" | "ok" }[];
  hatched: boolean;
}

interface BoardColumn {
  stage: string;
  count: number;
  cap: number | null;
  wip: "none" | "ok" | "over";
  cards: BoardCard[];
}

interface DuplicateRow {
  id: string;
  candidate: { id: string; displayName: string } | null;
  position_id: string;
  position_reference: string | null;
  position_title: string;
  blocked_vendor: string;
  received_at: string;
  winning_vendor: string | null;
  window_expires_at: string | null;
}

interface BoardData {
  total: number;
  columns: BoardColumn[];
  duplicates: DuplicateRow[];
  views: { key: string; label: string; count: number; tone?: string }[];
}

const STAGE_LABEL: Record<string, string> = {
  submitted: "New",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
};

const AGE_COLOR: Record<string, string> = {
  ok: "var(--ok)",
  aging: "var(--warn)",
  breached: "var(--bad)",
};

const FLAG_COLOR: Record<string, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  ok: "var(--ok)",
};

const FLAG_WASH: Record<string, string> = {
  bad: "var(--bad-wash)",
  warn: "var(--warn-wash)",
  ok: "var(--ok-wash)",
};

const BULK_STAGES = ["submitted", "screening", "interviewing", "offer"];

/** Board view of the pipeline (design option 1e). */
export function PipelineBoard({
  view,
  onView,
  stage,
  positionId,
  actionsFor,
  reloadKey,
}: {
  view: string;
  onView: (key: string) => void;
  /** Drill-downs from the dashboard and the position page narrow the board
   *  rather than opening a different screen. */
  stage?: string | null;
  positionId?: string | null;
  /** The page owns the action set (transition, schedule, decide) and the
   *  modals behind it; the board only decides where the trigger sits. */
  actionsFor?: (card: BoardCard) => MenuItem[];
  /** Lets the page refresh the board after one of those actions. */
  reloadKey?: number;
}) {
  const [data, setData] = useState<BoardData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<BoardData>("/pipeline/board")
      .then(setData)
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(load, [load, reloadKey]);

  if (!data) return <p className="muted">Loading…</p>;

  const matches = (c: BoardCard) => {
    if (positionId && c.position_id !== positionId) return false;
    if (stage && c.stage !== stage) return false;
    if (view === "unscreened") return c.stage === "submitted";
    if (view === "sla_breached") return c.age_state === "breached";
    if (view === "awaiting_decision")
      return c.flags.some((f) => f.label === "Decision due");
    return true;
  };

  const visibleColumns = stage
    ? data.columns.filter((c) => c.stage === stage)
    : data.columns;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const move = async (stage: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ moved: number; failed: number }>("/pipeline/bulk/transition", {
        method: "POST",
        body: { ids: [...selected], to_stage: stage },
      });
      if (r.failed > 0) setError(`${r.moved} moved, ${r.failed} could not be moved.`);
      setSelected(new Set());
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="mono-label">Work / pipeline</div>
          <h1 style={{ marginTop: 12 }}>{data.total} candidates in flight</h1>
        </div>
        <div className="view-chips">
          {data.views.map((v) => {
            const active = view === v.key;
            const bad = v.tone === "bad" && v.count > 0;
            return (
              <button
                key={v.key}
                type="button"
                className={`view-chip${active ? " active" : ""}${bad ? " bad" : ""}`}
                onClick={() => onView(v.key)}
              >
                {v.label} <span className="view-count">{v.count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {/* Selecting anything reveals the actions that only make sense in bulk. */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <span className="bulk-sep" />
          {BULK_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className="bulk-action"
              disabled={busy}
              onClick={() => move(s)}
            >
              Move to {STAGE_LABEL[s]}
            </button>
          ))}
          <button
            type="button"
            className="bulk-action bulk-clear"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Contested submissions are blocked at intake, so they are never board
          cards — the duplicates view is a different population entirely. */}
      {view === "duplicates" ? (
        data.duplicates.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">✓</span>
            <div>
              <strong>No contested submissions.</strong>
              <p className="muted" style={{ margin: 0 }}>
                When two vendors submit the same candidate for the same role, the
                second is blocked and appears here with the arbitration.
              </p>
            </div>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Candidate</th>
                <th>Position</th>
                <th>Blocked vendor</th>
                <th>Owned by</th>
                <th className="num">Window expires</th>
              </tr>
            </thead>
            <tbody>
              {data.duplicates.map((d) => (
                <tr key={d.id}>
                  {/* Its own column, and a link: titles repeat across teams, so
                      the reference is the only way to tell two contests apart
                      at a glance — and the only safe way to click through. */}
                  <td>
                    <Link href={`/positions/${d.position_id}`} className="ref-link">
                      {d.position_reference ?? "—"}
                    </Link>
                  </td>
                  <td>
                    {d.candidate ? (
                      <Link href={`/candidates/${d.candidate.id}`}>
                        {d.candidate.displayName}
                      </Link>
                    ) : (
                      <span className="muted">pending review</span>
                    )}
                  </td>
                  <td>{d.position_title}</td>
                  <td>
                    <span className="badge warn">{d.blocked_vendor}</span>
                  </td>
                  <td>
                    {d.winning_vendor ? (
                      <span className="badge ok">{d.winning_vendor}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num muted">
                    {d.window_expires_at
                      ? new Date(d.window_expires_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : visibleColumns.every((col) => col.cards.filter(matches).length === 0) ? (
        <div className="empty-state">
          <span className="empty-icon">✓</span>
          <div>
            <strong>Nothing in this view.</strong>
            <p className="muted" style={{ margin: 0 }}>
              No candidates match right now — pick another view above.
            </p>
          </div>
        </div>
      ) : (
      <div className="board">
        {visibleColumns.map((col) => {
          const cards = col.cards.filter(matches);
          return (
            <div className="board-col" key={col.stage}>
              <div className="board-col-head">
                <span className="mono-label">{STAGE_LABEL[col.stage] ?? col.stage}</span>
                <span className="figure board-col-count">{cards.length}</span>
                <span
                  className="board-wip"
                  style={{
                    color:
                      col.wip === "over"
                        ? "var(--bad)"
                        : col.wip === "ok"
                          ? "var(--ok)"
                          : "var(--faint)",
                  }}
                >
                  {col.wip === "none" ? "no cap" : col.wip === "over" ? `${col.cap} cap` : "ok"}
                </span>
              </div>
              {cards.length === 0 && <p className="board-empty">—</p>}
              {cards.map((c) => (
                <div
                  key={c.id}
                  className={`pipe-card${c.hatched ? " hatched" : ""}${
                    selected.has(c.id) ? " selected" : ""
                  }`}
                  style={{ borderLeftColor: AGE_COLOR[c.age_state] }}
                  onClick={(e) => {
                    // Clicking the card body selects; links still navigate.
                    if ((e.target as HTMLElement).closest("a")) return;
                    toggle(c.id);
                  }}
                >
                  <div className="pipe-card-top">
                    <Link href={`/candidates/${c.candidate.id}`} className="pipe-name">
                      {c.candidate.displayName}
                    </Link>
                    <span
                      className="pipe-age"
                      style={{ color: AGE_COLOR[c.age_state] }}
                      title={`${formatAge(c.age_hours)} in this stage`}
                    >
                      {formatAge(c.age_hours)}
                    </span>
                  </div>
                  <div className="pipe-meta">
                    {c.position_reference && (
                      <span className="ref-code">{c.position_reference}</span>
                    )}{" "}
                    {c.position_title}
                  </div>
                  <div className="pipe-foot">
                    {/* Where they came from. A direct applicant has no vendor,
                        so the channel is what belongs on the card. */}
                    <span
                      className={`channel-chip ${
                        c.source_channel === "vendor" ? "" : "direct"
                      }`}
                    >
                      {c.source_channel === "vendor" ? c.vendor : c.source}
                    </span>
                    <span className="pipe-iv">{c.interviews_label}</span>
                    {c.flags.map((f) => (
                      <span
                        key={f.label}
                        className="pipe-flag"
                        style={{
                          color: FLAG_COLOR[f.tone],
                          borderColor: FLAG_COLOR[f.tone],
                          background: FLAG_WASH[f.tone],
                        }}
                      >
                        {f.label}
                      </span>
                    ))}
                    <span className="pipe-vendor">{c.vendor}</span>
                  </div>
                  {actionsFor && (
                    <span
                      className="pipe-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ActionsMenu items={actionsFor(c)} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}
