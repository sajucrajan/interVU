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

/**
 * Absent `parent_id` = leave the unit where it is; explicit `null` = move it
 * to the top level. The two must stay distinguishable, so this is nullish
 * rather than merely optional.
 */
export const OrgUnitUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  parent_id: z.string().uuid().nullish(),
});

export type OrgUnitKind = z.infer<typeof OrgUnitKind>;
export type OrgUnitCreate = z.infer<typeof OrgUnitCreate>;
export type OrgUnitUpdate = z.infer<typeof OrgUnitUpdate>;

// --- Vendor contracts (docs/05-vendor-portal-and-release.md)

export const VendorStatusEnum = z.enum([
  "invited",
  "active",
  "suspended",
  "terminated",
]);
export const VendorRoleEnum = z.enum(["vendor_admin", "vendor_recruiter"]);

/** Tier 1 is the most preferred; tiered release walks tiers in order. */
export const VendorCreate = z.object({
  name: z.string().min(1).max(200),
  tier: z.number().int().min(1).max(10).default(1),
  status: VendorStatusEnum.default("invited"),
  contract_start: z.coerce.date().nullish(),
  contract_end: z.coerce.date().nullish(),
});

export const VendorUpdate = z.object({
  tier: z.number().int().min(1).max(10).optional(),
  status: VendorStatusEnum.optional(),
  contract_start: z.coerce.date().nullish(),
  contract_end: z.coerce.date().nullish(),
});

export const VendorUserCreate = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  role: VendorRoleEnum.default("vendor_recruiter"),
});

export type VendorStatusEnum = z.infer<typeof VendorStatusEnum>;
export type VendorRoleEnum = z.infer<typeof VendorRoleEnum>;
export type VendorCreate = z.infer<typeof VendorCreate>;
export type VendorUpdate = z.infer<typeof VendorUpdate>;
export type VendorUserCreate = z.infer<typeof VendorUserCreate>;

// --- Org users & access grants (docs/09-entitlements.md)

/**
 * Roles are organization-defined rows, not a fixed list, so a grant names a
 * role by id. org_unit_id null/absent = org-wide.
 */
export const MembershipGrant = z.object({
  role_id: z.string().uuid(),
  org_unit_id: z.string().uuid().nullish(),
});

export const RoleCreate = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullish(),
  permissions: z.array(z.string()).default([]),
});

export const RoleUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullish(),
  permissions: z.array(z.string()).optional(),
});

/** At least one grant: a user with no role can sign in and see nothing. */
export const OrgUserCreate = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  memberships: z.array(MembershipGrant).min(1),
});

export const OrgUserUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

/** Redeeming an invite: the token sets the password and activates the user. */
export const ActivateAccount = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(200),
});

export type MembershipGrant = z.infer<typeof MembershipGrant>;
export type RoleCreate = z.infer<typeof RoleCreate>;
export type RoleUpdate = z.infer<typeof RoleUpdate>;
export type OrgUserCreate = z.infer<typeof OrgUserCreate>;
export type OrgUserUpdate = z.infer<typeof OrgUserUpdate>;
export type ActivateAccount = z.infer<typeof ActivateAccount>;

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

export const RequirementLevel = z.enum(["must_have", "good_to_have"]);
export const Proficiency = z.enum(["awareness", "working", "proficient", "expert"]);
export const Seniority = z.enum(["junior", "mid", "senior", "staff", "principal"]);
export const EmploymentType = z.enum(["full_time", "contract", "contract_to_hire"]);
export const LocationPolicyEnum = z.enum(["onsite", "hybrid", "remote"]);
export const RatePeriod = z.enum(["hourly", "daily", "monthly", "annual"]);

/** One row of the skill matrix: importance and required proficiency are
 *  separate axes; min_years is an optional screening heuristic. */
export const PositionSkillInput = z.object({
  name: z.string().min(1).max(80),
  level: RequirementLevel,
  proficiency: Proficiency.default("working"),
  min_years: z.number().int().min(0).max(40).nullish(),
});

export const SourcingMode = z.enum(["direct", "vendor", "hybrid"]);

