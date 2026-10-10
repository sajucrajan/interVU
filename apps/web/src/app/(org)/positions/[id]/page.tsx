"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal, type MenuItem } from "@/components/actions-menu";
import {
  MustHavesEditor,
  SkillMatrixEditor,
  fromSkillRecords,
  toSkillPayload,
  useKnownSkills,
  type SkillRow,
} from "@/components/skill-matrix";
import { usePageIdentity } from "@/components/sticky-identity";
import { PositionBriefView, type Brief } from "@/components/position-brief";
import { formatDate, formatDateTime, formatRelativeDay } from "@/lib/format";

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
  /**
   * "full" for anyone holding positions.view on the unit; "interviewer" for a
   * panelist without it, who gets the brief instead. The API decides, and
   * sends whichever it decided — so this page renders what it was given
   * rather than asking who is reading.
   */
  audience?: "full" | "interviewer";
  sourcingMode: "direct" | "vendor" | "hybrid";
  vendorOpensAt: string | null;
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

/** Just what the summary strip reads from GET /applications. */
interface RoleApplication {
  id: string;
  currentStage: string;
  status: string;
  sourceChannel: string | null;
}

const STAGES = [
  ["submitted", "Submitted"],
  ["screening", "Screening"],
  ["interviewing", "Interviewing"],
  ["offer", "Offer"],
  ["hired", "Hired"],
] as const;

/**
 * Where this role's candidates are. The page described the role in detail and
 * said nothing about how hiring for it was going; you had to leave for the
 * pipeline to find out whether anyone was in it at all.
 */
function RoleCandidates({ positionId, apps }: { positionId: string; apps: RoleApplication[] }) {
  const active = apps.filter((a) => a.status === "active");
  const closed = apps.length - active.length;
  const fromAgencies = apps.filter((a) => a.sourceChannel === "vendor").length;
  return (
    <div className="card role-cands">
      <div className="role-cands-head">
        <p className="chart-title" style={{ margin: 0 }}>
          Candidates on this role
        </p>
        <Link href={`/pipeline?position=${positionId}`}>Open in the pipeline →</Link>
      </div>
      {apps.length === 0 ? (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Nobody yet. Candidates appear here as agencies submit or people apply.
        </p>
      ) : (
        <>
          <div className="role-cands-stages">
            {STAGES.map(([key, label]) => {
              const n = active.filter((a) => a.currentStage === key).length;
              return (
                <div key={key} className={n === 0 ? "empty" : ""}>
                  <span className="figure">{n}</span>
                  <span className="mono-label">{label}</span>
                </div>
              );
            })}
          </div>
          <p className="muted role-cands-foot">
            {active.length} active · {closed} closed ·{" "}
            {fromAgencies} of {apps.length} came from agencies
          </p>
        </>
      )}
    </div>
  );
}

