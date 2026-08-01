"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal } from "@/components/actions-menu";

interface VendorUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  pending_activation: boolean;
}

interface Contract {
  id: string;
  vendor_id: string;
  name: string;
  tier: number;
  status: "invited" | "active" | "suspended" | "terminated";
  contract_start: string | null;
  contract_end: string | null;
  submissions: number;
  releases: number;
  users: VendorUser[];
}

const STATUS_TONE: Record<Contract["status"], string> = {
  active: "ok",
  invited: "warn",
  suspended: "warn",
  terminated: "",
};

/**
 * Contract dates are calendar dates, not instants: they're stored as UTC
 * midnight, so formatting them in the viewer's local zone would render
 * 2026-01-01 as "31/12/2025" for anyone west of Greenwich.
 */
const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { timeZone: "UTC" }) : "—";
const nice = (s: string) => s.replaceAll("_", " ");

export default function VendorsAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [people, setPeople] = useState<Contract | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);

  const load = useCallback(() => {
    api<Contract[]>("/vendors/manage")
      .then(setRows)
      .catch((e) => {
        if ((e as { status?: number }).status === 403) router.push("/dashboard");
        else setError(apiErrorMessage(e));
      });
  }, [router]);

  useEffect(load, [load]);

  if (!rows) return <main className="wide muted">Loading…</main>;

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
          <h1 style={{ marginBottom: "0.2rem" }}>Vendors</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {rows.length} contract{rows.length === 1 ? "" : "s"}. Tier 1 is the most
            preferred — tiered release opens a position to tiers in order.
          </p>
        </div>
        <button onClick={() => setAdding(true)}>Add a vendor</button>
      </div>

      {error && <p className="error">{error}</p>}

      {link && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <p className="chart-title">Activation link for {link.name}</p>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            An invitation email has been queued. If this deployment has no mail
            server configured, send this link yourself — it works once and
            expires in seven days.
          </p>
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
          <div className="row" style={{ marginTop: "0.6rem" }}>
            <button
              className="secondary"
              onClick={() => void navigator.clipboard?.writeText(link.url)}
            >
              Copy link
            </button>
            <button className="secondary" onClick={() => setLink(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <table className="data">
        <thead>
          <tr>
            <th>Vendor</th>
            <th className="num">Tier</th>
            <th>Status</th>
            <th>Contract</th>
            <th className="num">People</th>
            <th className="num">Submissions</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.name}</strong>
              </td>
              <td className="num">{c.tier}</td>
              <td>
                <span className={`badge ${STATUS_TONE[c.status]}`}>{c.status}</span>
              </td>
              <td className="muted">
                {c.contract_start || c.contract_end
                  ? `${day(c.contract_start)} → ${day(c.contract_end)}`
                  : "—"}
              </td>
              <td className="num">{c.users.length || "—"}</td>
              <td className="num">{c.submissions || "—"}</td>
              <td className="num">
                <ActionsMenu
                  items={[
                    { label: "Contract", heading: true },
                    { label: "Edit contract…", onSelect: () => setEditing(c) },
                    ...(c.status === "active"
                      ? [
                          {
                            label: "Suspend",
                            tone: "danger" as const,
                            onSelect: () =>
                              act(() =>
                                api(`/vendors/${c.id}`, {
                                  method: "PATCH",
                                  body: { status: "suspended" },
                                }),
                              ),
                          },
                        ]
                      : [
                          {
                            label: "Activate",
                            disabled: c.status === "terminated",
                            onSelect: () =>
                              act(() =>
                                api(`/vendors/${c.id}`, {
                                  method: "PATCH",
                                  body: { status: "active" },
                                }),
                              ),
                          },
                        ]),
                    { label: "People", heading: true },
                    { label: "Manage people…", onSelect: () => setPeople(c) },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="card empty-state">
          <span className="empty-icon">🤝</span>
          <div>
            <strong>No vendors yet.</strong>
            <p className="muted" style={{ margin: 0 }}>
              Add an agency to start releasing positions to them.
            </p>
          </div>
        </div>
      )}

      {adding && (
        <Modal title="Add a vendor" onClose={() => setAdding(false)}>
          <ContractForm
            onDone={() => {
              setAdding(false);
              load();
            }}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Contract with ${editing.name}`} onClose={() => setEditing(null)}>
          <ContractForm
            contract={editing}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}

      {people && (
        <Modal title={`People at ${people.name}`} onClose={() => setPeople(null)}>
          <VendorPeople
            contract={people}
            onInvited={(invite) => {
              setLink(invite);
              setPeople(null);
              load();
            }}
            onChanged={load}
          />
        </Modal>
      )}
    </main>
  );
}

function ContractForm({
  contract,
  onDone,
}: {
  contract?: Contract;
  onDone: () => void;
}) {
  const editing = !!contract;
  const [name, setName] = useState(contract?.name ?? "");
  const [tier, setTier] = useState(String(contract?.tier ?? 1));
  const [status, setStatus] = useState(contract?.status ?? "invited");
  const [start, setStart] = useState(contract?.contract_start?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(contract?.contract_end?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {!editing && (
        <>
          <label>Agency name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}
      <div className="row">
        <div style={{ width: 110 }}>
          <label>Tier</label>
          <input
            type="number"
            min={1}
            max={10}
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Contract["status"])}
          >
            {["invited", "active", "suspended", "terminated"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 1, minWidth: 150 }}>
          <label>Contract start</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label>Contract end</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Suspending or terminating takes effect immediately: the vendor loses
        access to positions and cannot submit, even on an open session.
      </p>
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || (!editing && !name.trim())}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const body = {
              tier: Number(tier),
              status,
              contract_start: start || null,
              contract_end: end || null,
            };
            try {
              if (editing) {
                await api(`/vendors/${contract!.id}`, { method: "PATCH", body });
              } else {
                await api("/vendors", {
                  method: "POST",
                  body: { ...body, name: name.trim() },
                });
              }
              onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : editing ? "Save contract" : "Add vendor"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function VendorPeople({
  contract,
  onInvited,
  onChanged,
}: {
  contract: Contract;
  onInvited: (invite: { name: string; url: string }) => void;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState(contract.users);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("vendor_recruiter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {users.length === 0 ? (
        <p className="muted">
          Nobody here yet — invite a recruiter so this agency can sign in.
        </p>
      ) : (
        <table className="data">
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <br />
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {u.email}
                  </span>
                </td>
                <td className="muted">{nice(u.role)}</td>
                <td>
                  <span
                    className={`badge ${
                      u.status === "active" ? "ok" : u.status === "disabled" ? "" : "warn"
                    }`}
                  >
                    {u.pending_activation && u.status !== "disabled"
                      ? "awaiting activation"
                      : u.status}
                  </span>
                </td>
                <td className="num">
                  <ActionsMenu
                    items={[
                      {
                        label: "Send a new invitation",
                        onSelect: () =>
                          run(async () => {
                            const inv = await api<{ url: string }>(
                              `/vendors/${contract.id}/users/${u.id}/invite`,
                              { method: "POST" },
                            );
                            onInvited({ name: u.name, url: inv.url });
                          }),
                      },
                      u.status === "disabled"
                        ? {
                            label: "Re-enable",
                            onSelect: () =>
                              run(async () => {
                                await api(`/vendors/${contract.id}/users/${u.id}`, {
                                  method: "PATCH",
                                  body: { status: "active" },
                                });
                                setUsers((us) =>
                                  us.map((x) =>
                                    x.id === u.id ? { ...x, status: "active" } : x,
                                  ),
                                );
                              }),
                          }
                        : {
                            label: "Disable sign-in",
                            tone: "danger" as const,
                            onSelect: () =>
                              run(async () => {
                                await api(`/vendors/${contract.id}/users/${u.id}`, {
                                  method: "PATCH",
                                  body: { status: "disabled" },
                                });
                                setUsers((us) =>
                                  us.map((x) =>
                                    x.id === u.id ? { ...x, status: "disabled" } : x,
                                  ),
                                );
                              }),
                          },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <label style={{ marginTop: "1rem" }}>Invite someone at {contract.name}</label>
      <div className="row">
        <input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="vendor_recruiter">recruiter</option>
          <option value="vendor_admin">admin</option>
        </select>
        <button
          disabled={busy || !name.trim() || !email.trim()}
          onClick={() =>
            run(async () => {
              const res = await api<{ name: string; invite: { url: string } }>(
                `/vendors/${contract.id}/users`,
                {
                  method: "POST",
                  body: { name: name.trim(), email: email.trim(), role },
                },
              );
              onInvited({ name: res.name, url: res.invite.url });
            })
          }
        >
          Invite
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
