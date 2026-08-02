"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal } from "@/components/actions-menu";
import { SectionHead } from "@/components/section-head";

interface Position {
  id: string;
  reference: string;
  title: string;
  status: string;
  openings: number;
  seniority: string | null;
  employmentType: string;
  orgUnit: { name: string };
  skills: { level: string; skill: { name: string } }[];
  sourcingMode: "direct" | "vendor" | "hybrid";
  vendorOpensAt: string | null;
  releasePolicy?: { mode: string } | null;
  releases: { visibleFrom: string }[];
}

export default function PositionsPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [q, setQ] = useState("");
  const [templateFor, setTemplateFor] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      api<Position[]>("/positions")
        .then(setPositions)
        .catch(() => router.push("/login")),
    [router],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function duplicate(p: Position) {
    setError(null);
    try {
      const copy = await api<{ id: string }>(`/positions/${p.id}/duplicate`, {
        method: "POST",
      });
      router.push(`/positions/${copy.id}`);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  if (!positions) return <main className="wide muted">Loading…</main>;

  const filtered = positions.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q.toLowerCase()) ||
      p.orgUnit.name.toLowerCase().includes(q.toLowerCase()),
  );
  const open = filtered.filter((p) => p.status === "open");
  const other = filtered.filter((p) => p.status !== "open");

  return (
    <main className="wide">
      <div className="row spread">
        <h1>Positions</h1>
        <Link href="/positions/new">
          <button>+ New position</button>
        </Link>
      </div>
      <input
        placeholder="Filter by title or team…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 340, marginBottom: "1rem" }}
      />

      {error && <p className="error">{error}</p>}
      <PositionTable
        title={`Open (${open.length})`}
        rows={open}
        onDuplicate={duplicate}
        onSaveTemplate={setTemplateFor}
      />
      {other.length > 0 && (
        <PositionTable
          title={`Draft & closed (${other.length})`}
          rows={other}
          onDuplicate={duplicate}
          onSaveTemplate={setTemplateFor}
        />
      )}

      {templateFor && (
        <Modal title={`Save as template — ${templateFor.title}`} onClose={() => setTemplateFor(null)}>
          <SaveTemplateForm
            position={templateFor}
            onDone={() => {
              setTemplateFor(null);
              void refresh();
            }}
          />
        </Modal>
      )}
    </main>
  );
}

function PositionTable({
  title,
  rows,
  onDuplicate,
  onSaveTemplate,
}: {
  title: string;
  rows: Position[];
  onDuplicate: (p: Position) => void;
  onSaveTemplate: (p: Position) => void;
}) {
  if (rows.length === 0) return null;
  const now = new Date();
  return (
    <section>
      <SectionHead label={title} />
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 110 }}>Ref</th>
            <th>Role</th>
            <th>Team</th>
            <th>Status</th>
            <th>Channel</th>
            <th>Release</th>
            <th>Vendors</th>
            <th style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="ref-code">{p.reference}</span>
              </td>
              <td>
                <Link href={`/positions/${p.id}`}>
                  <strong>{p.title}</strong>
                </Link>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {[p.seniority, p.employmentType?.replaceAll("_", " ")]
                    .filter(Boolean)
                    .join(" · ")}
                  {p.openings > 1 ? ` · ${p.openings} openings` : ""}
                </div>
                {p.skills.length > 0 && (
                  <div style={{ marginTop: "0.2rem" }}>
                    {p.skills.slice(0, 4).map((s) => (
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
              <td>
                {/* Channel is a property of the ROLE, not a place in the nav:
                    it is decided when the position is opened. */}
                <span
                  className={`channel-chip ${p.sourcingMode}`}
                  title={
                    p.sourcingMode === "hybrid" && p.vendorOpensAt
                      ? `Vendors join ${new Date(p.vendorOpensAt).toLocaleDateString()}`
                      : undefined
                  }
                >
                  {p.sourcingMode}
                </span>
              </td>
              <td className="muted">{p.releasePolicy?.mode.replaceAll("_", " ") ?? "—"}</td>
              <td className="muted">
                {p.releases.filter((r) => new Date(r.visibleFrom) <= now).length} / {p.releases.length}
              </td>
              <td>
                <ActionsMenu
                  items={[
                    { label: "Reuse", heading: true },
                    { label: "Duplicate as new draft", onSelect: () => onDuplicate(p) },
                    { label: "Save as template…", onSelect: () => onSaveTemplate(p) },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}


function SaveTemplateForm({
  position,
  onDone,
}: {
  position: Position;
  onDone: () => void;
}) {
  const [name, setName] = useState(`${position.title} — standard`);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Captures the whole job description — title, seniority, employment type,
        location, rate band, skill matrix and must-haves — for reuse on future
        openings.
      </p>
      <label>Template name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Summary (optional)</label>
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="When should someone reach for this template?"
      />
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/position-templates", {
                method: "POST",
                body: { name: name.trim(), summary, from_position_id: position.id },
              });
              onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save template"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
