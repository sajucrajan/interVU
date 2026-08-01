"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal } from "@/components/actions-menu";

interface UnitNode {
  id: string;
  name: string;
  kind: "unit" | "team";
  positions: number;
  grants: number;
  children: UnitNode[];
}

interface Row extends UnitNode {
  depth: number;
}

/** Depth-first walk, so the table reads top-down like the tree it represents. */
function flatten(nodes: UnitNode[], depth = 0): Row[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

/** A unit can move anywhere except into itself or its own subtree. */
function movableTargets(rows: Row[], moving: Row): Row[] {
  const banned = new Set<string>();
  const collect = (n: UnitNode) => {
    banned.add(n.id);
    n.children.forEach(collect);
  };
  collect(moving);
  return rows.filter((r) => !banned.has(r.id) && r.kind === "unit");
}

export default function TeamsAdminPage() {
  const router = useRouter();
  const [tree, setTree] = useState<UnitNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ parent: Row | null } | null>(null);
  const [moving, setMoving] = useState<Row | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);

  const load = useCallback(() => {
    api<UnitNode[]>("/org-units/manage")
      .then(setTree)
      .catch((e) => {
        if ((e as { status?: number }).status === 403) router.push("/dashboard");
        else setError(apiErrorMessage(e));
      });
  }, [router]);

  useEffect(load, [load]);

  if (!tree) return <main className="wide muted">Loading…</main>;

  const rows = flatten(tree);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  return (
    <main className="wide">
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Teams</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Verticals and units contain other units or teams; positions attach to
            teams. Access granted at any node covers everything beneath it.
          </p>
        </div>
        <button onClick={() => setAdding({ parent: null })}>Add a vertical</button>
      </div>

      {error && <p className="error">{error}</p>}

      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th className="num">Positions</th>
            <th className="num">Grants</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span
                  className="tree-name"
                  style={{ paddingLeft: `${r.depth * 1.5}rem` }}
                >
                  {r.depth > 0 && <span className="muted">└</span>}
                  <strong>{r.name}</strong>
                </span>
              </td>
              <td>
                <span className={`badge ${r.kind === "team" ? "ok" : ""}`}>{r.kind}</span>
              </td>
              <td className="num">{r.positions || "—"}</td>
              <td className="num">{r.grants || "—"}</td>
              <td className="num">
                <ActionsMenu
                  items={[
                    { label: "Structure", heading: true },
                    {
                      label: "Rename…",
                      onSelect: () => setRenaming(r),
                    },
                    {
                      label: "Move…",
                      onSelect: () => setMoving(r),
                    },
                    ...(r.kind === "unit"
                      ? [
                          {
                            label: "Add a unit inside",
                            onSelect: () => setAdding({ parent: r }),
                          },
                        ]
                      : []),
                    { label: "Danger", heading: true },
                    {
                      label: "Delete",
                      tone: "danger" as const,
                      onSelect: () => {
                        if (!window.confirm(`Delete “${r.name}”?`)) return;
                        void act(() =>
                          api(`/org-units/${r.id}`, { method: "DELETE" }),
                        );
                      },
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding && (
        <Modal
          title={
            adding.parent ? `Add inside ${adding.parent.name}` : "Add a top-level vertical"
          }
          onClose={() => setAdding(null)}
        >
          <AddUnitForm
            parent={adding.parent}
            onDone={() => {
              setAdding(null);
              load();
            }}
          />
        </Modal>
      )}

      {renaming && (
        <Modal title={`Rename ${renaming.name}`} onClose={() => setRenaming(null)}>
          <RenameForm
            row={renaming}
            onDone={() => {
              setRenaming(null);
              load();
            }}
          />
        </Modal>
      )}

      {moving && (
        <Modal title={`Move ${moving.name}`} onClose={() => setMoving(null)}>
          <MoveForm
            row={moving}
            targets={movableTargets(rows, moving)}
            onDone={() => {
              setMoving(null);
              load();
            }}
          />
        </Modal>
      )}
    </main>
  );
}

function AddUnitForm({ parent, onDone }: { parent: Row | null; onDone: () => void }) {
  const [name, setName] = useState("");
  // Only a unit can hold children, so anything added inside one may be either;
  // a top-level node is always a unit.
  const [kind, setKind] = useState<"unit" | "team">(parent ? "team" : "unit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      {parent && (
        <>
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as "unit" | "team")}>
            <option value="team">Team — holds positions</option>
            <option value="unit">Unit — holds other units and teams</option>
          </select>
        </>
      )}
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/org-units", {
                method: "POST",
                body: { name: name.trim(), kind, parent_id: parent?.id ?? null },
              });
              onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function RenameForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const [name, setName] = useState(row.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !name.trim() || name === row.name}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/org-units/${row.id}`, {
                method: "PATCH",
                body: { name: name.trim() },
              });
              onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Rename"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function MoveForm({
  row,
  targets,
  onDone,
}: {
  row: Row;
  targets: Row[];
  onDone: () => void;
}) {
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Moving a node moves everything beneath it — and everyone&apos;s access to
        it — with it.
      </p>
      <label>New parent</label>
      <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">Top level</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {"— ".repeat(t.depth)}
            {t.name}
          </option>
        ))}
      </select>
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/org-units/${row.id}`, {
                method: "PATCH",
                body: { parent_id: parentId || null },
              });
              onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Moving…" : "Move"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
