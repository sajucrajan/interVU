import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, Position, VendorOrg } from "@prisma/client";
import {
  normalizeEmail,
  normalizePhone,
  scorePair,
  T_AUTO,
  T_REVIEW,
  type MatchFeatureBreakdown,
} from "@intervu/matching-core";
import type { VendorSubmissionCreate } from "@intervu/contracts";
import { ErasureService } from "../candidates/erasure.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextCandidateReference } from "../candidates/reference";

const DAY_MS = 86_400_000;

/** Coarse statuses — the only vocabulary vendors ever see (docs/05 §3). */
function coarseStatus(status: string): string {
  switch (status) {
    case "received":
    case "pending_review":
      return "received";
    case "accepted":
      return "submitted";
    case "duplicate":
      return "not_eligible";
    case "rejected":
      return "not_selected";
    case "withdrawn":
      return "withdrawn";
    default:
      return "received";
  }
}

interface VendorIdentity {
  vendorId: string;
  vendorUserId: string;
  /** The session's organization — vendor access is always org-scoped. */
  organizationId: string;
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly erasure: ErasureService,
  ) {}

  /**
   * Vendor submission with the deterministic duplicate probe (docs/05 §3):
   * normalize → identity match → ownership evaluation → link-or-create.
   * Fuzzy scoring and the review queue land in M3; identity accretion makes
   * deterministic matching stronger with every submission.
   */
  async submit(vendor: VendorIdentity, positionId: string, input: VendorSubmissionCreate) {
    // Visibility predicate: open + released to this vendor + vendor active.
    const now = new Date();
    const position = await this.prisma.position.findFirst({
      where: {
        id: positionId,
        // Bound to the session's organization, not merely to the vendor.
        organizationId: vendor.organizationId,
        status: "open",
        releases: {
          some: {
            visibleFrom: { lte: now },
            vendorOrg: {
              vendorId: vendor.vendorId,
              organizationId: vendor.organizationId,
              status: "active",
            },
          },
        },
      },
      include: { organization: true },
    });
    if (!position) throw new NotFoundException("Position not found or not open to you");

    const vendorOrg = await this.prisma.vendorOrg.findUnique({
      where: {
        vendorId_organizationId: {
          vendorId: vendor.vendorId,
          organizationId: position.organizationId,
        },
      },
    });
    if (!vendorOrg) throw new NotFoundException("No vendor relationship with this organization");

    // --- Stage 1: normalize (docs/04 §2.1)
    const settings = (position.organization.settings ?? {}) as {
      ownership_scope?: "position" | "organization";
      ownership_window_days?: number;
      default_phone_region?: string;
    };
    const emailNorm = normalizeEmail(input.email);
    if (!emailNorm) {
      throw new BadRequestException({ code: "invalid_email" });
    }
    const phone = normalizePhone(
      input.phone,
      (settings.default_phone_region as never) ?? "US",
    );

    const identityKeys: { kind: "email" | "phone" | "phone_last10"; valueNorm: string; valueRaw: string }[] = [
      { kind: "email", valueNorm: emailNorm, valueRaw: input.email },
    ];
    if (phone.e164) identityKeys.push({ kind: "phone", valueNorm: phone.e164, valueRaw: input.phone });
    if (phone.last10) identityKeys.push({ kind: "phone_last10", valueNorm: phone.last10, valueRaw: input.phone });

    // --- Stage 2: deterministic identity match (docs/04 §2.2).
    // Erased candidates are excluded: a tombstoned record must never be
    // resurrected by a new submission (docs/04 §7).
    const hits = await this.prisma.candidateIdentity.findMany({
      where: {
        organizationId: position.organizationId,
        candidate: { erasedAt: null },
        OR: identityKeys.map((k) => ({ kind: k.kind, valueNorm: k.valueNorm })),
      },
    });

    // Tombstone probe: was a record with this identifier previously erased?
    // Recorded for admins (ownership-window disputes) — never surfaced to
    // vendors, never used to link.
    const tombstoneHit = await this.erasure.tombstoneExists(
      position.organizationId,
      emailNorm,
    );
    // Email hit wins if identifiers disagree; the disagreement is recorded for
    // the review queue (docs/04 §2.2 collision guard).
    const candidateIds = [...new Set(hits.map((h) => h.candidateId))];
    const emailHit = hits.find((h) => h.kind === "email");
    let matchedCandidateId = emailHit?.candidateId ?? hits[0]?.candidateId ?? null;
    const identityConflict = candidateIds.length > 1;

    let matchScore = matchedCandidateId ? 1 : 0;
    let featureBreakdown: Record<string, unknown> = {
      email_hit: !!emailHit,
      phone_hit: hits.some((h) => h.kind === "phone" || h.kind === "phone_last10"),
      identity_conflict: identityConflict,
      distinct_candidates_hit: candidateIds.length,
      ...(tombstoneHit ? { erased_record_existed: true } : {}),
    };

    // --- Stage 2b: probabilistic match on deterministic miss (docs/04 §2.3–2.4)
    if (!matchedCandidateId) {
      const fuzzy = await this.fuzzyMatch(position.organizationId, input, emailNorm);
      if (fuzzy && fuzzy.score >= T_AUTO) {
        matchedCandidateId = fuzzy.candidateId;
        matchScore = fuzzy.score;
        featureBreakdown = { fuzzy: true, ...fuzzy.breakdown };
      } else if (fuzzy && fuzzy.score >= T_REVIEW) {
        // Uncertain: park for a human (docs/04 §3) — no candidate link, no
        // application, vendor just sees "received".
        return this.parkForReview(position, vendorOrg, vendor, input, fuzzy);
      }
    }

    // --- Stage 3: ownership evaluation (docs/03 §5, docs/05 §4)
    if (matchedCandidateId) {
      const scope = settings.ownership_scope ?? "position";
      const windowDays = settings.ownership_window_days ?? 180;
      const owning = await this.prisma.submission.findFirst({
        where: {
          organizationId: position.organizationId,
          candidateId: matchedCandidateId,
          receivedAt: { gte: new Date(now.getTime() - windowDays * DAY_MS) },
          status: { notIn: ["rejected", "withdrawn", "duplicate"] },
          ...(scope === "position" ? { positionId: position.id } : {}),
        },
        orderBy: { receivedAt: "asc" },
      });

      if (owning && owning.vendorOrgId === vendorOrg.id && owning.positionId === position.id) {
        // Same vendor, same position, same person: idempotent update.
        const updated = await this.prisma.submission.update({
          where: { id: owning.id },
          data: {
            rawProfile: input as unknown as Prisma.InputJsonValue,
            expectedRate: input.expected_rate,
            vendorNotes: input.vendor_notes,
          },
        });
        return { submission: this.toVendorDto(updated, position.title), idempotent: true };
      }

      if (owning && owning.vendorOrgId !== vendorOrg.id) {
        // Another vendor owns this candidate (this position, or org-wide per
        // scope). Record the duplicate — the org sees the full contest — but
        // reveal nothing about the source to the submitting vendor.
        await this.prisma.$transaction(async (tx) => {
          const dup = await tx.submission.create({
            data: {
              organizationId: position.organizationId,
              positionId: position.id,
              vendorOrgId: vendorOrg.id,
              vendorUserId: vendor.vendorUserId,
              candidateId: matchedCandidateId,
              rawProfile: input as unknown as Prisma.InputJsonValue,
              status: "duplicate",
              ownershipStatus: "duplicate",
              consentConfirmed: input.candidate_consent_confirmed,
              expectedRate: input.expected_rate,
              vendorNotes: input.vendor_notes,
            },
          });
          await tx.matchDecision.create({
            data: {
              submissionId: dup.id,
              candidateId: matchedCandidateId,
              outcome: "auto_linked",
              score: matchScore,
              featureBreakdown: featureBreakdown as Prisma.InputJsonValue,
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId: position.organizationId,
              actorType: "vendor_user",
              actorId: vendor.vendorUserId,
              event: "submission.duplicate_flagged",
              entityType: "submission",
              entityId: dup.id,
              payload: { positionId: position.id, owningSubmissionId: owning.id },
            },
          });
        });
        void this.notifications.dispatch({
          organizationId: position.organizationId,
          type: "submission.duplicate_flagged",
          title: "Duplicate submission contest",
          text: `${input.candidate_name} was submitted for ${position.title} but another source already owns this candidate. Arbitration data is on the workspace.`,
          payload: { position_id: position.id },
        });
        throw new ConflictException({
          code: "duplicate_submission",
          detail: "This candidate is not eligible: already in process from another source.",
        });
      }
    }

    // --- Stage 4: link-or-create + identity accretion + application
    const result = await this.prisma.$transaction(async (tx) => {
      const candidate = matchedCandidateId
        ? await tx.candidate.findUniqueOrThrow({ where: { id: matchedCandidateId } })
        : await tx.candidate.create({
            data: {
              reference: await nextCandidateReference(tx, position.organizationId),
              organizationId: position.organizationId,
              displayName: input.candidate_name,
              currentTitle: input.current_title,
              currentEmployer: input.current_employer,
              location: input.location,
            },
          });

      const submission = await tx.submission.create({
        data: {
          organizationId: position.organizationId,
          positionId: position.id,
          vendorOrgId: vendorOrg.id,
          vendorUserId: vendor.vendorUserId,
          candidateId: candidate.id,
          rawProfile: input as unknown as Prisma.InputJsonValue,
          status: "accepted",
          ownershipStatus: "owner",
          consentConfirmed: input.candidate_consent_confirmed,
          expectedRate: input.expected_rate,
          vendorNotes: input.vendor_notes,
        },
      });

      await tx.candidateIdentity.createMany({
        data: identityKeys.map((k) => ({
          organizationId: position.organizationId,
          candidateId: candidate.id,
          kind: k.kind,
          valueNorm: k.valueNorm,
          valueRaw: k.valueRaw,
          sourceSubmissionId: submission.id,
        })),
        skipDuplicates: true, // accretion: only new identifiers are added
      });

      const existingApp = await tx.application.findUnique({
        where: { positionId_candidateId: { positionId: position.id, candidateId: candidate.id } },
      });
      if (!existingApp) {
        await tx.application.create({
          data: {
            organizationId: position.organizationId,
            positionId: position.id,
            candidateId: candidate.id,
            sourceSubmissionId: submission.id,
          },
        });
      }

      await tx.matchDecision.create({
        data: {
          submissionId: submission.id,
          candidateId: candidate.id,
          outcome: matchedCandidateId ? "auto_linked" : "auto_new",
          score: matchScore,
          featureBreakdown: featureBreakdown as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: position.organizationId,
          actorType: "vendor_user",
          actorId: vendor.vendorUserId,
          event: "submission.created",
          entityType: "submission",
          entityId: submission.id,
          payload: {
            positionId: position.id,
            candidateId: candidate.id,
            outcome: matchedCandidateId ? "auto_linked" : "auto_new",
          },
        },
      });

      return submission;
    });

    void this.notifications.dispatch({
      organizationId: position.organizationId,
      type: "submission.created",
      title: `New candidate: ${input.candidate_name}`,
      text: `Submitted for ${position.title}${matchedCandidateId ? " (matched to an existing candidate — history attached)" : ""}.`,
      payload: { position_id: position.id, submission_id: result.id },
    });
    return { submission: this.toVendorDto(result, position.title), idempotent: false };
  }

  /** Vendor's own submissions for the session's organization, coarse only. */
  async listForVendor(vendorId: string, organizationId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { organizationId, vendorOrg: { vendorId, organizationId } },
      include: { position: { select: { title: true } } },
      orderBy: { receivedAt: "desc" },
    });
    return submissions.map((s) => this.toVendorDto(s, s.position.title));
  }

  /** Org view: everything, scoped by viewable units, vendor names included. */
  async listForOrg(
    organizationId: string,
    viewableUnitIds: "org" | string[],
    positionId?: string,
  ) {
    return this.prisma.submission.findMany({
      where: {
        organizationId,
        ...(positionId ? { positionId } : {}),
        position:
          viewableUnitIds === "org" ? undefined : { orgUnitId: { in: viewableUnitIds } },
      },
      include: {
        position: { select: { id: true, title: true, orgUnit: { select: { name: true } } } },
        vendorOrg: { select: { vendor: { select: { name: true } } } },
        candidate: { select: { id: true, displayName: true } },
        matchDecision: true,
      },
      orderBy: { receivedAt: "desc" },
    });
  }

  /**
   * Blocking + pairwise scoring (docs/04 §2.3–2.4): trigram-similar names in
   * this org (GIN index), scored against name/email-local/employer/title/
   * location. Pairs a human already ruled "kept separate" are excluded.
   */
  private async fuzzyMatch(
    organizationId: string,
    input: VendorSubmissionCreate,
    emailNorm: string,
  ): Promise<{ candidateId: string; score: number; breakdown: MatchFeatureBreakdown } | null> {
    const blocked = await this.prisma.$queryRaw<
      {
        id: string;
        display_name: string;
        current_title: string | null;
        current_employer: string | null;
        location: string | null;
      }[]
    >`
      SELECT id, display_name, current_title, current_employer, location
      FROM candidate
      WHERE organization_id = ${organizationId}::uuid
        AND merged_into_id IS NULL
        AND erased_at IS NULL
        AND similarity(display_name, ${input.candidate_name}) > 0.35
      ORDER BY similarity(display_name, ${input.candidate_name}) DESC
      LIMIT 25`;
    if (blocked.length === 0) return null;

    const ids = blocked.map((b) => b.id);
    const [emails, keptSeparate] = await Promise.all([
      this.prisma.candidateIdentity.findMany({
        where: { candidateId: { in: ids }, kind: "email" },
        select: { candidateId: true, valueNorm: true },
      }),
      this.prisma.matchReviewItem.findMany({
        where: {
          organizationId,
          candidateIdSuggested: { in: ids },
          status: "kept_separate",
        },
        include: { submission: { select: { rawProfile: true } } },
      }),
    ]);
    const emailByCandidate = new Map(emails.map((e) => [e.candidateId, e.valueNorm]));
    // Negative memory: same suggested candidate + same submitter email norm
    const vetoed = new Set(
      keptSeparate
        .filter((k) => {
          const raw = k.submission.rawProfile as { email?: string };
          return raw.email && normalizeEmail(raw.email) === emailNorm;
        })
        .map((k) => k.candidateIdSuggested),
    );

    const subjectLocal = emailNorm.split("@")[0] ?? null;
    let best: { candidateId: string; score: number; breakdown: MatchFeatureBreakdown } | null =
      null;
    for (const c of blocked) {
      if (vetoed.has(c.id)) continue;
      const candEmail = emailByCandidate.get(c.id);
      const { score, breakdown } = scorePair(
        {
          name: input.candidate_name,
          emailLocal: subjectLocal,
          employer: input.current_employer,
          title: input.current_title,
          location: input.location,
        },
        {
          name: c.display_name,
          emailLocal: candEmail ? candEmail.split("@")[0] : null,
          employer: c.current_employer,
          title: c.current_title,
          location: c.location,
        },
      );
      if (!best || score > best.score) best = { candidateId: c.id, score, breakdown };
    }
    return best;
  }

  /** Review-band landing: submission recorded, human decides (docs/04 §3). */
  private async parkForReview(
    position: Position,
    vendorOrg: VendorOrg,
    vendor: VendorIdentity,
    input: VendorSubmissionCreate,
    fuzzy: { candidateId: string; score: number; breakdown: MatchFeatureBreakdown },
  ) {
    const submission = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.submission.create({
        data: {
          organizationId: position.organizationId,
          positionId: position.id,
          vendorOrgId: vendorOrg.id,
          vendorUserId: vendor.vendorUserId,
          rawProfile: input as unknown as Prisma.InputJsonValue,
          status: "pending_review",
          consentConfirmed: input.candidate_consent_confirmed,
          expectedRate: input.expected_rate,
          vendorNotes: input.vendor_notes,
        },
      });
      await tx.matchReviewItem.create({
        data: {
          organizationId: position.organizationId,
          submissionId: sub.id,
          candidateIdSuggested: fuzzy.candidateId,
          score: fuzzy.score,
          featureBreakdown: fuzzy.breakdown as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: position.organizationId,
          actorType: "system",
          event: "match_review.queued",
          entityType: "submission",
          entityId: sub.id,
          payload: { score: fuzzy.score, candidateIdSuggested: fuzzy.candidateId },
        },
      });
      return sub;
    });
    void this.notifications.dispatch({
      organizationId: position.organizationId,
      type: "match_review.queued",
      title: "Identity match needs review",
      text: `${input.candidate_name} (${position.title}) may match an existing candidate — score ${Math.round(fuzzy.score * 100)}%. Decide on the Reviews page.`,
      payload: { submission_id: submission.id, score: fuzzy.score },
    });
    return {
      submission: this.toVendorDto(submission, position.title),
      idempotent: false,
      pending_review: true,
    };
  }

  private toVendorDto(
    s: {
      id: string;
      status: string;
      receivedAt: Date;
      rawProfile: unknown;
    },
    positionTitle: string,
  ) {
    const profile = s.rawProfile as { candidate_name?: string };
    return {
      id: s.id,
      position_title: positionTitle,
      candidate_name: profile.candidate_name ?? "",
      status: coarseStatus(s.status),
      submitted_at: s.receivedAt.toISOString(),
    };
  }
}
