import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PositionTemplateCreate } from "@intervu/contracts";
import { PanelsService } from "../panels/panels.service";
import { PrismaService } from "../prisma/prisma.service";

const TEMPLATE_INCLUDE = {
  orgUnit: { select: { id: true, name: true } },
  skills: { include: { skill: { select: { name: true } } } },
} as const;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panels: PanelsService,
  ) {}

  list(organizationId: string) {
    return this.prisma.positionTemplate.findMany({
      where: { organizationId },
      include: TEMPLATE_INCLUDE,
      orderBy: { name: "asc" },
    });
  }

  async detail(organizationId: string, id: string) {
    const template = await this.prisma.positionTemplate.findFirst({
      where: { id, organizationId },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  /**
   * Create a template, either from supplied fields or captured wholesale from
   * an existing position (`from_position_id`) — "save this role as a template".
   */
  async create(organizationId: string, actorId: string, input: PositionTemplateCreate) {
    let base: {
      title: string;
      description: string;
      seniority: PositionTemplateCreate["seniority"];
      employmentType: string;
      locationPolicy: PositionTemplateCreate["location_policy"];
      locationText: string | null;
      minTotalYears: number | null;
      openings: number;
      rateMin: number | null;
      rateMax: number | null;
      rateCurrency: string;
      ratePeriod: PositionTemplateCreate["rate_period"];
      mustHaves: unknown;
      orgUnitId: string | null;
      skills: { skillId: string; level: string; proficiency: string; minYears: number | null }[];
    };

    if (input.from_position_id) {
      const position = await this.prisma.position.findFirst({
        where: { id: input.from_position_id, organizationId },
        include: { skills: true },
      });
      if (!position) throw new NotFoundException("Position not found");
      base = {
        title: position.title,
        description: position.description,
        seniority: position.seniority,
        employmentType: position.employmentType,
        locationPolicy: position.locationPolicy,
        locationText: position.locationText,
        minTotalYears: position.minTotalYears,
        openings: position.openings,
        rateMin: position.rateMin,
        rateMax: position.rateMax,
        rateCurrency: position.rateCurrency,
        ratePeriod: position.ratePeriod,
        mustHaves: position.mustHaves,
        orgUnitId: position.orgUnitId,
        skills: position.skills.map((s) => ({
          skillId: s.skillId,
          level: s.level,
          proficiency: s.proficiency,
          minYears: s.minYears,
        })),
      };
    } else {
      if (!input.title) {
        throw new BadRequestException({
          code: "title_required",
          detail: "Provide a title, or from_position_id to capture one",
        });
      }
      const resolved = await this.panels.upsertSkills(
        organizationId,
        (input.skills ?? []).map((s) => s.name),
      );
      const specByNorm = new Map(
        (input.skills ?? []).map((s) => [s.name.trim().toLowerCase(), s]),
      );
      base = {
        title: input.title,
        description: input.description ?? "",
        seniority: input.seniority ?? null,
        employmentType: input.employment_type ?? "full_time",
        locationPolicy: input.location_policy ?? null,
        locationText: input.location_text ?? null,
        minTotalYears: input.min_total_years ?? null,
        openings: input.openings ?? 1,
        rateMin: input.rate_min ?? null,
        rateMax: input.rate_max ?? null,
        rateCurrency: input.rate_currency ?? "USD",
        ratePeriod: input.rate_period ?? null,
        mustHaves: input.must_haves ?? [],
        orgUnitId: input.org_unit_id ?? null,
        skills: resolved.map((s) => {
          const spec = specByNorm.get(s.nameNorm);
          return {
            skillId: s.id,
            level: spec?.level ?? "good_to_have",
            proficiency: spec?.proficiency ?? "working",
            minYears: spec?.min_years ?? null,
          };
        }),
      };
    }

    return this.prisma.positionTemplate.create({
      data: {
        organizationId,
        name: input.name,
        summary: input.summary ?? "",
        createdById: actorId,
        title: base.title,
        description: base.description,
        seniority: base.seniority as never,
        employmentType: base.employmentType as never,
        locationPolicy: base.locationPolicy as never,
        locationText: base.locationText,
        minTotalYears: base.minTotalYears,
        openings: base.openings,
        rateMin: base.rateMin,
        rateMax: base.rateMax,
        rateCurrency: base.rateCurrency,
        ratePeriod: base.ratePeriod as never,
        mustHaves: base.mustHaves as Prisma.InputJsonValue,
        orgUnitId: base.orgUnitId,
        skills: {
          create: base.skills.map((s) => ({
            skillId: s.skillId,
            level: s.level as never,
            proficiency: s.proficiency as never,
            minYears: s.minYears,
          })),
        },
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  async remove(organizationId: string, id: string) {
    const deleted = await this.prisma.positionTemplate.deleteMany({
      where: { id, organizationId },
    });
    if (deleted.count === 0) throw new NotFoundException("Template not found");
    return { ok: true };
  }
}
