import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { scorePair, T_REVIEW } from "@intervu/matching-core";
import { PrismaService } from "../prisma/prisma.service";

const SWEEP_INTERVAL_MS = 24 * 3_600_000;
const STARTUP_DELAY_MS = 60_000;
/** Bounded work per run (docs/04 §4: "bounded batch"). */
const MAX_PAIRS_QUEUED = 25;

/**
 * Nightly re-match sweep (docs/04 §4). Identities accrete over time, so two
 * candidates that looked unrelated last month may now share an employer, a
 * title, or a near-identical email local-part. This re-scores existing
 * candidate pairs and queues newly-crossed ones for human review.
 *
 * Respects every existing decision: merged, erased, already-queued, and
 * human "kept separate" pairs are all skipped, so the queue never nags.
 */
@Injectable()
export class RematchSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RematchSweepService.name);
  private timer?: ReturnType<typeof setInterval>;
  private startup?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    // Delay the first run so boot isn't competing with request traffic.
    this.startup = setTimeout(() => void this.sweep(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startup) clearTimeout(this.startup);
  }

  /** Re-score candidate pairs org by org; returns how many were queued. */
  async sweep(organizationIdFilter?: string): Promise<{ queued: number; compared: number }> {
    if (this.running) return { queued: 0, compared: 0 };
    this.running = true;
    let queued = 0;
    let compared = 0;
    try {
      const orgs = organizationIdFilter
        ? [{ id: organizationIdFilter }]
        : await this.prisma.organization.findMany({ select: { id: true } });

      for (const org of orgs) {
        const candidates = await this.prisma.candidate.findMany({
          where: { organizationId: org.id, mergedIntoId: null, erasedAt: null },
          include: {
            identities: {
              where: { kind: "email" },
              select: { valueNorm: true },
              take: 1,
            },
          },
        });
        if (candidates.length < 2) continue;

        // Pairs a human already judged, or that are already waiting.
        const decided = await this.prisma.matchReviewItem.findMany({
          where: { organizationId: org.id },
          select: { candidateIdSuggested: true, status: true, submissionId: true },
        });
        const suppressed = new Set(decided.map((d) => d.candidateIdSuggested));

        const features = candidates.map((c) => ({
          id: c.id,
          f: {
            name: c.displayName,
            emailLocal: c.identities[0]?.valueNorm.split("@")[0] ?? null,
            employer: c.currentEmployer,
            title: c.currentTitle,
            location: c.location,
          },
        }));

        for (let i = 0; i < features.length && queued < MAX_PAIRS_QUEUED; i++) {
          for (let j = i + 1; j < features.length && queued < MAX_PAIRS_QUEUED; j++) {
            const a = features[i]!;
            const b = features[j]!;
            if (suppressed.has(a.id) || suppressed.has(b.id)) continue;
            compared++;
            const { score, breakdown } = scorePair(a.f, b.f);
            if (score < T_REVIEW) continue;

            // A review item needs a submission as its subject and the *other*
            // candidate as the suggestion. Either side can play subject —
            // whichever has a submission (a merge-created record may have
            // none), preferring the more recent one.
            const subjectB = await this.prisma.submission.findFirst({
              where: { candidateId: b.id, organizationId: org.id },
              orderBy: { receivedAt: "desc" },
            });
            const subject =
              subjectB ??
              (await this.prisma.submission.findFirst({
                where: { candidateId: a.id, organizationId: org.id },
                orderBy: { receivedAt: "desc" },
              }));
            if (!subject) continue;
            const suggestedId = subjectB ? a.id : b.id;
            const already = await this.prisma.matchReviewItem.findFirst({
              where: { submissionId: subject.id, candidateIdSuggested: suggestedId },
            });
            if (already) continue;

            await this.prisma.matchReviewItem.create({
              data: {
                organizationId: org.id,
                submissionId: subject.id,
                candidateIdSuggested: suggestedId,
                score,
                featureBreakdown: {
                  ...breakdown,
                  source: "rematch_sweep",
                } as unknown as Prisma.InputJsonValue,
              },
            });
            suppressed.add(a.id);
            suppressed.add(b.id);
            queued++;
          }
        }
      }
      if (queued > 0) {
        this.logger.log(`re-match sweep queued ${queued} pair(s) from ${compared} comparisons`);
      }
      return { queued, compared };
    } catch (err) {
      this.logger.error(`sweep failed: ${(err as Error).message}`);
      return { queued, compared };
    } finally {
      this.running = false;
    }
  }
}
