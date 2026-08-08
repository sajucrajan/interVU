import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const REC_SCORE: Record<string, number> = {
  strong_yes: 4,
  yes: 3,
  no: 2,
  strong_no: 1,
};

/** A spread of 2 or more on one competency is a conversation, not noise. */
const DIVERGENCE_THRESHOLD = 2;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Panel debrief (design option 2a).
 *
 * Everything summarised here — panel mean, divergence, the consensus column —
 * is DERIVED from the scorecards on read. Nothing is stored, so re-opening a
 * scorecard for an addendum cannot leave a stale verdict behind.
 *
 * The hide-until-submitted policy still governs: the matrix stays sealed until
 * every panelist has filed, because seeing a colleague's rating first changes
 * what you write.
 */
@Injectable()
export class DebriefService {
  constructor(private readonly prisma: PrismaService) {}

  async debrief(organizationId: string, applicationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: {
        candidate: { select: { id: true, displayName: true, reference: true } },
        position: {
          select: {
            id: true,
            title: true,
            reference: true,
            skills: {
              select: {
                level: true,
                skill: { select: { id: true, name: true } },
              },
              orderBy: { level: "asc" },
            },
          },
        },
        decision: { select: { outcome: true, reason: true } },
        debrief: { include: { packet: true } },
        interviews: {
          select: {
            id: true,
            roundName: true,
            scheduledAt: true,
            durationMin: true,
            status: true,
            panelists: {
              select: { orgUser: { select: { id: true, name: true } } },
            },
            scorecards: {
              select: {
                id: true,
                overallRating: true,
                recommendation: true,
                notes: true,
                submittedAt: true,
                orgUser: { select: { id: true, name: true } },
                competencies: { select: { skillId: true, rating: true, note: true } },
              },
            },
          },
          orderBy: { scheduledAt: "asc" },
        },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    const scorecards = application.interviews.flatMap((i) =>
      i.scorecards.map((s) => ({ ...s, interview: i })),
    );
    const expected = application.interviews
      .filter((i) => i.status === "completed" || i.scorecards.length > 0)
      .flatMap((i) => i.panelists.map((p) => `${i.id}:${p.orgUser.id}`));
    const filed = scorecards.map((s) => `${s.interview.id}:${s.orgUser.id}`);
    const outstanding = application.interviews.flatMap((i) =>
      i.panelists
        .filter(
          (p) =>
            (i.status === "completed" || i.scorecards.length > 0) &&
            !i.scorecards.some((s) => s.orgUser.id === p.orgUser.id),
        )
        .map((p) => p.orgUser.name),
    );
    const allFiled = expected.length > 0 && filed.length >= expected.length;

    // Panelists become columns, in the order they filed.
    const panelists = scorecards
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
      .map((s) => ({
        id: s.orgUser.id,
        name: s.orgUser.name,
        initials: initials(s.orgUser.name),
      }));

    // Rows follow the POSITION's skill matrix, so the debrief and the job
    // description cannot drift apart.
    const rows = application.position.skills.map((ps) => {
      const cells = scorecards.map((s) => {
        const c = s.competencies.find((x) => x.skillId === ps.skill.id);
        return {
          panelist_id: s.orgUser.id,
          rating: c?.rating ?? null,
          // Captured live in the interview room. This is what turns a
          // diverged row from an argument into a conversation.
          note: c?.note ?? null,
        };
      });
      const given = cells.map((c) => c.rating).filter((r): r is number => r !== null);
      const spread = given.length > 1 ? Math.max(...given) - Math.min(...given) : 0;
      const mean = given.length ? given.reduce((a, b) => a + b, 0) / given.length : null;
      return {
        skill_id: ps.skill.id,
        name: ps.skill.name,
        must_have: ps.level === "must_have",
        cells,
        spread,
        diverged: spread >= DIVERGENCE_THRESHOLD,
        consensus:
          mean === null
            ? "not assessed"
            : spread >= DIVERGENCE_THRESHOLD
              ? `split ${Math.max(...given)}/${Math.min(...given)}`
              : mean >= 4
                ? "strong"
                : mean >= 3
                  ? "adequate"
                  : "below bar",
      };
    });

    const ratings = scorecards.map((s) => s.overallRating);
    const panelMean = ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;
    const recScores = scorecards.map((s) => REC_SCORE[s.recommendation] ?? 0);
    const recSpread = recScores.length > 1 ? Math.max(...recScores) - Math.min(...recScores) : 0;

    // The row worth arguing about: widest spread, must-haves first.
    const worst = [...rows]
      .filter((r) => r.diverged)
      .sort((a, b) => Number(b.must_have) - Number(a.must_have) || b.spread - a.spread)[0];

    return {
      application_id: application.id,
      candidate: application.candidate,
      position: {
        id: application.position.id,
        title: application.position.title,
        reference: application.position.reference,
      },
      /** The matrix stays sealed until everyone has filed (docs/01 §2.3). */
      visible: allFiled,
      filed_count: filed.length,
      expected_count: expected.length,
      outstanding,
      panel_mean: panelMean === null ? null : Number(panelMean.toFixed(1)),
      divergence: recSpread >= 2 || rows.some((r) => r.diverged) ? "high" : "low",
      recommendations: ["strong_yes", "yes", "no", "strong_no"].map((r) => ({
        key: r,
        count: scorecards.filter((s) => s.recommendation === r).length,
      })),
      competencies: allFiled ? rows : [],
      panelists: allFiled ? panelists : [],
      divergence_row: allFiled && worst ? worst : null,
      scorecards: allFiled
        ? scorecards
            // Sorted by recommendation, not by time: you want the dissent
            // adjacent to the praise.
            .sort(
              (a, b) =>
                (REC_SCORE[b.recommendation] ?? 0) - (REC_SCORE[a.recommendation] ?? 0),
            )
            .map((s) => ({
              id: s.id,
              panelist: s.orgUser.name,
              initials: initials(s.orgUser.name),
              round: s.interview.roundName,
              rating: s.overallRating,
              recommendation: s.recommendation,
              notes: s.notes,
              /** Interview end → filed. Pairs with hide-until-submitted. */
              turnaround_hours: Math.max(
                0,
                (s.submittedAt.getTime() -
                  (s.interview.scheduledAt.getTime() +
                    s.interview.durationMin * 60_000)) /
                  3_600_000,
              ),
            }))
        : [],
      decision: application.decision,
      debrief: application.debrief
        ? {
            id: application.debrief.id,
            status: application.debrief.status,
            internal_reason: application.debrief.internalReason,
            released_at: application.debrief.releasedAt,
            packet: application.debrief.packet,
          }
        : null,
    };
  }

  /** Ensure a debrief row exists before the composer writes to it. */
  async ensure(organizationId: string, applicationId: string) {
    const existing = await this.prisma.debrief.findUnique({ where: { applicationId } });
    if (existing) return existing;
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException("Application not found");
    return this.prisma.debrief.create({ data: { organizationId, applicationId } });
  }

  /**
   * Release the packet to the vendor. Deliberately separate from recording the
   * decision, and refused while the summary is still an unreviewed auto-draft.
   */
  async release(organizationId: string, applicationId: string, actorId: string) {
    const debrief = await this.prisma.debrief.findFirst({
      where: { applicationId, organizationId },
      include: { packet: true },
    });
    if (!debrief?.packet) throw new NotFoundException("Nothing to release");
    if (debrief.packet.isDraft) {
      throw new ForbiddenException({
        code: "draft_not_reviewed",
        detail:
          "This summary is still an auto-draft. Edit or confirm it before it leaves the building.",
      });
    }
    return this.prisma.debrief.update({
      where: { id: debrief.id },
      data: { releasedAt: new Date(), releasedById: actorId, status: "resolved" },
      select: { id: true, releasedAt: true, status: true },
    });
  }
}