/**
 * How a role is sourced. Hybrid holds vendors off until `vendor_opens_at`,
 * which is meaningless — and rejected — in the other two modes, so a stale
 * date cannot sit on a position that has changed its mind.
 */
const sourcingFields = {
  sourcing_mode: SourcingMode.optional(),
  vendor_opens_at: z.string().datetime().nullish(),
};

const refineSourcing = <T extends { sourcing_mode?: string; vendor_opens_at?: unknown }>(
  p: T,
) => p.sourcing_mode === "hybrid" || p.vendor_opens_at == null;
const sourcingMessage = {
  message: "vendor_opens_at only applies to hybrid sourcing",
  path: ["vendor_opens_at"],
};

export const PositionCreate = z.object({
  ...sourcingFields,
  org_unit_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).default(""),
  openings: z.number().int().min(1).default(1),
  seniority: Seniority.nullish(),
  employment_type: EmploymentType.default("full_time"),
  location_policy: LocationPolicyEnum.nullish(),
  location_text: z.string().max(200).nullish(),
  min_total_years: z.number().int().min(0).max(50).nullish(),
  rate_min: z.number().int().min(0).nullish(),
  rate_max: z.number().int().min(0).nullish(),
  rate_currency: z.string().length(3).default("USD"),
  rate_period: RatePeriod.nullish(),
  /** Non-skill screening requirements: certifications, visa, languages… */
  must_haves: z.array(z.string().min(1).max(200)).max(20).default([]),
  skills: z.array(PositionSkillInput).max(30).default([]),
})
  .refine((p) => p.rate_min == null || p.rate_max == null || p.rate_min <= p.rate_max, {
    message: "rate_min must be ≤ rate_max",
  })
  .refine(refineSourcing, sourcingMessage);

/**
 * Edit a live position. Every field optional — send only what changed.
 * `status` handles pause/close/reopen; going from draft to open is the
 * publish endpoint's job, since that needs a release policy.
 */
export const PositionUpdate = z
  .object({
    ...sourcingFields,
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(20_000).optional(),
    openings: z.number().int().min(1).optional(),
    seniority: Seniority.nullish(),
    employment_type: EmploymentType.optional(),
    location_policy: LocationPolicyEnum.nullish(),
    location_text: z.string().max(200).nullish(),
    min_total_years: z.number().int().min(0).max(50).nullish(),
    rate_min: z.number().int().min(0).nullish(),
    rate_max: z.number().int().min(0).nullish(),
    rate_currency: z.string().length(3).optional(),
    rate_period: RatePeriod.nullish(),
    must_haves: z.array(z.string().min(1).max(200)).max(20).optional(),
    skills: z.array(PositionSkillInput).max(30).optional(),
    status: z.enum(["open", "paused", "closed"]).optional(),
  })
  .refine((p) => p.rate_min == null || p.rate_max == null || p.rate_min <= p.rate_max, {
    message: "rate_min must be ≤ rate_max",
  });

export type PositionUpdate = z.infer<typeof PositionUpdate>;

export const MatchReviewResolve = z.object({
  action: z.enum(["link", "keep_separate"]),
});

// --- Reusable job-description templates

/** Author a template directly, or capture one from an existing position. */
export const PositionTemplateCreate = z.object({
  name: z.string().min(1).max(120),
  summary: z.string().max(500).default(""),
  /** Capture every JD field from this position instead of supplying them. */
  from_position_id: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(20_000).optional(),
  seniority: Seniority.nullish(),
  employment_type: EmploymentType.optional(),
  location_policy: LocationPolicyEnum.nullish(),
  location_text: z.string().max(200).nullish(),
  min_total_years: z.number().int().min(0).max(50).nullish(),
  openings: z.number().int().min(1).optional(),
  rate_min: z.number().int().min(0).nullish(),
  rate_max: z.number().int().min(0).nullish(),
  rate_currency: z.string().length(3).optional(),
  rate_period: RatePeriod.nullish(),
  must_haves: z.array(z.string().min(1).max(200)).max(20).optional(),
  org_unit_id: z.string().uuid().nullish(),
  skills: z.array(PositionSkillInput).max(30).optional(),
});

