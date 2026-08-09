import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QuestionsService } from "../questions/questions.service";
import { requirementFit, sections } from "../applications/requirement-fit";

/**
 * The interview room packet (docs/01 §interviewer).
 *
 * Three docs have promised interviewers a "candidate packet" since M2 and it
 * was never built: they went in with a name, a round name and a blank
 * scorecard. Meanwhile every resume has had its text extracted and stored,
 * and nothing has ever rendered it.
 *
 * What this returns is deliberately NOT the resume reformatted. Preserving
 * source formatting is impossible to do consistently — a PDF arrives as a flat
 * text dump while DOCX keeps its structure — and rendering HTML that came from
 * an uploaded file is an injection surface. Structure beats typography here
 * anyway: what an interviewer needs in the first thirty seconds is which
 * technologies are evidenced, which required ones are NOT, and roughly where
 * this person has worked.
 *
 * Access is by panel membership, not org-unit scope: assignment IS the grant
 * (docs/09 §4.2). The packet deliberately carries no other panelist's ratings,
 * because hide-until-submitted exists to stop exactly that anchoring.
 */
@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
  ) {}

  async packet(organizationId: string, interviewId: string, orgUserId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, organizationId },
      include: {
        panelists: { select: { orgUserId: true, orgUser: { select: { name: true } } } },
        scorecards: { select: { orgUserId: true } },
        application: {
          include: {
            candidate: {
              select: {
                id: true,
                displayName: true,
                reference: true,
                currentTitle: true,
                currentEmployer: true,
                location: true,
              },
            },
            position: {
              select: {
                id: true,
                title: true,
                reference: true,
                seniority: true,
                minTotalYears: true,
                mustHaves: true,
                skills: {
                  select: {
                    level: true,
                    proficiency: true,
                    minYears: true,
                    skill: { select: { id: true, name: true, nameNorm: true } },
                  },
                  orderBy: { level: "asc" },
                },
              },
            },
            interviews: {
              where: { id: { not: interviewId } },
              select: {
                id: true,
                roundName: true,
                scheduledAt: true,
                status: true,
                scorecards: { select: { id: true } },
              },
              orderBy: { scheduledAt: "asc" },
            },
          },
        },
      },
    });
    if (!interview) throw new NotFoundException("Interview not found");

    // Assignment is the grant. A non-panelist gets nothing, even an admin —
    // the packet is candidate PII scoped to the people actually interviewing.
    if (!interview.panelists.some((p) => p.orgUserId === orgUserId)) {
      throw new ForbiddenException({
        code: "not_a_panelist",
        detail: "The interview room is open to that interview's panel only",
      });
    }

    const position = interview.application.position;

    // The resume follows the SUBMISSION, and a direct applicant has none.
    const attachment = interview.application.sourceSubmissionId
      ? await this.prisma.attachment.findFirst({
          where: {
            organizationId,
            ownerType: "submission",
            ownerId: interview.application.sourceSubmissionId,
            kind: "resume",
          },
          select: { filename: true, parsedText: true, s3Key: true },
        })
      : null;

    const text = attachment?.parsedText ?? "";

    const vocabulary = await this.prisma.skill.findMany({
      where: { organizationId },
      select: { id: true, name: true, nameNorm: true },
    });
    // Shared with screening: the same question asked at two moments, so one
    // implementation rather than two that drift.
    const fit = requirementFit(text, position.skills, vocabulary);
    const required = fit.required;
    const gaps = fit.gaps;
    const extra = fit.extra;

    return {
      interview: {
        id: interview.id,
        round_name: interview.roundName,
        scheduled_at: interview.scheduledAt,
        duration_min: interview.durationMin,
        location_or_link: interview.locationOrLink,
        status: interview.status,
      },
      candidate: interview.application.candidate,
      position: {
        id: position.id,
        title: position.title,
        reference: position.reference,
        seniority: position.seniority,
        min_total_years: position.minTotalYears,
        must_haves: position.mustHaves,
      },
      application_id: interview.applicationId,
      /** Who else is in the room. Filing STATE only — never their content. */
      panel: interview.panelists.map((p) => ({
        name: p.orgUser.name,
        filed: interview.scorecards.some((s) => s.orgUserId === p.orgUserId),
        is_me: p.orgUserId === orgUserId,
      })),
      /** Earlier rounds: that they happened, not what was said in them. */
      prior_rounds: interview.application.interviews.map((i) => ({
        round_name: i.roundName,
        scheduled_at: i.scheduledAt,
        status: i.status,
        scorecards_filed: i.scorecards.length,
      })),
      resume: attachment
        ? {
            filename: attachment.filename,
            /** Null where the deployment discards bytes (docs/11). */
            downloadable: attachment.s3Key !== null,
            sections: sections(text),
            word_count: text.split(/\s+/).filter(Boolean).length,
          }
        : null,
      competencies: required,
      /** Bank questions covering exactly the competencies this round grades. */
      question_groups: await this.questions.forInterview(
        organizationId,
        interviewId,
        orgUserId,
      ),
      gaps,
      extra_technologies: extra,
      my_scorecard_filed: interview.scorecards.some((s) => s.orgUserId === orgUserId),
    };
  }

  /** Autosave. Private to its author; never visible to the rest of the panel. */
  async saveDraft(
    organizationId: string,
    interviewId: string,
    orgUserId: string,
    payload: unknown,
  ) {
    const panelist = await this.prisma.interviewPanelist.findFirst({
      where: { interviewId, orgUserId, interview: { organizationId } },
      select: { id: true },
    });
    if (!panelist) {
      throw new ForbiddenException({
        code: "not_a_panelist",
        detail: "Only panel members can take notes for this interview",
      });
    }
    const data = { payload: payload as object };
    const draft = await this.prisma.scorecardDraft.upsert({
      where: { interviewId_orgUserId: { interviewId, orgUserId } },
      update: data,
      create: { organizationId, interviewId, orgUserId, ...data },
      select: { updatedAt: true },
    });
    return { saved_at: draft.updatedAt };
  }

  async draft(interviewId: string, orgUserId: string) {
    const row = await this.prisma.scorecardDraft.findUnique({
      where: { interviewId_orgUserId: { interviewId, orgUserId } },
      select: { payload: true, updatedAt: true },
    });
    return row ?? { payload: {}, updatedAt: null };
  }
}
