import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DropoutRecord, OfferOutcome, OfferRecord } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Offers and dropout.
 *
 * An offer outlives the decision that produced it: it is extended, then
 * accepted or declined, often days later. Keeping it separate is what lets
 * "time to hire" and "offer accept rate" be measured rather than estimated.
 */
@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Extend (or amend) the offer on an application. */
  async record(
    organizationId: string,
    applicationId: string,
    actorId: string,
    input: OfferRecord,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: { decision: { select: { outcome: true } } },
    });
    if (!app) throw new NotFoundException("Application not found");
    if (app.decision && app.decision.outcome !== "offer") {
      throw new BadRequestException({
        code: "not_an_offer",
        detail: "This application was not decided as an offer.",
      });
    }
    const data = {
      amount: input.amount ?? null,
      currency: input.currency,
      vsRateBand: input.vs_rate_band ?? null,
    };
    return this.prisma.offer.upsert({
      where: { applicationId },
      update: data,
      create: { ...data, organizationId, applicationId, createdById: actorId },
      select: { id: true, amount: true, currency: true, vsRateBand: true },
    });
  }

  /**
   * Close an offer out. A decline also drops the candidate out of the
   * process, so the two are recorded together rather than left to drift.
   */
  async close(organizationId: string, applicationId: string, input: OfferOutcome) {
    const offer = await this.prisma.offer.findFirst({
      where: { applicationId, organizationId },
    });
    if (!offer) throw new NotFoundException("No offer on this application");
    if (offer.acceptedAt || offer.declinedAt) {
      throw new BadRequestException({
        code: "offer_closed",
        detail: "This offer has already been accepted or declined.",
      });
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.offer.update({
        where: { id: offer.id },
        data:
          input.outcome === "accepted"
            ? { acceptedAt: now }
            : { declinedAt: now, declinedReason: input.reason, declinedNote: input.note },
      });
      await tx.application.update({
        where: { id: applicationId },
        data:
          input.outcome === "accepted"
            ? { status: "hired" }
            : {
                dropoutKind: "declined_offer",
                dropoutAtStage: "offer",
                dropoutAt: now,
              },
      });
      return updated;
    });
  }

  /** The candidate left before any offer — withdrew or went quiet. */
  async dropout(
    organizationId: string,
    applicationId: string,
    input: DropoutRecord,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
    });
    if (!app) throw new NotFoundException("Application not found");
    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        dropoutKind: input.kind,
        // Where they left matters: a dropout at offer is a different problem
        // from one at screening.
        dropoutAtStage: app.currentStage,
        dropoutAt: new Date(),
        status: "withdrawn",
      },
      select: { id: true, dropoutKind: true, dropoutAtStage: true, dropoutAt: true },
    });
  }
}