export type PositionTemplateCreate = z.infer<typeof PositionTemplateCreate>;

/** Edit a template. Every field optional — send only what changed. */
export const PositionTemplateUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  summary: z.string().max(500).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(20_000).optional(),
  seniority: Seniority.nullish(),
  employment_type: EmploymentType.optional(),
  location_policy: LocationPolicyEnum.nullish(),
  location_text: z.string().max(200).nullish(),
  min_total_years: z.number().int().min(0).max(50).nullish(),
  openings: z.number().int().min(1).optional(),
  rate_min: z.number().int().min(0).nullish(),
  rate_max: z.number().int().min(0).nullish(),
  rate_currency: z.string().length(3).optional(),
  rate_period: RatePeriod.nullish(),
  must_haves: z.array(z.string().min(1).max(200)).max(20).optional(),
  org_unit_id: z.string().uuid().nullish(),
  skills: z.array(PositionSkillInput).max(30).optional(),
});

export type PositionTemplateUpdate = z.infer<typeof PositionTemplateUpdate>;

// --- Interview panels (skill-tagged panelist pools; scope = org-unit pattern)

export const PanelCreate = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  org_unit_id: z.string().uuid().nullish(), // null = org-wide
  skills: z.array(z.string().min(1).max(80)).min(1).max(30),
  member_ids: z.array(z.string().uuid()).min(1).max(100),
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

// --- Pipeline, interviews, feedback (M2 — docs/03 §2)

export const StageTransitionCreate = z.object({
  to_stage: z.string().min(1).max(60),
  note: z.string().max(2000).optional(),
});

export const DecisionCreate = z.object({
  outcome: z.enum(["offer", "reject", "hold"]),
  reason: z.string().max(2000).default(""),
});

export const InterviewCreate = z.object({
  round_name: z.string().min(1).max(120),
  scheduled_at: z.string().datetime(),
  duration_min: z.number().int().min(15).max(480).default(60),
  location_or_link: z.string().max(500).optional(),
  panelist_ids: z.array(z.string().uuid()).min(1),
});

export const ScorecardCreate = z.object({
  overall_rating: z.number().int().min(1).max(5),
  recommendation: z.enum(["strong_yes", "yes", "no", "strong_no"]),
  notes: z.string().max(10_000).default(""),
  /**
   * Per-competency ratings, keyed by the position's own skills. A null rating
   * means "not assessed in my round" — a real answer, and different from a
   * low score. Rows the panelist leaves blank simply do not appear.
   */
  /** Bank questions actually asked, so usage can be paired with the rating. */
  asked_question_ids: z.array(z.string().uuid()).max(50).default([]),
  competencies: z
    .array(
      z.object({
        skill_id: z.string().uuid(),
        rating: z.number().int().min(1).max(5).nullable(),
        /** What was asked and what came back. A rating with no reason is
         *  the thing a debrief cannot argue with. */
        note: z.string().max(4000).optional(),
      }),
    )
    .default([]),
});

export const FlagCreate = z.object({
  kind: z.enum(["do_not_hire", "caution", "note"]),
  reason: z.string().min(1).max(2000),
  expires_at: z.string().datetime().optional(),
});

export type ReleasePolicy = z.infer<typeof ReleasePolicy>;
export type PositionCreate = z.infer<typeof PositionCreate>;
export type VendorSubmissionCreate = z.infer<typeof VendorSubmissionCreate>;
export type VendorFacingStatus = z.infer<typeof VendorFacingStatus>;
export type PositionSkillInput = z.infer<typeof PositionSkillInput>;
export type MatchReviewResolve = z.infer<typeof MatchReviewResolve>;
export type PanelCreate = z.infer<typeof PanelCreate>;
export type StageTransitionCreate = z.infer<typeof StageTransitionCreate>;
export type DecisionCreate = z.infer<typeof DecisionCreate>;
export type InterviewCreate = z.infer<typeof InterviewCreate>;
export type ScorecardCreate = z.infer<typeof ScorecardCreate>;
export type FlagCreate = z.infer<typeof FlagCreate>;