export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Detail | null>(null);
  const [vendors, setVendors] = useState<VendorOrg[]>([]);
  const [apps, setApps] = useState<RoleApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "publish" | "release" | "template" | "edit" | "requirements" | null
  >(null);

  const refresh = useCallback(
    () =>
      Promise.all([
        api<Detail>(`/positions/${id}`)
          .then(setP)
          .catch(() => undefined),
        // Readable by anyone who can see submissions; anyone who cannot just
        // gets the page without the summary.
        api<RoleApplication[]>(`/applications?position_id=${id}`)
          .then(setApps)
          .catch(() => setApps(null)),
      ]),
    [id, router],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Only the full view releases to vendors. A panelist reading the brief has
  // no positions.view, so asking for the vendor list just collected a 403.
  const fullView = p !== null && p.audience !== "interviewer";
  useEffect(() => {
    if (!fullView) return;
    api<VendorOrg[]>("/vendors")
      .then(setVendors)
      .catch(() => setVendors([]));
  }, [fullView]);

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

  usePageIdentity(p ? { label: p.title, meta: p.reference } : null);

  if (!p) return <main className="wide muted">Loading…</main>;

  // A panelist without positions.view gets the brief at this same URL, so
  // every link to a role in the product is correct for whoever follows it.
  // Branching here rather than inside the editing surface below: nothing in
  // it applies to a reader who cannot edit, and threading a redacted shape
  // through would put "may this reader see this?" into each of its branches.
  if (p.audience === "interviewer") {
    return (
      <PositionBriefView
        brief={p as unknown as Brief}
        backHref="/interviews"
        backLabel="Back to your interviews"
      />
    );
  }

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
  /**
   * When an agency can actually see the role. A release row alone is not the
   * answer: a direct-only role is hidden whatever the rows say, and a hybrid
   * one waits for its unlock date as well. The table used to read the rows
   * raw, so a direct-only role reported "3 of 3 visible now".
   */
  const seesFrom = (visibleFrom: string): Date | null => {
    if (p.sourcingMode === "direct") return null;
    const from = new Date(visibleFrom);
    if (p.sourcingMode === "hybrid" && p.vendorOpensAt) {
      const opens = new Date(p.vendorOpensAt);
      return opens > from ? opens : from;
    }
    return from;
  };
  const now = new Date();
  const releasedCount = p.releases.filter((r) => {
    const at = seesFrom(r.visibleFrom);
    return at !== null && at <= now;
  }).length;
  const unreleased = vendors.filter(
    (v) => v.status === "active" && !p.releases.some((r) => r.vendorOrg.id === v.id),
  );

  const items: MenuItem[] = [{ label: "Edit", heading: true }];
  items.push({ label: "Edit details…", onSelect: () => setDialog("edit") });
  items.push({ label: "Edit requirements…", onSelect: () => setDialog("requirements") });
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

      {apps && <RoleCandidates positionId={p.id} apps={apps} />}

      <div className="viz-grid">
        <div className="card">
          <p className="chart-title">Requirements</p>
          {p.skills.length === 0 ? (
            <>
              <p className="muted" style={{ margin: "0 0 0.6rem" }}>
                No skills defined. Add a skill matrix so panel matching and vendor
                screening have something to work with.
              </p>
              <button className="secondary" onClick={() => setDialog("requirements")}>
                Add requirements
              </button>
            </>
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

        {/* Channel sits directly above the release panel, because changing it
            is what decides whether that panel means anything at all. */}
        <div className="card">
          <p className="chart-title">Sourcing channel</p>
          <p className="chart-sub">
            {p.sourcingMode === "direct"
              ? "Direct only — agencies never see this role."
              : p.sourcingMode === "hybrid"
                ? p.vendorOpensAt
                  ? `Hybrid — agencies join ${formatDate(p.vendorOpensAt)}.`
                  : "Hybrid — no unlock date set, so agencies can see it now."
                : "Vendors — released to agencies under the policy below."}
          </p>
          {/* A segmented control, not three buttons. The current channel used
              to render as a disabled button, which reads as "unavailable"
              rather than "selected". */}
          <div className="segmented" role="group" aria-label="Sourcing channel">
            {(["vendor", "hybrid", "direct"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={mode === p.sourcingMode}
                onClick={() =>
                  mode !== p.sourcingMode &&
                  act(() =>
                    api(`/positions/${p.id}`, {
                      method: "PATCH",
                      body: {
                        sourcing_mode: mode,
                        // Switching away from hybrid clears the stale date;
                        // switching to it leaves the date to be set here.
                        ...(mode === "hybrid" ? {} : { vendor_opens_at: null }),
                      },
                    }),
                  )
                }
              >
                {mode === "vendor"
                  ? "Vendors"
                  : mode === "hybrid"
                    ? "Hybrid"
                    : "Direct only"}
              </button>
            ))}
          </div>
          {p.sourcingMode === "hybrid" && (
            <div style={{ marginTop: "0.75rem", maxWidth: 220 }}>
              <label>Vendors join on</label>
              <input
                type="date"
                defaultValue={p.vendorOpensAt ? p.vendorOpensAt.slice(0, 10) : ""}
                onChange={(e) =>
                  act(() =>
                    api(`/positions/${p.id}`, {
                      method: "PATCH",
                      body: {
                        vendor_opens_at: e.target.value
                          ? new Date(`${e.target.value}T00:00:00Z`).toISOString()
                          : null,
                      },
                    }),
                  )
                }
              />
            </div>
          )}
        </div>

        <div className="card">
          <p className="chart-title">Vendor release</p>
          <p className="chart-sub">
            {!p.releasePolicy
              ? "Not published, so no agency can see this position."
              : p.sourcingMode === "direct"
                ? "Direct only, so no agency sees it, whatever the release says."
                : `Policy: ${nice(p.releasePolicy.mode)} · ${releasedCount} of ${p.releases.length} can see it now`}
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
                  <th>Sees it</th>
                </tr>
              </thead>
              <tbody>
                {p.releases.map((r, i) => {
                  const at = seesFrom(r.visibleFrom);
                  const live = at !== null && at <= now;
                  return (
                    <tr key={i}>
                      <td>{r.vendorOrg.vendor.name}</td>
                      <td>{r.vendorOrg.tier}</td>
                      <td>
                        {at === null ? (
                          <span className="badge">never · direct only</span>
                        ) : live ? (
                          <span className="badge ok">since {formatDate(at)}</span>
                        ) : (
                          <span
                            className="badge warn"
                            title={formatDateTime(at)}
                          >
                            {formatRelativeDay(at)}
                          </span>
                        )}
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
      {dialog === "requirements" && (
        <Modal
          title={`Requirements — ${p.reference}`}
          onClose={() => setDialog(null)}
        >
          <RequirementsForm
            position={p}
            onDone={async () => {
              setDialog(null);
              await refresh();
            }}
          />
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
  const [f, setF] = useState({
    title: position.title,
    description: position.description,
    openings: String(position.openings),
    seniority: position.seniority ?? "",
    employment_type: position.employmentType,
    location_policy: position.locationPolicy ?? "",
    location_text: position.locationText ?? "",
    rate_min: position.rateMin != null ? String(position.rateMin) : "",
    rate_max: position.rateMax != null ? String(position.rateMax) : "",
    rate_currency: position.rateCurrency,
    rate_period: position.ratePeriod ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  return (
    <>
      <label>Title</label>
      <input value={f.title} onChange={set("title")} />
      <div className="row">
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Seniority</label>
          <select value={f.seniority} onChange={set("seniority")}>
            <option value="">—</option>
            {["junior", "mid", "senior", "staff", "principal"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Employment</label>
          <select value={f.employment_type} onChange={set("employment_type")}>
            <option value="full_time">Full-time</option>
            <option value="contract">Contract</option>
            <option value="contract_to_hire">Contract-to-hire</option>
          </select>
        </div>
        <div style={{ width: 110 }}>
          <label>Openings</label>
          <input type="number" min={1} value={f.openings} onChange={set("openings")} />
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Location policy</label>
          <select value={f.location_policy} onChange={set("location_policy")}>
            <option value="">—</option>
            <option value="onsite">Onsite</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 180 }}>
          <label>Location</label>
          <input value={f.location_text} onChange={set("location_text")} />
        </div>
      </div>
      <div className="row">
        <div style={{ width: 120 }}>
          <label>Rate min</label>
          <input type="number" value={f.rate_min} onChange={set("rate_min")} />
        </div>
        <div style={{ width: 120 }}>
          <label>Rate max</label>
          <input type="number" value={f.rate_max} onChange={set("rate_max")} />
        </div>
        <div style={{ width: 100 }}>
          <label>Currency</label>
          <input value={f.rate_currency} onChange={set("rate_currency")} maxLength={3} />
        </div>
        <div style={{ width: 130 }}>
          <label>Per</label>
          <select value={f.rate_period} onChange={set("rate_period")}>
            <option value="">—</option>
            {["hourly", "daily", "monthly", "annual"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label>Description</label>
      <textarea rows={5} value={f.description} onChange={set("description")} />
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !f.title.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/positions/${position.id}`, {
                method: "PATCH",
                body: {
                  title: f.title.trim(),
                  description: f.description,
                  openings: Number(f.openings) || 1,
                  seniority: f.seniority || null,
                  employment_type: f.employment_type,
                  location_policy: f.location_policy || null,
                  location_text: f.location_text || null,
                  rate_min: f.rate_min ? Number(f.rate_min) : null,
                  rate_max: f.rate_max ? Number(f.rate_max) : null,
                  rate_currency: f.rate_currency,
                  rate_period: f.rate_period || null,
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

function RequirementsForm({
  position,
  onDone,
}: {
  position: Detail;
  onDone: () => Promise<void>;
}) {
  const knownSkills = useKnownSkills();
  const [skills, setSkills] = useState<SkillRow[]>(fromSkillRecords(position.skills));
  const [mustHaves, setMustHaves] = useState<string[]>(position.mustHaves ?? []);
  const [minYears, setMinYears] = useState(
    position.minTotalYears != null ? String(position.minTotalYears) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Importance and required proficiency are separate axes — panel matching
        weights the first, interviewers assess against the second. Vendors see
        this matrix on the posting.
      </p>
      <label>Minimum total experience (years)</label>
      <input
        type="number"
        min={0}
        style={{ width: 140 }}
        value={minYears}
        onChange={(e) => setMinYears(e.target.value)}
      />
      <label style={{ marginTop: "0.9rem" }}>Skill matrix</label>
      <SkillMatrixEditor
        rows={skills}
        onChange={setSkills}
        knownSkills={knownSkills}
        listId="pos-edit-skills"
      />
      <label style={{ marginTop: "1rem" }}>Other must-haves</label>
      <MustHavesEditor values={mustHaves} onChange={setMustHaves} />
      <div style={{ marginTop: "1.2rem" }}>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/positions/${position.id}`, {
                method: "PATCH",
                body: {
                  skills: toSkillPayload(skills),
                  must_haves: mustHaves,
                  min_total_years: minYears ? Number(minYears) : null,
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
          {busy ? "Saving…" : "Save requirements"}
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
