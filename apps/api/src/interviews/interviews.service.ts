import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { InterviewCreate, ScorecardCreate } from "@intervu/contracts";
import type { Access } from "../entitlements/access";
import { ApplicationsService } from "../applications/applications.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
  ) {}

  async schedule(
    organizationId: string,
    applicationId: string,
    access: Access,
    actorId: string,
    input: InterviewCreate,
  ) {
    const application = await this.applications.requireOnUnit(
      organizationId,
      applicationId,
      access,
      "interviews.schedule",
    );
    const panelists = await this.prisma.orgUser.findMany({
      where: { id: { in: input.panelist_ids }, organizationId, status: "active" },
      select: { id: true },
    });
    if (panelists.length !== input.panelist_ids.length) {
      throw new BadRequestException({
        code: "invalid_panelists",
        detail: "All panelists must be active users of this organization",
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          organizationId,
          applicationId: application.id,
          roundName: input.round_name,
          scheduledAt: new Date(input.scheduled_at),
          durationMin: input.duration_min,
          locationOrLink: input.location_or_link,
          createdById: actorId,
          panelists: {
            create: input.panelist_ids.map((id) => ({ orgUserId: id })),
          },
        },
        include: { panelists: { include: { orgUser: { select: { name: true } } } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "interview.scheduled",
          entityType: "interview",
          entityId: interview.id,
          payload: { applicationId: application.id, round: input.round_name },
        },
      });
      return interview;
    });
  }

  /** The interviewer home screen: interviews I'm on the panel of. */
  async mine(organizationId: string, orgUserId: string) {
    const interviews = await this.prisma.interview.findMany({
      where: { organizationId, panelists: { some: { orgUserId } } },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, displayName: true } },
            position: {
              select: {
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
          },
        },
        panelists: { select: { orgUserId: true } },
        // Every panelist's filing STATE, never their content: the
        // hide-until-submitted policy (docs/01 §2.3) is about not seeing a
        // colleague's rating before you write your own. Knowing you are the
        // last one outstanding reveals nothing and is the useful nudge.
        scorecards: { select: { orgUserId: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });
    const now = Date.now();
    return interviews.map((i) => {
      const endsAt = new Date(i.scheduledAt.getTime() + i.durationMin * 60_000);
      const mine = i.scorecards.some((s) => s.orgUserId === orgUserId);
      return {
        id: i.id,
        round_name: i.roundName,
        scheduled_at: i.scheduledAt,
        ends_at: endsAt,
        duration_min: i.durationMin,
        location_or_link: i.locationOrLink,
        status: i.status,
        candidate: i.application.candidate,
        position_title: i.application.position.title,
        position_reference: i.application.position.reference,
        application_id: i.applicationId,
        my_scorecard_submitted: mine,
        /**
         * The rows the debrief matrix is built from. Sending the POSITION's
         * skill matrix means the scorecard and the job description cannot
         * drift apart, and it is why a real interview now produces the same
         * per-competency data the seed does.
         */
        competencies: i.application.position.skills.map((ps) => ({
          skill_id: ps.skill.id,
          name: ps.skill.name,
          must_have: ps.level === "must_have",
        })),
        panel_size: i.panelists.length,
        panel_filed: i.scorecards.length,
        /** Interview end → now. The turnaround the debrief later reports. */
        hours_since_end: mine
          ? null
          : Math.max(0, (now - endsAt.getTime()) / 3_600_000),
      };
    });
  }

  /**
   * Panel membership IS the grant (docs/09 §4.2) — no tree scope required.
   */
  async submitScorecard(
    organizationId: string,
    interviewId: string,
    orgUserId: string,
    input: ScorecardCreate,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, organizationId },
      include: { panelists: true },
    });
    if (!interview) throw new NotFoundException("Interview not found");
    if (!interview.panelists.some((p) => p.orgUserId === orgUserId)) {
      throw new ForbiddenException({
        code: "not_a_panelist",
        detail: "Only panel members can submit a scorecard for this interview",
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const scorecard = await tx.scorecard.upsert({
        where: { interviewId_orgUserId: { interviewId, orgUserId } },
        update: {
          overallRating: input.overall_rating,
          recommendation: input.recommendation,
          notes: input.notes,
        },
        create: {
          organizationId,
          interviewId,
          orgUserId,
          overallRating: input.overall_rating,
          recommendation: input.recommendation,
          notes: input.notes,
        },
      });
      // Replace the competency ratings wholesale: an edited scorecard should
      // not leave last version's rows behind.
      if (input.competencies.length > 0) {
        await tx.scorecardCompetency.deleteMany({
          where: { scorecardId: scorecard.id },
        });
        await tx.scorecardCompetency.createMany({
          data: input.competencies.map((c) => ({
            scorecardId: scorecard.id,
            skillId: c.skill_id,
            rating: c.rating,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId: orgUserId,
          event: "scorecard.submitted",
          entityType: "interview",
          entityId: interviewId,
          payload: { recommendation: input.recommendation },
        },
      });
      return scorecard;
    });
  }

  /**
   * Feedback-visibility policy (docs/01 §2.3): with
   * feedback_visibility = "hidden_until_submitted" (the default), a panelist
   * on this application who hasn't submitted their own scorecard sees only
   * their own (i.e., none). Non-panelist viewers with history access, and
   * panelists who have submitted, see everything.
   */
  async scorecardsForApplication(
    organizationId: string,
    applicationId: string,
    viewerId: string,
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: { position: { select: { organization: { select: { settings: true } } } } },
    });
    if (!application) throw new NotFoundException("Application not found");

    const scorecards = await this.prisma.scorecard.findMany({
      where: { interview: { applicationId } },
      include: {
        orgUser: { select: { id: true, name: true } },
        interview: { select: { id: true, roundName: true } },
      },
      orderBy: { submittedAt: "asc" },
    });

    const settings = (application.position.organization.settings ?? {}) as {
      feedback_visibility?: "open" | "hidden_until_submitted";
    };
    const policy = settings.feedback_visibility ?? "hidden_until_submitted";
    if (policy === "open") return scorecards;

    const isPanelist = await this.prisma.interviewPanelist.findFirst({
      where: { orgUserId: viewerId, interview: { applicationId } },
    });
    if (!isPanelist) return scorecards;

    const hasSubmitted = scorecards.some((s) => s.orgUser.id === viewerId);
    return hasSubmitted ? scorecards : scorecards.filter((s) => s.orgUser.id === viewerId);
  }
}