// --- Offers & dropout (docs/05 §7)

export const RateBandFitEnum = z.enum(["below", "in", "above"]);
export const DeclineReasonEnum = z.enum([
  "compensation",
  "counter_offer",
  "competing_offer",
  "role_scope",
  "location",
  "timing",
  "other",
]);
export const DropoutKindEnum = z.enum(["withdrew", "unresponsive", "declined_offer"]);

/** Extending an offer. Amount is optional: not every org records it. */
export const OfferRecord = z.object({
  amount: z.number().nonnegative().nullish(),
  currency: z.string().length(3).default("EUR"),
  vs_rate_band: RateBandFitEnum.nullish(),
});

/** Closing an offer out. Acceptance is what makes time-to-hire real. */
export const OfferOutcome = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("accepted") }),
  z.object({
    outcome: z.literal("declined"),
    reason: DeclineReasonEnum,
    note: z.string().max(500).default(""),
  }),
]);

/** The candidate left the process — distinct from being rejected. */
export const DropoutRecord = z.object({
  kind: DropoutKindEnum,
  note: z.string().max(500).default(""),
});

export type RateBandFitEnum = z.infer<typeof RateBandFitEnum>;
export type DeclineReasonEnum = z.infer<typeof DeclineReasonEnum>;
export type DropoutKindEnum = z.infer<typeof DropoutKindEnum>;
export type OfferRecord = z.infer<typeof OfferRecord>;
export type OfferOutcome = z.infer<typeof OfferOutcome>;
export type DropoutRecord = z.infer<typeof DropoutRecord>;

// --- Panel debrief & feedback packet (docs/05 §7)

export const FeedbackVisibilityEnum = z.enum(["vendor", "candidate", "none"]);

/**
 * What leaves the building. Competency NAMES only — never a score, never a
 * panelist. `is_draft` false is the human saying "I have read this".
 */
export const FeedbackPacketUpsert = z.object({
  visibility: FeedbackVisibilityEnum.default("vendor"),
  headline: z.string().max(120).default(""),
  summary: z.string().max(4000).default(""),
  strengths: z.array(z.string().max(80)).max(12).default([]),
  gaps: z.array(z.string().max(80)).max(12).default([]),
  reconsider_for: z.string().max(160).nullish(),
  /** Suppresses duplicate flagging for a resubmission after this date. */
  resubmit_after: z.coerce.date().nullish(),
  is_draft: z.boolean().default(true),
});

export const DebriefUpdate = z.object({
  internal_reason: z.string().max(4000).optional(),
});

export type FeedbackVisibilityEnum = z.infer<typeof FeedbackVisibilityEnum>;
export type FeedbackPacketUpsert = z.infer<typeof FeedbackPacketUpsert>;
export type DebriefUpdate = z.infer<typeof DebriefUpdate>;

// --- Shared question bank (docs/01 §interviewer)

export const QuestionKindEnum = z.enum([
  "technical",
  "system_design",
  "behavioural",
  "situational",
]);

export const QuestionCreate = z.object({
  prompt: z.string().min(8).max(2000),
  /** What a STRONG answer usually covers — guidance, not a mark scheme. */
  rubric: z.array(z.string().min(1).max(500)).max(10).default([]),
  follow_ups: z.array(z.string().min(1).max(500)).max(10).default([]),
  kind: QuestionKindEnum.default("technical"),
  level: z.number().int().min(1).max(5).default(3),
  /** Tagged to skills, never to a position — that is what makes it reusable. */
  skill_ids: z.array(z.string().uuid()).min(1).max(10),
});

export const QuestionUpdate = QuestionCreate.partial().extend({
  archived: z.boolean().optional(),
});

/** +1, -1, or 0 to withdraw. */
export const QuestionVote = z.object({
  value: z.number().int().min(-1).max(1),
});

export type QuestionVote = z.infer<typeof QuestionVote>;
export type QuestionCreate = z.infer<typeof QuestionCreate>;
export type QuestionUpdate = z.infer<typeof QuestionUpdate>;
