"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal } from "@/components/actions-menu";

interface Membership {
  id: string;
  role: string;
  org_unit_id: string | null;
  org_unit_name: string | null;
}

interface Person {
  id: string;
  name: string;
  email: string;
  status: "invited" | "active" | "disabled";
  pending_activation: boolean;
  memberships: Membership[];
}

interface UnitNode {
  id: string;
  name: string;
  kind: string;
  children: UnitNode[];
}

const ROLES = [
  "org_admin",
  "recruiter",
  "hiring_manager",
  "project_manager",
  "interviewer",
] as const;

const nice = (s: string) => s.replaceAll("_", " ");

/** Flatten the unit tree into indented options, so scope reads as a hierarchy. */
function flatten(nodes: UnitNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${"— ".repeat(depth)}${n.name}` },
    ...flatten(n.children, depth + 1),
  ]);
}

export default function PeopleAdminPage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [units, setUnits] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [granting, setGranting] = useState<Person | null>(null);
  /** Shown after an invite so an admin can pass the link on directly. */
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);

  const load = useCallback(() => {
    api<Person[]>("/org-users/manage")
      .then(setPeople)
      .catch((e) => {
        if ((e as { status?: number }).status === 403) router.push("/dashboard");
        else setError(apiErrorMessage(e));
      });
  }, [router]);

  useEffect(() => {
    load();
    api<UnitNode[]>("/org-units").then((t) => setUnits(flatten(t))).catch(() => undefined);
  }, [load]);

  if (!people) return <main className="wide muted">Loading…</main>;

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
          <h1 style={{ marginBottom: "0.2rem" }}>People</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {people.length} user{people.length === 1 ? "" : "s"}. Access is granted as
            a role at a scope — org-wide, or a unit and everything beneath it.
          </p>
        </div>
        <button onClick={() => setInviting(true)}>Invite someone</button>
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
            <th>Name</th>
            <th>Email</th>
            <th>Access</th>
            <th>Status</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
              </td>
              <td className="muted">{p.email}</td>
              <td>
                {p.memberships.length === 0 ? (
                  <span className="muted">no access</span>
                ) : (
                  <div className="row" style={{ flexWrap: "wrap", gap: "0.3rem" }}>
                    {p.memberships.map((m) => (
                      <span key={m.id} className="badge" title={m.org_unit_name ?? "Org-wide"}>
                        {nice(m.role)} @ {m.org_unit_name ?? "org-wide"}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <span
                  className={`badge ${
                    p.status === "active" ? "ok" : p.status === "disabled" ? "" : "warn"
                  }`}
                >
                  {p.pending_activation && p.status !== "disabled"
                    ? "awaiting activation"
                    : p.status}
                </span>
              </td>
              <td className="num">
                <ActionsMenu
                  items={[
                    { label: "Access", heading: true },
                    { label: "Manage access…", onSelect: () => setGranting(p) },
                    { label: "Account", heading: true },
                    {
                      label: "Send a new invitation",
                      disabled: p.status === "disabled",
                      onSelect: () =>
                        act(async () => {
                          const inv = await api<{ url: string }>(
                            `/org-users/${p.id}/invite`,
                            { method: "POST" },
                          );
                          setLink({ name: p.name, url: inv.url });
                        }),
                    },
                    p.status === "disabled"
                      ? {
                          label: "Re-enable",
                          onSelect: () =>
                            act(() =>
                              api(`/org-users/${p.id}`, {
                                method: "PATCH",
                                body: { status: "active" },
                              }),
                            ),
                        }
                      : {
                          label: "Disable sign-in",
                          tone: "danger" as const,
                          onSelect: () =>
                            act(() =>
                              api(`/org-users/${p.id}`, {
                                method: "PATCH",
                                body: { status: "disabled" },
                              }),
                            ),
                        },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {inviting && (
        <Modal title="Invite someone" onClose={() => setInviting(false)}>
          <InviteForm
            units={units}
            onDone={(invite) => {
              setInviting(false);
              setLink(invite);
              load();
            }}
          />
        </Modal>
      )}

      {granting && (
        <Modal title={`Access for ${granting.name}`} onClose={() => setGranting(null)}>
          <GrantEditor
            person={granting}
            units={units}
            onChanged={() => {
              load();
              setGranting(null);
            }}
          />
        </Modal>
      )}
    </main>
  );
}

function InviteForm({
  units,
  onDone,
}: {
  units: { id: string; label: string }[];
  onDone: (invite: { name: string; url: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("recruiter");
  const [unitId, setUnitId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <label>Full name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Work email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="row">
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {nice(r)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label>Scope</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Org-wide</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        A unit scope covers that unit and every team beneath it. You can add more
        roles once the person exists.
      </p>
      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !name.trim() || !email.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await api<{ name: string; invite: { url: string } }>(
                "/org-users",
                {
                  method: "POST",
                  body: {
                    name: name.trim(),
                    email: email.trim(),
                    memberships: [{ role, org_unit_id: unitId || null }],
                  },
                },
              );
              onDone({ name: res.name, url: res.invite.url });
            } catch (e) {
              setError(apiErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Inviting…" : "Send invitation"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function GrantEditor({
  person,
  units,
  onChanged,
}: {
  person: Person;
  units: { id: string; label: string }[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Membership[]>(person.memberships);
  const [role, setRole] = useState<string>("interviewer");
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {rows.length === 0 ? (
        <p className="muted">
          No access yet — this person can sign in but will see nothing.
        </p>
      ) : (
        <table className="data">
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{nice(m.role)}</strong>
                </td>
                <td className="muted">{m.org_unit_name ?? "org-wide"}</td>
                <td className="num">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(`/org-users/${person.id}/memberships/${m.id}`, {
                          method: "DELETE",
                        });
                        setRows((r) => r.filter((x) => x.id !== m.id));
                      })
                    }
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <label style={{ marginTop: "1rem" }}>Grant another role</label>
      <div className="row">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {nice(r)}
            </option>
          ))}
        </select>
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Org-wide</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const created = await api<{
                id: string;
                role: string;
                orgUnitId: string | null;
              }>(`/org-users/${person.id}/memberships`, {
                method: "POST",
                body: { role, org_unit_id: unitId || null },
              });
              setRows((r) => [
                ...r,
                {
                  id: created.id,
                  role: created.role,
                  org_unit_id: created.orgUnitId,
                  org_unit_name:
                    units.find((u) => u.id === created.orgUnitId)?.label.replace(/^(— )+/, "") ??
                    null,
                },
              ]);
            })
          }
        >
          Grant
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: "1rem" }}>
        <button className="secondary" onClick={onChanged}>
          Done
        </button>
      </div>
    </>
  );
}
