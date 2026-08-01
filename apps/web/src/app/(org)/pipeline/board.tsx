"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, apiErrorMessage } from "@/lib/api";
import { formatAge } from "@/components/age-pill";

export interface BoardCard {
  id: string;
  stage: string;
  candidate: { id: string; displayName: string };
  position_reference: string | null;
  position_title: string;
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

interface BoardData {
  total: number;
  columns: BoardColumn[];
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
  onOpenCard,
}: {
  view: string;
  onView: (key: string) => void;
  onOpenCard?: (card: BoardCard) => void;
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

  useEffect(load, [load]);

  if (!data) return <p className="muted">Loading…</p>;

  const matches = (c: BoardCard) => {
    if (view === "unscreened") return c.stage === "submitted";
    if (view === "sla_breached") return c.age_state === "breached";
    if (view === "duplicates") return c.flags.some((f) => f.label === "Duplicate");
    if (view === "awaiting_decision")
      return c.flags.some((f) => f.label === "Decision due");
    return true;
  };

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

      <div className="board">
        {data.columns.map((col) => {
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
                  {onOpenCard && (
                    <button
                      type="button"
                      className="pipe-open"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCard(c);
                      }}
                    >
                      ⋯
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
