import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Below this, spread is noise rather than signal — say so instead of ranking. */
const MIN_USES_FOR_SIGNAL = 4;

/**
 * The shared question bank (docs/01 §interviewer).
 *
 * Questions are tagged to SKILLS, not to positions. That is the whole design:
 * a question written for one role surfaces automatically on every other role
 * needing the same competency, so the bank compounds instead of fragmenting
 * into a copy per requisition. It also means suggestions for an interview fall
 * straight out of the position's existing skill matrix — the same rows the
 * scorecard grades on — with no separate mapping to maintain.
 *
 * Any interviewer may author and edit. A review queue nobody drains is how
 * these repositories die; attribution and an archive flag handle the rest.
 */
@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  skills(organizationId: string) {
    return this.prisma.skill.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async list(
    organizationId: string,
    orgUserId: string,
    opts: { skillId?: string; q?: string },
  ) {
    const rows = await this.prisma.interviewQuestion.findMany({
      where: {
        organizationId,
        archivedAt: null,
        ...(opts.skillId ? { skills: { some: { skillId: opts.skillId } } } : {}),
        ...(opts.q
          ? { prompt: { contains: opts.q, mode: "insensitive" as const } }
          : {}),
      },
      include: {
        createdBy: { select: { name: true } },
        skills: { select: { skill: { select: { id: true, name: true } } } },
        usages: { select: { rating: true } },
        votes: { select: { orgUserId: true, value: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => this.shape(r, orgUserId));
  }

  /**
   * Suggestions for one interview: questions covering the competencies this
   * position is actually graded on, grouped so the room can sit them next to
   * the rating they inform.
   */
  async forInterview(organizationId: string, interviewId: string, orgUserId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, organizationId },
      select: {
        panelists: { select: { orgUserId: true } },
        application: {
          select: {
            position: {
              select: {
                skills: {
                  select: {
                    level: true,
                    skill: { select: { id: true, name: true } },
                  },
                  orderBy: { level: "asc" },
                },
              },
            },
          },
        },
      },
    });
    if (!interview) throw new NotFoundException("Interview not found");
    if (!interview.panelists.some((p) => p.orgUserId === orgUserId)) {
      throw new ForbiddenException({
        code: "not_a_panelist",
        detail: "Question suggestions are scoped to that interview's panel",
      });
    }

    const skills = interview.application.position.skills;
    const rows = await this.prisma.interviewQuestion.findMany({
      where: {
        organizationId,
        archivedAt: null,
        skills: { some: { skillId: { in: skills.map((s) => s.skill.id) } } },
      },
      include: {
        createdBy: { select: { name: true } },
        skills: { select: { skill: { select: { id: true, name: true } } } },
        usages: { select: { rating: true } },
        votes: { select: { orgUserId: true, value: true } },
      },
    });
    const shaped = rows.map((r) => this.shape(r, orgUserId));

    return skills.map((ps) => ({
      skill_id: ps.skill.id,
      name: ps.skill.name,
      must_have: ps.level === "must_have",
      questions: shaped
        .filter((q) => q.skills.some((s) => s.id === ps.skill.id))
        // Panel judgement first, then discrimination, then level. Score leads
        // because a question the panel has voted down should sink even if it
        // separates candidates sharply — spread cannot tell you that a
        // question is unfair, exhausting or badly worded, and people can.
        .sort(
          (a, b) =>
            b.score - a.score ||
            (b.discrimination ?? -1) - (a.discrimination ?? -1) ||
            a.level - b.level,
        ),
    }));
  }

  async create(
    organizationId: string,
    createdById: string,
    input: {
      prompt: string;
      rubric: string[];
      follow_ups: string[];
      kind: string;
      level: number;
      skill_ids: string[];
    },
  ) {
    // Only this organization's skills, so a tag can never point across a
    // tenancy boundary even if an id is guessed.
    const skills = await this.prisma.skill.findMany({
      where: { organizationId, id: { in: input.skill_ids } },
      select: { id: true },
    });
    const q = await this.prisma.interviewQuestion.create({
      data: {
        organizationId,
        createdById,
        prompt: input.prompt,
        rubric: input.rubric,
        followUps: input.follow_ups,
        kind: input.kind as never,
        level: input.level,
        skills: { create: skills.map((s) => ({ skillId: s.id })) },
      },
      include: {
        createdBy: { select: { name: true } },
        skills: { select: { skill: { select: { id: true, name: true } } } },
        usages: { select: { rating: true } },
        votes: { select: { orgUserId: true, value: true } },
      },
    });
    return this.shape(q, createdById);
  }

  async update(
    organizationId: string,
    id: string,
    input: Partial<{
      prompt: string;
      rubric: string[];
      follow_ups: string[];
      kind: string;
      level: number;
      skill_ids: string[];
      archived: boolean;
    }>,
  ) {
    const existing = await this.prisma.interviewQuestion.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Question not found");

    if (input.skill_ids) {
      const skills = await this.prisma.skill.findMany({
        where: { organizationId, id: { in: input.skill_ids } },
        select: { id: true },
      });
      await this.prisma.interviewQuestionSkill.deleteMany({ where: { questionId: id } });
      await this.prisma.interviewQuestionSkill.createMany({
        data: skills.map((s) => ({ questionId: id, skillId: s.id })),
      });
    }

    const q = await this.prisma.interviewQuestion.update({
      where: { id },
      data: {
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.rubric !== undefined ? { rubric: input.rubric } : {}),
        ...(input.follow_ups !== undefined ? { followUps: input.follow_ups } : {}),
        ...(input.kind !== undefined ? { kind: input.kind as never } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        // Archive rather than delete: usage rows are evidence about how this
        // organization interviews, and deleting the question would erase the
        // history that makes the rest of the bank interpretable.
        ...(input.archived !== undefined
          ? { archivedAt: input.archived ? new Date() : null }
          : {}),
      },
      include: {
        createdBy: { select: { name: true } },
        skills: { select: { skill: { select: { id: true, name: true } } } },
        usages: { select: { rating: true } },
        votes: { select: { orgUserId: true, value: true } },
      },
    });
    return this.shape(q);
  }

  /**
   * One vote per person, changeable. `0` withdraws it — stored as a deleted
   * row rather than a zero, so "no opinion" and "explicitly neutral" cannot
   * drift apart in the aggregate.
   */
  async vote(organizationId: string, id: string, orgUserId: string, value: number) {
    const q = await this.prisma.interviewQuestion.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException("Question not found");
    if (value === 0) {
      await this.prisma.interviewQuestionVote.deleteMany({
        where: { questionId: id, orgUserId },
      });
    } else {
      const v = value > 0 ? 1 : -1;
      await this.prisma.interviewQuestionVote.upsert({
        where: { questionId_orgUserId: { questionId: id, orgUserId } },
        update: { value: v },
        create: { questionId: id, orgUserId, value: v },
      });
    }
    const votes = await this.prisma.interviewQuestionVote.findMany({
      where: { questionId: id },
      select: { orgUserId: true, value: true },
    });
    return {
      score: votes.reduce((n, x) => n + x.value, 0),
      up: votes.filter((x) => x.value > 0).length,
      down: votes.filter((x) => x.value < 0).length,
      my_vote: votes.find((x) => x.orgUserId === orgUserId)?.value ?? 0,
    };
  }

  /**
   * Record what was asked against the rating that followed. Called at filing
   * time, when both halves are known; before that there is nothing to learn.
   */
  async recordUsage(
    interviewId: string,
    asked: string[],
    ratingBySkill: Record<string, number | null>,
    questionSkills: { questionId: string; skillId: string }[],
  ) {
    // Only the competencies this scorecard actually graded. A question tagged
    // to three skills would otherwise write three rows for one asking, and
    // `times_asked` would report triple — a statistic that overstates itself
    // is worse than none, because people act on it.
    const rows = questionSkills
      .filter(
        (qs) =>
          asked.includes(qs.questionId) &&
          Object.prototype.hasOwnProperty.call(ratingBySkill, qs.skillId),
      )
      .map((qs) => ({
        questionId: qs.questionId,
        interviewId,
        skillId: qs.skillId,
        rating: ratingBySkill[qs.skillId] ?? null,
      }));
    if (rows.length === 0) return;
    // A re-filed scorecard should correct its usage rows, not duplicate them.
    await this.prisma.interviewQuestionUsage.deleteMany({
      where: { interviewId, questionId: { in: asked } },
    });
    await this.prisma.interviewQuestionUsage.createMany({ data: rows, skipDuplicates: true });
  }

  private shape(
    r: {
      id: string;
      prompt: string;
      rubric: string[];
      followUps: string[];
      kind: string;
      level: number;
      createdAt: Date;
      createdBy: { name: string } | null;
      skills: { skill: { id: string; name: string } }[];
      usages: { rating: number | null }[];
      votes?: { orgUserId: string; value: number }[];
    },
    viewerId?: string,
  ) {
    const rated = r.usages.map((u) => u.rating).filter((x): x is number => x !== null);
    // Spread of ratings that followed this question. High spread = it
    // separates people; zero = everyone lands in the same place and the
    // question is costing interview time without buying information.
    const discrimination =
      rated.length >= MIN_USES_FOR_SIGNAL
        ? Number((Math.max(...rated) - Math.min(...rated)).toFixed(1))
        : null;
    const votes = r.votes ?? [];
    return {
      id: r.id,
      prompt: r.prompt,
      rubric: r.rubric,
      follow_ups: r.followUps,
      kind: r.kind,
      level: r.level,
      created_by: r.createdBy?.name ?? null,
      created_at: r.createdAt,
      skills: r.skills.map((s) => s.skill),
      times_asked: r.usages.length,
      /** Human judgement, deliberately separate from what usage shows. */
      score: votes.reduce((n, x) => n + x.value, 0),
      up: votes.filter((x) => x.value > 0).length,
      down: votes.filter((x) => x.value < 0).length,
      my_vote: viewerId ? (votes.find((x) => x.orgUserId === viewerId)?.value ?? 0) : 0,
      discrimination,
      /** Why the number is absent, rather than a bare null on screen. */
      signal_basis:
        rated.length >= MIN_USES_FOR_SIGNAL
          ? `${rated.length} rated answers`
          : `needs ${MIN_USES_FOR_SIGNAL - rated.length} more rated answer${
              MIN_USES_FOR_SIGNAL - rated.length === 1 ? "" : "s"
            }`,
    };
  }
}
