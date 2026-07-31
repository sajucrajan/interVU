import { z } from "zod";

// --- Org structure (docs/03-data-model.md §2)
// Organizations are a tree: units/verticals contain units or teams;
// positions attach to team nodes only.

export const OrgUnitKind = z.enum(["unit", "team"]);

export const OrgUnitCreate = z.object({
  parent_id: z.string().uuid().nullish(),
  name: z.string().min(1).max(200),
  kind: OrgUnitKind,
});

export type OrgUnitKind = z.infer<typeof OrgUnitKind>;
export type OrgUnitCreate = z.infer<typeof OrgUnitCreate>;

// --- Positions & release (docs/03-data-model.md, docs/05-vendor-portal-and-release.md)

export const ReleaseMode = z.enum(["all_at_once", "tiered", "manual"]);

export const TieredReleaseStep = z.object({
  tier: z.number().int().min(1),
  delay_hours: z.number().int().min(0),
});

export const ReleasePolicy = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all_at_once") }),
  z.object({ mode: z.literal("tiered"), steps: z.array(TieredReleaseStep).min(1) }),
  z.object({ mode: z.literal("manual") }),
]);

export const PositionStatus = z.enum(["draft", "open", "paused", "closed"]);

export const PositionCreate = z.object({
  org_unit_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).default(""),
  openings: z.number().int().min(1).default(1),
});

// --- Vendor submissions (docs/05-vendor-portal-and-release.md §3)

export const VendorSubmissionCreate = z.object({
  candidate_name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(4).max(32),
  linkedin_url: z.string().url().optional(),
  current_title: z.string().max(200).optional(),
  current_employer: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  expected_rate: z.string().max(100).optional(),
  vendor_notes: z.string().max(5_000).optional(),
  candidate_consent_confirmed: z.boolean(),
});

/** Coarse statuses — the ONLY status vocabulary vendors ever see. */
export const VendorFacingStatus = z.enum([
  "received",
  "submitted",
  "screening",
  "interviewing",
  "offered",
  "hired",
  "not_selected",
  "not_eligible",
  "withdrawn",
]);

export type ReleasePolicy = z.infer<typeof ReleasePolicy>;
export type PositionCreate = z.infer<typeof PositionCreate>;
export type VendorSubmissionCreate = z.infer<typeof VendorSubmissionCreate>;
export type VendorFacingStatus = z.infer<typeof VendorFacingStatus>;
