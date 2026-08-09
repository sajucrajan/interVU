import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { panelOwned } from "./panel-owned";
import { requirementFit, sections } from "./requirement-fit";

/**
 * Screening: is this person worth an interview slot, for THIS role?
 *
 * The queue has said "19 new submissions to screen" since M2 and linked
 * straight to the board, which shows a name and a stage. Everything a screener
 * actually needs — the role's requirements, whether the CV evidences them,
 * what the candidate has done before — was either absent or on a screen they
 * had no reason to open.
 *
 * Deliberately position-first. The candidate dossier answers "who is this
 * person, across everything we know"; screening answers "does this person fit
 * this role", and the same candidate can be an obvious yes for one and an
 * obvious no for the next.
 */
@Injectable()
export class ScreeningService {
  constructor(private readonly prisma: PrismaService) {}

  async screen(organizationId: string, applicationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
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
        interviews: { select: { id: true } },
        decision: { select: { outcome: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    const attachment = application.sourceSubmissionId
      ? await this.prisma.attachment.findFirst({
          where: {
            organizationId,
            ownerType: "submission",
            ownerId: application.sourceSubmissionId,
            kind: "resume",
          },
          select: { filename: true, parsedText: true },
        })
      : null;
    const text = attachment?.parsedText ?? "";

    const vocabulary = await this.prisma.skill.findMany({
      where: { organizationId },
      select: { id: true, name: true, nameNorm: true },
    });
    const fit = requirementFit(text, application.position.skills, vocabulary);

    // Everywhere else this candidate has been considered. A strong signal at
    // screening — someone rejected for one role last month may be exactly
    // right for this one, and someone rejected three times probably is not.
    const history = await this.prisma.application.findMany({
      where: {
        organizationId,
        candidateId: application.candidateId,
        id: { not: applicationId },
      },
      select: {
        id: true,
        currentStage: true,
        status: true,
        createdAt: true,
        position: { select: { title: true, reference: true } },
        decision: { select: { outcome: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      application_id: application.id,
      stage: application.currentStage,
      status: application.status,
      /**
       * Once a panel owns this, it is no longer a screening call — so the
       * screen hides the reject button and points at the debrief instead.
       * Same rule the decision endpoint enforces, so the page never offers
       * an action the API will refuse.
       */
      interviewed: panelOwned(application.currentStage, application.interviews.length),
      already_decided: application.decision?.outcome ?? null,
      candidate: application.candidate,
      position: {
        id: application.position.id,
        title: application.position.title,
        reference: application.position.reference,
        seniority: application.position.seniority,
        min_total_years: application.position.minTotalYears,
        /** Non-skill screening requirements: certifications, visa, languages. */
        must_haves: application.position.mustHaves,
      },
      requirements: fit.required,
      gaps: fit.gaps,
      extra_technologies: fit.extra,
      coverage: fit.coverage,
      resume: attachment
        ? {
            filename: attachment.filename,
            sections: sections(text),
            word_count: text.split(/\s+/).filter(Boolean).length,
          }
        : null,
      history,
    };
  }
}
