"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal, type MenuItem } from "@/components/actions-menu";

interface Detail {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: string;
  openings: number;
  seniority: string | null;
  employmentType: string;
  locationPolicy: string | null;
  locationText: string | null;
  minTotalYears: number | null;
  rateMin: number | null;
  rateMax: number | null;
  rateCurrency: string;
  ratePeriod: string | null;
  mustHaves: string[];
  orgUnitId: string;
  orgUnit: { name: string };
  skills: { level: string; proficiency: string; minYears: number | null; skill: { name: string } }[];
  releasePolicy: { mode: string } | null;
  releases: {
    visibleFrom: string;
    vendorOrg: { id: string; tier: number; vendor: { name: string } };
  }[];
}
interface VendorOrg {
  id: string;
  tier: number;
  status: string;
  vendor: { name: string };
}

const nice = (s: string | null | undefined) => (s ? s.replaceAll("_", " ") : null);

export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Detail | null>(null);
  const [vendors, setVendors] = useState<VendorOrg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"publish" | "release" | "template" | "edit" | null>(
    null,
  );

  const refresh = useCallback(
    () =>
      api<Detail>(`/positions/${id}`)
        .then(setP)
        .catch(() => router.push("/login")),
    [id, router],
  );

  useEffect(() => {
    void refresh();
    api<VendorOrg[]>("/vendors")
      .then(setVendors)
      .catch(() => setVendors([]));
  }, [refresh]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(apiErrorMessage(e));
      }
    },
    [refresh],
  );

  if (!p) return <main className="wide muted">Loading…</main>;

  const meta = [
    p.orgUnit.name,
    nice(p.seniority),
    nice(p.employmentType),
    [nice(p.locationPolicy), p.locationText].filter(Boolean).join(" · "),
    p.minTotalYears != null ? `${p.minTotalYears}+ yrs` : null,
    p.rateMin != null && p.rateMax != null
      ? `${p.rateCurrency} ${p.rateMin}–${p.rateMax}${p.ratePeriod ? ` / ${nice(p.ratePeriod)}` : ""}`
      : null,
    `${p.openings} opening${p.openings > 1 ? "s" : ""}`,
  ].filter(Boolean);

  const musts = p.skills.filter((s) => s.level === "must_have");
  const goods = p.skills.filter((s) => s.level === "good_to_have");
  const releasedCount = p.releases.filter(
    (r) => new Date(r.visibleFrom) <= new Date(),
  ).length;
  const unreleased = vendors.filter(
    (v) => v.status === "active" && !p.releases.some((r) => r.vendorOrg.id === v.id),
  );

  const items: MenuItem[] = [{ label: "Edit", heading: true }];
  items.push({ label: "Edit details…", onSelect: () => setDialog("edit") });
  if (p.status === "draft") {
    items.push({
      label: "Publish to vendors…",
      tone: "primary",
      onSelect: () => setDialog("publish"),
    });
  }
  if (p.status === "open") {
    items.push(
      { label: "Lifecycle", heading: true },
      {
        label: "Pause (hide from vendors)",
        onSelect: () =>
          act(() => api(`/positions/${p.id}`, { method: "PATCH", body: { status: "paused" } })),
      },
      {
        label: "Close position",
        tone: "danger",
        onSelect: () => {
          if (!window.confirm("Close this position? This cannot be undone.")) return;
          act(() =>
            api(`/positions/${p.id}`, { method: "PATCH", body: { status: "closed" } }),
          );
        },
      },
    );
  }
  if (p.status === "paused") {
    items.push(
      { label: "Lifecycle", heading: true },
      {
        label: "Reopen to vendors",
        tone: "primary",
        onSelect: () =>
          act(() => api(`/positions/${p.id}`, { method: "PATCH", body: { status: "open" } })),
      },
      {
        label: "Close position",
        tone: "danger",
        onSelect: () =>
          act(() => api(`/positions/${p.id}`, { method: "PATCH", body: { status: "closed" } })),
      },
    );
  }
  if (p.status === "open" && unreleased.length > 0) {
    items.push(
      { label: "Vendors", heading: true },
      { label: "Release to a vendor…", onSelect: () => setDialog("release") },
    );
  }
  items.push(
    { label: "Reuse", heading: true },
    {
      label: "Duplicate as new draft",
      onSelect: () =>
        act(async () => {
          const copy = await api<{ id: string }>(`/positions/${p.id}/duplicate`, {
            method: "POST",
          });
          router.push(`/positions/${copy.id}`);
        }),
    },
    { label: "Save as template…", onSelect: () => setDialog("template") },
  );

  return (
    <main className="wide">
      <p>
        <Link href="/positions">← Positions</Link>
      </p>
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: 0 }}>
            <span className="ref-code ref-lg">{p.reference}</span> {p.title}
          </h1>
          <p className="muted" style={{ marginTop: "0.4rem" }}>
            {meta.join(" · ")}
          </p>
        </div>
        <div className="row">
          <span className={`badge ${p.status === "open" ? "ok" : p.status === "closed" ? "bad" : "warn"}`}>
            {p.status}
          </span>
          <Link href={`/pipeline?position=${p.id}`}>
            <button className="secondary">View candidates</button>
          </Link>
          <ActionsMenu items={items} />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <p className="chart-title">About the role</p>
        {p.description ? (
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{p.description}</p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No description yet — add one via <em>Edit details</em>.
          </p>
        )}
      </div>

      <div className="viz-grid">
        <div className="card">
          <p className="chart-title">Requirements</p>
          {p.skills.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No skills defined. Add a skill matrix so panel matching and vendor
              screening have something to work with.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Importance</th>
                  <th>Proficiency</th>
                  <th className="num">Min yrs</th>
                </tr>
              </thead>
              <tbody>
                {[...musts, ...goods].map((s) => (
                  <tr key={s.skill.name}>
                    <td>
                      <strong>{s.skill.name}</strong>
                    </td>
                    <td>
                      <span className={`badge ${s.level === "must_have" ? "warn" : ""}`}>
                        {nice(s.level)}
                      </span>
                    </td>
                    <td>{s.proficiency}</td>
                    <td className="num">{s.minYears ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.mustHaves.length > 0 && (
            <>
              <p className="chart-title" style={{ marginTop: "1rem" }}>
                Other must-haves
              </p>
              <ul style={{ margin: 0 }}>
                {p.mustHaves.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card">
          <p className="chart-title">Vendor release</p>
          <p className="chart-sub">
            {p.releasePolicy
              ? `Policy: ${nice(p.releasePolicy.mode)} · ${releasedCount} of ${p.releases.length} visible now`
              : "Not published — vendors cannot see this position."}
          </p>
          {p.releases.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No vendors yet.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Tier</th>
                  <th>Visible from</th>
                </tr>
              </thead>
              <tbody>
                {p.releases.map((r, i) => {
                  const live = new Date(r.visibleFrom) <= new Date();
                  return (
                    <tr key={i}>
                      <td>{r.vendorOrg.vendor.name}</td>
                      <td>{r.vendorOrg.tier}</td>
                      <td className="muted">
                        {new Date(r.visibleFrom).toLocaleString()}{" "}
                        {!live && <span className="badge warn">scheduled</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {dialog === "publish" && (
        <Modal title={`Publish ${p.reference}`} onClose={() => setDialog(null)}>
          <PublishForm
            positionId={p.id}
            onDone={async () => {
              setDialog(null);
              await refresh();
            }}
          />
        </Modal>
      )}
      {dialog === "release" && (
        <Modal title="Release to a vendor" onClose={() => setDialog(null)}>
          <ReleaseForm
            positionId={p.id}
            vendors={unreleased}
            onDone={async () => {
              setDialog(null);
              await refresh();
            }}
          />
        </Modal>
      )}
      {dialog === "template" && (
        <Modal title={`Save ${p.reference} as a template`} onClose={() => setDialog(null)}>
          <SaveTemplateForm position={p} onDone={() => setDialog(null)} />
        </Modal>
      )}
      {dialog === "edit" && (
        <Modal title={`Edit ${p.reference}`} onClose={() => setDialog(null)}>
          <EditForm
            position={p}
            onDone={async () => {
              setDialog(null);
              await refresh();
            }}
          />
        </Modal>
      )}
    </main>
  );
}

function PublishForm({
  positionId,
  onDone,
}: {
  positionId: string;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState("all_at_once");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Choose how vendors get access. Releases only ever widen visibility.
      </p>
      <label>Release policy</label>
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="all_at_once">All vendors now</option>
        <option value="tiered">Tier 1 now, tier 2 after 7 days</option>
        <option value="manual">Manual — release vendor by vendor</option>
      </select>
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const body =
                mode === "tiered"
                  ? {
                      mode: "tiered",
                      steps: [
                        { tier: 1, delay_hours: 0 },
                        { tier: 2, delay_hours: 168 },
                      ],
                    }
                  : { mode };
              await api(`/positions/${positionId}/publish`, { method: "POST", body });
              await onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function ReleaseForm({
  positionId,
  vendors,
  onDone,
}: {
  positionId: string;
  vendors: VendorOrg[];
  onDone: () => Promise<void>;
}) {
  const [vendorOrgId, setVendorOrgId] = useState(vendors[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Give a vendor immediate access, ahead of their tier schedule.
      </p>
      <label>Vendor</label>
      <select value={vendorOrgId} onChange={(e) => setVendorOrgId(e.target.value)}>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.vendor.name} (tier {v.tier})
          </option>
        ))}
      </select>
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !vendorOrgId}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/positions/${positionId}/releases`, {
                method: "POST",
                body: { vendor_org_id: vendorOrgId },
              });
              await onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Releasing…" : "Release now"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function EditForm({ position, onDone }: { position: Detail; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState(position.title);
  const [description, setDescription] = useState(position.description);
  const [openings, setOpenings] = useState(String(position.openings));
  const [rateMin, setRateMin] = useState(position.rateMin != null ? String(position.rateMin) : "");
  const [rateMax, setRateMax] = useState(position.rateMax != null ? String(position.rateMax) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <label>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>Description</label>
      <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="row">
        <div style={{ width: 120 }}>
          <label>Openings</label>
          <input
            type="number"
            min={1}
            value={openings}
            onChange={(e) => setOpenings(e.target.value)}
          />
        </div>
        <div style={{ width: 130 }}>
          <label>Rate min</label>
          <input type="number" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
        </div>
        <div style={{ width: 130 }}>
          <label>Rate max</label>
          <input type="number" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/positions/${position.id}`, {
                method: "PATCH",
                body: {
                  title: title.trim(),
                  description,
                  openings: Number(openings) || 1,
                  rate_min: rateMin ? Number(rateMin) : null,
                  rate_max: rateMax ? Number(rateMax) : null,
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
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function SaveTemplateForm({ position, onDone }: { position: Detail; onDone: () => void }) {
  const [name, setName] = useState(`${position.title} — standard`);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (saved) {
    return (
      <p>
        Saved. <Link href="/templates">View templates →</Link>
      </p>
    );
  }
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Captures the whole job description for reuse on future openings.
      </p>
      <label>Template name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Summary (optional)</label>
      <input value={summary} onChange={(e) => setSummary(e.target.value)} />
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
              setSaved(true);
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
