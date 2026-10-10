"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface OrgMe {
  kind: "org";
  id: string;
  name: string;
  email: string;
  capabilities: string[];
  memberships: { role: string; role_name: string; org_unit_id: string | null }[];
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
