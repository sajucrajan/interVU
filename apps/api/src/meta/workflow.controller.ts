import { Controller, Get } from "@nestjs/common";
import {
  PERMISSION_GROUPS,
  SYSTEM_ROLES,
} from "../entitlements/permissions";
import { PANEL_STAGES } from "../applications/panel-owned";

/**
 * What the product actually does, published from the code that does it.
 *
 * This exists for the "How it works" page, and the reason it is an endpoint
 * rather than a hand-written table in the web app is maintenance. A page that
 * restates the permission model in prose is wrong the first time anyone edits
 * `permissions.ts` and nothing says so — it just quietly starts lying, and a
 * lying explanation of who-can-do-what is worse than none.
 *
 * So the page renders THESE arrays. Add a permission and it appears; move it
 * between roles and the matrix moves with it; rename a stage and the lifecycle
 * renames itself. The prose around them still needs a person, but every
 * factual claim on the page is generated from the source of truth.
 *
 * Deliberately unauthenticated: it describes the shape of the product, not
 * anything belonging to an organization. There is not a single tenant value
 * in the response — no org, no counts, no names.
 */
@Controller("meta/workflow")
export class WorkflowMetaController {
  @Get()
  workflow() {
    return {
      /**
       * The pipeline, in order. `panel_owned` marks where a decision stops
       * being a recruiter's to make on their own — the same constant the
       * decision endpoint enforces.
       */
      stages: [
        {
          key: "submitted",
          label: "Submitted",
          blurb: "A vendor sent a candidate, or someone applied directly.",
        },
        {
          key: "screening",
          label: "Screening",
          blurb: "A recruiter is comparing the CV against what the role needs.",
        },
        {
          key: "interviewing",
          label: "Interviewing",
          blurb: "A panel is assigned; scorecards are being filed.",
        },
        {
          key: "offer",
          label: "Offer",
          blurb: "The debrief concluded and an offer is out.",
        },
        {
          key: "hired",
          label: "Hired",
          blurb: "Accepted. The fee and any guarantee period start counting.",
        },
      ].map((s) => ({ ...s, panel_owned: PANEL_STAGES.includes(s.key) })),

      /** How a position reaches candidates. */
      sourcing_modes: [
        {
          key: "vendor",
          label: "Vendor-sourced",
          blurb: "Released to agencies. They submit; ownership decides whose fee it is.",
        },
        {
          key: "direct",
          label: "Direct only",
          blurb: "Careers page and referrals. No vendor ever sees it.",
        },
        {
          key: "hybrid",
          label: "Hybrid",
          blurb:
            "Direct first, vendors join at a set date — the head start that makes hybrid worth having.",
        },
      ],

      /** Every permission the system knows, grouped as the admin UI groups them. */
      permission_groups: PERMISSION_GROUPS,

      /**
       * The built-in roles. Organizations add their own; these are only the
       * ones that always exist, so the page can show a real starting matrix.
       */
      roles: SYSTEM_ROLES.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
      })),
    };
  }
}
