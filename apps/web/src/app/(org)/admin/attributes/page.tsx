"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage, isForbidden } from "@/lib/api";
import { AccessDenied } from "@/components/access-denied";
import { PageHead } from "@/components/page-head";
import { SectionHead } from "@/components/section-head";

interface Attribute {
  id: string;
  name: string;
  description: string;
  behaviours: string[];
  sortOrder: number;
  archivedAt: string | null;
}

interface Draft {
  name: string;
  description: string;
  behaviours: string;
}

const toDraft = (a?: Attribute): Draft => ({
  name: a?.name ?? "",
  description: a?.description ?? "",
  behaviours: (a?.behaviours ?? []).join("\n"),
});

const fromDraft = (d: Draft) => ({
  name: d.name.trim(),
  description: d.description.trim(),
  behaviours: d.behaviours
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 6),
});

/**
 * The organization's ways of working (docs/01 §4, Ways of working): what every scorecard
 * rates next to the role's skills. Org-wide on purpose, so "team fit" means
 * the same thing in Engineering as in Sales, and each one is written as
 * something an interviewer can see in an hour.
 *
 * Archive, never delete: a rating given against last year's wording is part
 * of a filed scorecard and still shows in that debrief.
 */
export default function AttributesAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Attribute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Attribute[]>("/attributes?all=true")
      .then(setRows)
      .catch((e) => {
        if (isForbidden(e)) setDenied(true);
        else setError(apiErrorMessage(e));
      });
  }, []);

  useEffect(load, [load]);

  if (denied) {
    return (
      <AccessDenied
        what="Ways of working"
        why="Changing what every scorecard rates is organization policy, so it sits with the admin."
        back={{ href: "/dashboard", label: "Back to Today" }}
      />
    );
  }
  if (!rows) return <main className="wide muted">Loading…</main>;

  const active = rows.filter((r) => !r.archivedAt);
  const archived = rows.filter((r) => r.archivedAt);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(null);
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(() =>
      editing === "new"
        ? api("/attributes", { method: "POST", body: fromDraft(draft) })
        : api(`/attributes/${editing}`, { method: "PATCH", body: fromDraft(draft) }),
    );

  const move = (id: string, dir: -1 | 1) => {
    const ids = active.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void act(() => api("/attributes/order", { method: "PUT", body: { ids } }));
  };

  const form = (
    <div className="card attr-form">
      <label>Name</label>
      <input
        value={draft.name}
        maxLength={60}
        placeholder="Collaboration"
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <label>What it means here, in one line</label>
      <input
        value={draft.description}
        maxLength={300}
        placeholder="Works with people rather than around them."
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <label>What strong looks like, one per line (up to six)</label>
      <textarea
        rows={4}
        value={draft.behaviours}
        placeholder={"Credits others unprompted\nTakes a push-back as information, not as an attack"}
        onChange={(e) => setDraft({ ...draft, behaviours: e.target.value })}
      />
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Write things an interviewer can see in an hour. A trait nobody can
        observe gets rated on gut feel, which is the thing this list exists to
        stop.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button disabled={busy || draft.name.trim().length < 2} onClick={save}>
          {busy ? "Saving…" : editing === "new" ? "Add" : "Save"}
        </button>
        <button className="secondary" disabled={busy} onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <main className="wide">
      <PageHead
        kicker="Admin · scorecards"
        title="Ways of working"
        lede="Rated on every scorecard, next to the role's skills, so a debrief can say “strong on skills, split on collaboration”. The same list for every role; a 1 or a 5 needs a note on what was seen. Never shared with agencies."
        actions={
          <button
            disabled={editing !== null}
            onClick={() => {
              setDraft(toDraft());
              setEditing("new");
            }}
          >
            Add one
          </button>
        }
      />

      {error && <p className="error">{error}</p>}
      {editing === "new" && form}

      <SectionHead label={`On every scorecard · ${active.length}`} />
      {active.length === 0 && editing !== "new" && (
        <p className="muted">
          None yet. Scorecards rate the role&apos;s skills only until you add
          one.
        </p>
      )}
      <div className="attr-admin">
        {active.map((a, i) =>
          editing === a.id ? (
            <div key={a.id}>{form}</div>
          ) : (
            <div key={a.id} className="card attr-card">
              <div className="attr-card-head">
                <div>
                  <strong>{a.name}</strong>
                  {a.description && <div className="muted">{a.description}</div>}
                </div>
                <div className="row attr-card-actions">
                  <button
                    className="secondary"
                    aria-label={`Move ${a.name} up`}
                    disabled={busy || i === 0}
                    onClick={() => move(a.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="secondary"
                    aria-label={`Move ${a.name} down`}
                    disabled={busy || i === active.length - 1}
                    onClick={() => move(a.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || editing !== null}
                    onClick={() => {
                      setDraft(toDraft(a));
                      setEditing(a.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() => api(`/attributes/${a.id}`, { method: "PATCH", body: { archived: true } }))
                    }
                  >
                    Retire
                  </button>
                </div>
              </div>
              {a.behaviours.length > 0 && (
                <ul className="attr-behaviours">
                  {a.behaviours.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
      </div>

      {archived.length > 0 && (
        <>
          <SectionHead label={`Retired · ${archived.length}`} />
          <p className="muted" style={{ fontSize: 13 }}>
            Not on new scorecards. Ratings already filed against these still
            show in their debriefs.
          </p>
          <div className="attr-admin">
            {archived.map((a) => (
              <div key={a.id} className="card attr-card retired">
                <div className="attr-card-head">
                  <div>
                    <strong>{a.name}</strong>
                    {a.description && <div className="muted">{a.description}</div>}
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(() => api(`/attributes/${a.id}`, { method: "PATCH", body: { archived: false } }))
                    }
                  >
                    Bring back
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="muted" style={{ marginTop: "var(--step-4)" }}>
        Not sure the list is right? <a href="/questions">The question bank</a>{" "}
        has behavioural questions tagged to skills; a way of working is what
        you rate after asking one.
      </p>
    </main>
  );
}
