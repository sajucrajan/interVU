"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface Persona {
  key: string;
  label: string;
  kind: "role" | "interviewer";
  scope: string;
  /** Work waiting in this persona, by the worklist's rules. */
  pending: number;
}

export interface OrgMe {
  kind: "org";
  id: string;
  name: string;
  email: string;
  /** Of the ACTIVE persona only (docs/09 §7). */
  capabilities: string[];
  memberships: { role: string; role_name: string; org_unit_id: string | null }[];
  /** Null until chosen; the org shell sends such a session to /choose-persona. */
  persona: Omit<Persona, "pending"> | null;
  personas: Persona[];
  persona_preference: { default_persona: string | null; ask_at_login: boolean };
}

/**
 * The signed-in org user, for deciding what to OFFER. The server still decides
 * what to allow; this only stops the UI linking to pages that would refuse.
 * Null until loaded, so callers can hold back links rather than flash them.
 */
export function useMe(): OrgMe | null {
  const [me, setMe] = useState<OrgMe | null>(null);
  useEffect(() => {
    api<OrgMe | { kind: "vendor" }>("/auth/me")
      .then((m) => {
        if (m.kind === "org") setMe(m as OrgMe);
      })
      .catch(() => undefined);
  }, []);
  return me;
}

export const can = (me: OrgMe | null, permission: string) =>
  !!me && me.capabilities.includes(permission);
