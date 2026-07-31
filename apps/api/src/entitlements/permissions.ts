import type { OrgRole } from "@prisma/client";

/**
 * Permission catalog. Enforcement is always on permissions, never role names,
 * so custom roles (M4) are additive. Authority: docs/09-entitlements.md §2.
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
  | "scorecards.submit"
  | "decisions.record"
  | "vendors.manage"
  | "org.manage_structure"
  | "org.manage_users";

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  org_admin: [
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
    "decisions.record",
    "vendors.manage",
    "org.manage_structure",
    "org.manage_users",
  ],
  recruiter: [
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
  ],
  hiring_manager: [
    "positions.view",
    "submissions.view",
    "candidates.view_history",
    "applications.transition",
    "interviews.schedule",
    "decisions.record",
  ],
  project_manager: ["positions.view", "submissions.view"],
  // Interviewers are assignment-scoped, not tree-scoped (docs/09 §4.2):
  // scorecards.submit is granted contextually by panel membership.
  interviewer: ["scorecards.submit"],
};
