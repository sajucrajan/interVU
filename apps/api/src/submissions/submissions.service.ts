import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@intervu/matching-core";
import type { VendorSubmissionCreate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";

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
}

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

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
        status: "open",
        releases: {
          some: {
            visibleFrom: { lte: now },
            vendorOrg: { vendorId: vendor.vendorId, status: "active" },
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

    // --- Stage 2: deterministic identity match (docs/04 §2.2)
    const hits = await this.prisma.candidateIdentity.findMany({
      where: {
        organizationId: position.organizationId,
        OR: identityKeys.map((k) => ({ kind: k.kind, valueNorm: k.valueNorm })),
      },
    });
    // Email hit wins if identifiers disagree; the disagreement is recorded for
    // the M3 review queue (docs/04 §2.2 collision guard).
    const candidateIds = [...new Set(hits.map((h) => h.candidateId))];
    const emailHit = hits.find((h) => h.kind === "email");
    const matchedCandidateId = emailHit?.candidateId ?? hits[0]?.candidateId ?? null;
    const identityConflict = candidateIds.length > 1;

    const featureBreakdown = {
      email_hit: !!emailHit,
      phone_hit: hits.some((h) => h.kind === "phone" || h.kind === "phone_last10"),
      identity_conflict: identityConflict,
      distinct_candidates_hit: candidateIds.length,
    };

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
              score: 1,
              featureBreakdown,
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
          score: matchedCandidateId ? 1 : 0,
          featureBreakdown,
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

    return { submission: this.toVendorDto(result, position.title), idempotent: false };
  }

  /** Vendor's own submissions, coarse statuses only. */
  async listForVendor(vendorId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { vendorOrg: { vendorId } },
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
