import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@intervu/matching-core";
import type { VendorSubmissionCreate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 86_400_000;

@Injectable()
export class MatchReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open items with both sides of the comparison, oldest first (SLA). */
  async list(organizationId: string) {
    const items = await this.prisma.matchReviewItem.findMany({
      where: { organizationId, status: "open" },
      include: {
        submission: {
          include: {
            position: { select: { id: true, title: true } },
            vendorOrg: { select: { vendor: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const candidates = await this.prisma.candidate.findMany({
      where: { id: { in: items.map((i) => i.candidateIdSuggested) } },
      include: {
        identities: { select: { kind: true, valueRaw: true } },
        applications: {
          select: { position: { select: { title: true } }, currentStage: true, status: true },
        },
      },
    });
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return items.map((i) => ({
      id: i.id,
      score: i.score,
      feature_breakdown: i.featureBreakdown,
      created_at: i.createdAt,
      submission: {
        raw_profile: i.submission.rawProfile,
        vendor: i.submission.vendorOrg.vendor.name,
        position: i.submission.position.title,
        received_at: i.submission.receivedAt,
      },
      suggested_candidate: byId.get(i.candidateIdSuggested) ?? null,
    }));
  }

  /**
   * Human resolution (docs/04 §3): `link` joins the submission to the
   * suggested candidate (then ownership rules apply exactly as for a
   * deterministic match); `keep_separate` mints a new candidate and records
   * the pair as a negative example the engine won't re-ask about.
   */
  async resolve(
    organizationId: string,
    itemId: string,
    actorId: string,
    action: "link" | "keep_separate",
  ) {
    const item = await this.prisma.matchReviewItem.findFirst({
      where: { id: itemId, organizationId },
      include: {
        submission: { include: { position: { include: { organization: true } } } },
      },
    });
    if (!item) throw new NotFoundException("Review item not found");
    if (item.status !== "open") throw new ConflictException({ code: "already_resolved" });

    const submission = item.submission;
    const position = submission.position;
    const input = submission.rawProfile as unknown as VendorSubmissionCreate;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Resolve the target candidate
      const candidate =
        action === "link"
          ? await tx.candidate.findUniqueOrThrow({
              where: { id: item.candidateIdSuggested },
            })
          : await tx.candidate.create({
              data: {
                organizationId,
                displayName: input.candidate_name,
                currentTitle: input.current_title,
                currentEmployer: input.current_employer,
                location: input.location,
              },
            });

      // Ownership evaluation — identical rules to the deterministic path
      // (docs/03 §5). Only meaningful for `link`.
      let duplicate = false;
      if (action === "link") {
        const settings = (position.organization.settings ?? {}) as {
          ownership_scope?: "position" | "organization";
          ownership_window_days?: number;
        };
        const scope = settings.ownership_scope ?? "position";
        const windowDays = settings.ownership_window_days ?? 180;
        const owning = await tx.submission.findFirst({
          where: {
            organizationId,
            candidateId: candidate.id,
            receivedAt: { gte: new Date(now.getTime() - windowDays * DAY_MS) },
            status: { notIn: ["rejected", "withdrawn", "duplicate"] },
            ...(scope === "position" ? { positionId: position.id } : {}),
          },
          orderBy: { receivedAt: "asc" },
        });
        duplicate = !!owning && owning.vendorOrgId !== submission.vendorOrgId;
      }

      const updated = await tx.submission.update({
        where: { id: submission.id },
        data: {
          candidateId: candidate.id,
          status: duplicate ? "duplicate" : "accepted",
          ownershipStatus: duplicate ? "duplicate" : "owner",
        },
      });

      if (!duplicate) {
        // Identity accretion + one application per (position, candidate)
        const emailNorm = normalizeEmail(input.email);
        const phone = normalizePhone(input.phone);
        const keys: { kind: "email" | "phone" | "phone_last10"; valueNorm: string }[] = [];
        if (emailNorm) keys.push({ kind: "email", valueNorm: emailNorm });
        if (phone.e164) keys.push({ kind: "phone", valueNorm: phone.e164 });
        if (phone.last10) keys.push({ kind: "phone_last10", valueNorm: phone.last10 });
        await tx.candidateIdentity.createMany({
          data: keys.map((k) => ({
            organizationId,
            candidateId: candidate.id,
            kind: k.kind,
            valueNorm: k.valueNorm,
            valueRaw: k.kind === "email" ? input.email : input.phone,
            sourceSubmissionId: submission.id,
          })),
          skipDuplicates: true,
        });
        const existingApp = await tx.application.findUnique({
          where: {
            positionId_candidateId: { positionId: position.id, candidateId: candidate.id },
          },
        });
        if (!existingApp) {
          await tx.application.create({
            data: {
              organizationId,
              positionId: position.id,
              candidateId: candidate.id,
              sourceSubmissionId: submission.id,
            },
          });
        }
      }

      await tx.matchReviewItem.update({
        where: { id: item.id },
        data: {
          status: action === "link" ? "linked" : "kept_separate",
          resolvedById: actorId,
          resolvedAt: now,
        },
      });
      await tx.matchDecision.create({
        data: {
          submissionId: submission.id,
          candidateId: candidate.id,
          outcome: action === "link" ? "reviewed_linked" : "reviewed_new",
          score: item.score,
          featureBreakdown: item.featureBreakdown as Prisma.InputJsonValue,
          decidedById: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: `match_review.${action === "link" ? "linked" : "kept_separate"}`,
          entityType: "submission",
          entityId: submission.id,
          payload: { reviewItemId: item.id, candidateId: candidate.id, duplicate },
        },
      });

      return { submission: updated, candidate_id: candidate.id, duplicate };
    });
  }
}
