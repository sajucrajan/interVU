import { ForbiddenException } from "@nestjs/common";
import type { ResolvedMembership } from "../tenancy/tenant-context";

/**
 * Personas: one person, several jobs, one at a time.
 *
 * A person who is a hiring manager for Engineering and also sits on panels
 * does two different jobs in InterVU, with different screens, queues and
 * permissions. Folding both into one view meant Today mixed a scorecard to
 * file with decisions to record, and the access model had to grant the union
 * of everything the person holds. So the person chooses which job they are
 * doing — the way Workday or Dayforce ask "manager or employee?" — and the
 * server enforces only that job's permissions until they switch
 * (docs/09 §7).
 *
 * Two kinds:
 *   - A ROLE persona for each distinct role the person holds, at every scope
 *     it is granted. "Hiring manager" covers Engineering and GTM together if
 *     the role is granted at both; two scopes of one job are still one job.
 *   - The INTERVIEWER persona, for anyone who sits on an interview panel or
 *     holds a role that only grants scorecards.submit. Interviewing is
 *     assignment-scoped (docs/09 §4.2): panel seats are the grant, and they
 *     count only while acting as interviewer.
 *
 * Pure, so the derivation is unit-tested without a database.
 */
export interface Persona {
  /** Stable key: "interviewer", or the role's key ("hiring_manager"). */
  key: string;
  label: string;
  kind: "role" | "interviewer";
  /** Scope names for the picker: "Engineering, GTM" or "Whole organization". */
  scope: string;
}

export const INTERVIEWER_PERSONA_KEY = "interviewer";

const INTERVIEWER_PERSONA: Persona = {
  key: INTERVIEWER_PERSONA_KEY,
  label: "Interviewer",
  kind: "interviewer",
  scope: "Interviews you sit on",
};

/** A role that grants nothing but filing scorecards is the interviewer job itself. */
const isInterviewerOnly = (m: ResolvedMembership) =>
  m.permissions.every((p) => p === "scorecards.submit");

export function personasFor(
  memberships: readonly ResolvedMembership[],
  onPanels: boolean,
  unitNames: ReadonlyMap<string, string> = new Map(),
): Persona[] {
  const byRole = new Map<string, ResolvedMembership[]>();
  for (const m of memberships) {
    if (isInterviewerOnly(m)) continue;
    byRole.set(m.roleKey, [...(byRole.get(m.roleKey) ?? []), m]);
  }
  const roles: Persona[] = [...byRole.values()].map((ms) => ({
    key: ms[0]!.roleKey,
    label: ms[0]!.roleName,
    kind: "role",
    scope: ms.some((m) => m.orgUnitId === null)
      ? "Whole organization"
      : [...new Set(ms.map((m) => unitNames.get(m.orgUnitId!) ?? "a team"))].join(", "),
  }));
  const interviews =
    onPanels || memberships.some((m) => m.permissions.includes("scorecards.submit"));
  // Admin first, then the rest in grant order, interviewer last: the picker
  // reads top-down as "most to least responsibility".
  roles.sort((a, b) => Number(b.key === "org_admin") - Number(a.key === "org_admin"));
  return interviews ? [...roles, INTERVIEWER_PERSONA] : roles;
}

/** The grants that apply while acting as `persona`: none for the interviewer. */
export function membershipsFor(
  persona: Persona | null,
  memberships: readonly ResolvedMembership[],
): ResolvedMembership[] {
  if (!persona || persona.kind === "interviewer") return [];
  return memberships.filter((m) => m.roleKey === persona.key && !isInterviewerOnly(m));
}

/**
 * Which persona a session acts as, given what is stored and what the person
 * holds. Null means "ask": the guard refuses org routes until one is chosen.
 */
export function resolvePersona(
  personas: readonly Persona[],
  input: { stored: string | null; preferred: string | null; askEachTime: boolean },
): Persona | null {
  const find = (key: string | null) => personas.find((p) => p.key === key) ?? null;
  if (personas.length === 1) return personas[0]!;
  return find(input.stored) ?? (input.askEachTime ? null : find(input.preferred));
}

export const isInterviewer = (persona: Persona | null | undefined) =>
  persona?.kind === "interviewer";

/**
 * Refuse an assignment-based action from a role persona. The web turns this
 * into "Open this as Interviewer →" rather than a dead end.
 */
export function requireInterviewer(persona: Persona | null | undefined): void {
  if (!isInterviewer(persona)) {
    throw new ForbiddenException({
      code: "persona_mismatch",
      required_persona: INTERVIEWER_PERSONA_KEY,
      detail: "This belongs to your Interviewer persona.",
    });
  }
}
