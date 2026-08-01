/**
 * Permission catalog. Enforcement is always on permissions, never role names,
 * which is what lets an organization define its own roles at runtime.
 * Authority: docs/09-entitlements.md §2.
 */
export type Permission =
  | "positions.view"
  | "positions.create"
  | "positions.publish"
  | "positions.release"
  | "submissions.view"
  | "submissions.arbitrate"
  | "candidates.view_history"
  | "candidates.merge"
  | "candidates.flag"
  | "applications.transition"
  | "interviews.schedule"
  | "panels.manage"
  | "scorecards.submit"
  | "decisions.record"
  | "vendors.manage"
  | "org.manage_structure"
  | "org.manage_users"
  | "org.settings";

/** Grouped for the role editor, so 18 checkboxes read as five decisions. */
export const PERMISSION_GROUPS: {
  group: string;
  permissions: { key: Permission; label: string }[];
}[] = [
  {
    group: "Positions",
    permissions: [
      { key: "positions.view", label: "See positions" },
      { key: "positions.create", label: "Create and edit positions" },
      { key: "positions.publish", label: "Publish and close positions" },
      { key: "positions.release", label: "Release positions to vendors" },
    ],
  },
  {
    group: "Candidates",
    permissions: [
      { key: "submissions.view", label: "See submissions" },
      { key: "submissions.arbitrate", label: "Arbitrate duplicate submissions" },
      { key: "candidates.view_history", label: "See candidate history" },
      { key: "candidates.merge", label: "Merge and un-merge candidates" },
      { key: "candidates.flag", label: "Raise and clear flags" },
      { key: "applications.transition", label: "Move candidates between stages" },
    ],
  },
  {
    group: "Interviews",
    permissions: [
      { key: "interviews.schedule", label: "Schedule interviews" },
      { key: "panels.manage", label: "Manage panels" },
      { key: "scorecards.submit", label: "Submit scorecards" },
      { key: "decisions.record", label: "Record hire/no-hire decisions" },
    ],
  },
  {
    group: "Administration",
    permissions: [
      { key: "vendors.manage", label: "Manage vendors and contracts" },
      { key: "org.manage_structure", label: "Manage verticals and teams" },
      { key: "org.manage_users", label: "Manage people, roles and access" },
      { key: "org.settings", label: "Change organization settings" },
    ],
  },
];

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

/**
 * The roles every organization starts with. They are seeded as ordinary rows
 * and can be re-permissioned or renamed — they simply cannot be deleted, so
 * there is always something to grant. Anything beyond these (program manager,
 * release train engineer, managing director) is created by the organization.
 *
 * Keep in sync with the seed block in the custom_roles migration.
 */
export const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    key: "org_admin",
    name: "Organization admin",
    description: "Full control, including people, structure, vendors and settings.",
    permissions: [
      "positions.view",
      "positions.create",
      "positions.publish",
      "positions.release",
      "submissions.view",
      "submissions.arbitrate",
      "candidates.view_history",
      "candidates.merge",
      "candidates.flag",
      "applications.transition",
      "interviews.schedule",
      "panels.manage",
      "decisions.record",
      "vendors.manage",
      "org.manage_structure",
      "org.manage_users",
      "org.settings",
    ],
  },
  {
    key: "recruiter",
    name: "Recruiter",
    description:
      "Runs hiring day to day: posts roles, arbitrates duplicates, moves candidates.",
    permissions: [
      "positions.view",
      "positions.create",
      "positions.publish",
      "positions.release",
      "submissions.view",
      "submissions.arbitrate",
      "candidates.view_history",
      "candidates.merge",
      "candidates.flag",
      "applications.transition",
      "interviews.schedule",
      "panels.manage",
    ],
  },
  {
    key: "hiring_manager",
    name: "Hiring manager",
    description:
      "Owns the outcome for their teams: reviews candidates and records decisions.",
    permissions: [
      "positions.view",
      "submissions.view",
      "candidates.view_history",
      "applications.transition",
      "interviews.schedule",
      "panels.manage",
      "decisions.record",
    ],
  },
  {
    key: "project_manager",
    name: "Project manager",
    description: "Read-only visibility into positions and pipeline for their scope.",
    permissions: ["positions.view", "submissions.view"],
  },
  {
    // Interviewers are assignment-scoped, not tree-scoped (docs/09 §4.2):
    // scorecards.submit is granted contextually by panel membership.
    key: "interviewer",
    name: "Interviewer",
    description: "Submits scorecards for interviews they are on the panel of.",
    permissions: ["scorecards.submit"],
  },
];

/** Every permission, for building a user's capability list. */
export const ALL_PERMISSIONS: readonly Permission[] = [
  ...new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))),
];

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/** Drop anything unknown — a stored role must never grant a stale permission. */
export function sanitizePermissions(raw: readonly string[]): Permission[] {
  return [...new Set(raw)].filter((p): p is Permission => PERMISSION_SET.has(p));
}
