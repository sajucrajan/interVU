"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { ActionsMenu, Modal } from "@/components/actions-menu";

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  grants: number;
}

interface PermissionGroup {
  group: string;
  permissions: { key: string; label: string }[];
}

export default function RolesAdminPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<Role[]>("/roles")
      .then(setRoles)
      .catch((e) => {
        if ((e as { status?: number }).status === 403) router.push("/dashboard");
        else setError(apiErrorMessage(e));
      });
  }, [router]);

  useEffect(() => {
    load();
    api<PermissionGroup[]>("/roles/permissions").then(setGroups).catch(() => undefined);
  }, [load]);

  if (!roles) return <main className="wide muted">Loading…</main>;

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
          <h1 style={{ marginBottom: "0.2rem" }}>Roles</h1>
          <p className="muted" style={{ marginTop: 0, maxWidth: "68ch" }}>
            A role is a bundle of permissions. Name them the way your
            organization does — program manager, release train engineer,
            managing director — then grant them at whatever scope applies.
          </p>
        </div>
        <button onClick={() => setCreating(true)}>Create a role</button>
      </div>

      {error && <p className="error">{error}</p>}

      <table className="data">
        <thead>
          <tr>
            <th>Role</th>
            <th>What it allows</th>
            <th className="num">People</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                {r.is_system && (
                  <>
                    {" "}
                    <span className="badge">built-in</span>
                  </>
                )}
                {r.description && (
                  <>
                    <br />
                    <span className="muted" style={{ fontSize: "0.85rem" }}>
                      {r.description}
                    </span>
                  </>
                )}
              </td>
              <td>
                {r.permissions.length === 0 ? (
                  <span className="muted">nothing yet</span>
                ) : (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {r.permissions.length} permission
                    {r.permissions.length === 1 ? "" : "s"}
                  </span>
                )}
              </td>
              <td className="num">{r.grants || "—"}</td>
              <td className="num">
                <ActionsMenu
                  items={[
                    { label: "Edit permissions…", onSelect: () => setEditing(r) },
                    {
                      label: "Delete",
                      tone: "danger" as const,
                      disabled: r.is_system || r.grants > 0,
                      onSelect: () => {
                        if (!window.confirm(`Delete the role “${r.name}”?`)) return;
                        void act(() => api(`/roles/${r.id}`, { method: "DELETE" }));
                      },
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(creating || editing) && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "Create a role"}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        >
          <RoleForm
            role={editing}
            groups={groups}
            onDone={() => {
              setCreating(false);
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </main>
  );
}

function RoleForm({
  role,
  groups,
  onDone,
}: {
  role: Role | null;
  groups: PermissionGroup[];
  onDone: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      <label>Role name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={role?.is_system}
        placeholder="Release Train Engineer"
      />
      {role?.is_system && (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Built-in roles keep their name, but you can change what they allow.
        </p>
      )}
      <label>Description</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Watches pipeline across the teams in their train."
      />

      <label style={{ marginTop: "1rem" }}>Permissions</label>
      {groups.map((g) => (
        <div key={g.group} style={{ marginBottom: "0.9rem" }}>
          <p className="chart-title" style={{ margin: "0 0 0.3rem" }}>
            {g.group}
          </p>
          {g.permissions.map((p) => (
            <label
              key={p.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontWeight: 400,
                margin: "0.15rem 0",
              }}
            >
              <input
                type="checkbox"
                style={{ width: "auto", margin: 0 }}
                checked={picked.has(p.key)}
                onChange={() => toggle(p.key)}
              />
              {p.label}
            </label>
          ))}
        </div>
      ))}

      <div style={{ marginTop: "1rem" }}>
        <button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const body = {
              name: name.trim(),
              description: description.trim() || null,
              permissions: [...picked],
            };
            try {
              if (role) await api(`/roles/${role.id}`, { method: "PATCH", body });
              else await api("/roles", { method: "POST", body });
              onDone();
            } catch (e) {
              setError(apiErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : role ? "Save role" : "Create role"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
