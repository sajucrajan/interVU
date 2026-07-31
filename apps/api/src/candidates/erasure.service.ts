import { createHmac } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * GDPR / DPDP erasure (docs/04 §7). PII is destroyed; the record skeleton
 * survives so ownership disputes and audit trails stay defensible. Erased
 * identifiers become salted HMAC tombstones: a later submission with the same
 * email can be *recognised* as "an erased record existed" without the system
 * retaining — or revealing — the original PII.
 *
 * The salt lives in ERASURE_SALT. Rotating it makes existing tombstones
 * unmatchable (which is a legitimate hard-delete escalation, not a bug).
 */
@Injectable()
export class ErasureService {
  constructor(private readonly prisma: PrismaService) {}

  static hash(valueNorm: string): string {
    const salt = process.env.ERASURE_SALT ?? "intervu-dev-erasure-salt";
    return createHmac("sha256", salt).update(valueNorm).digest("hex");
  }

  /** Does this normalized identifier match a tombstone? (admins only) */
  async tombstoneExists(organizationId: string, valueNorm: string): Promise<boolean> {
    const hit = await this.prisma.candidateIdentity.findFirst({
      where: {
        organizationId,
        kind: "tombstone",
        valueNorm: ErasureService.hash(valueNorm),
      },
      select: { id: true },
    });
    return !!hit;
  }

  /**
   * Erase a candidate: null PII, tombstone identities, redact raw vendor
   * profiles, drop attachments, keep the graph (submissions/applications/
   * decisions) so ownership windows and audit remain provable.
   */
  async erase(organizationId: string, candidateId: string, actorId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
      include: { identities: true, submissions: { select: { id: true } } },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");
    if (candidate.erasedAt) throw new ConflictException({ code: "already_erased" });

    const submissionIds = candidate.submissions.map((s) => s.id);
    const attachments = await this.prisma.attachment.findMany({
      where: { ownerType: "submission", ownerId: { in: submissionIds } },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. Identities → tombstones (kind changes, value becomes an HMAC).
      for (const identity of candidate.identities) {
        if (identity.kind === "tombstone") continue;
        const hashed = ErasureService.hash(identity.valueNorm);
        const clash = await tx.candidateIdentity.findFirst({
          where: { organizationId, kind: "tombstone", valueNorm: hashed },
        });
        if (clash) {
          await tx.candidateIdentity.delete({ where: { id: identity.id } });
        } else {
          await tx.candidateIdentity.update({
            where: { id: identity.id },
            data: { kind: "tombstone", valueNorm: hashed, valueRaw: "[erased]" },
          });
        }
      }

      // 2. Candidate PII.
      await tx.candidate.update({
        where: { id: candidateId },
        data: {
          displayName: "[erased]",
          currentTitle: null,
          currentEmployer: null,
          location: null,
          erasedAt: new Date(),
        },
      });

      // 3. Vendor-submitted raw profiles — the other copy of the PII.
      await tx.submission.updateMany({
        where: { id: { in: submissionIds } },
        data: { rawProfile: { erased: true }, vendorNotes: null },
      });

      // 4. Resume metadata + parsed text.
      await tx.attachment.deleteMany({
        where: { id: { in: attachments.map((a) => a.id) } },
      });

      // 5. Free-text feedback about this person.
      await tx.scorecard.updateMany({
        where: { interview: { application: { candidateId } } },
        data: { notes: "[erased]" },
      });
      await tx.candidateFlag.updateMany({
        where: { candidateId },
        data: { reason: "[erased]" },
      });

      // 6. Audit keeps the event skeleton, never the payload PII.
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "candidate.erasure_completed",
          entityType: "candidate",
          entityId: candidateId,
          payload: {
            identities_tombstoned: candidate.identities.length,
            submissions_redacted: submissionIds.length,
            attachments_deleted: attachments.length,
          },
        },
      });
    });

    return {
      erased: true,
      identities_tombstoned: candidate.identities.length,
      submissions_redacted: submissionIds.length,
      attachments_deleted: attachments.length,
    };
  }
}
