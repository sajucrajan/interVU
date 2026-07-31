import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PanelCreate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";

export const normSkill = (name: string) => name.trim().toLowerCase();

@Injectable()
export class PanelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find-or-create skills by normalized name; returns them in input order. */
  async upsertSkills(organizationId: string, names: string[]) {
    const wanted = [...new Map(names.map((n) => [normSkill(n), n.trim()])).entries()];
    const existing = await this.prisma.skill.findMany({
      where: { organizationId, nameNorm: { in: wanted.map(([norm]) => norm) } },
    });
    const byNorm = new Map(existing.map((s) => [s.nameNorm, s]));
    for (const [norm, raw] of wanted) {
      if (!byNorm.has(norm)) {
        byNorm.set(
          norm,
          await this.prisma.skill.create({
            data: { organizationId, name: raw, nameNorm: norm },
          }),
        );
      }
    }
    return wanted.map(([norm]) => byNorm.get(norm)!);
  }

  async create(organizationId: string, input: PanelCreate) {
    if (input.org_unit_id) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: input.org_unit_id, organizationId },
      });
      if (!unit) throw new NotFoundException("Org unit not found");
    }
    const members = await this.prisma.orgUser.findMany({
      where: { id: { in: input.member_ids }, organizationId, status: "active" },
      select: { id: true },
    });
    if (members.length !== input.member_ids.length) {
      throw new BadRequestException({ code: "invalid_members" });
    }
    const skills = await this.upsertSkills(organizationId, input.skills);
    return this.prisma.panel.create({
      data: {
        organizationId,
        orgUnitId: input.org_unit_id ?? null,
        name: input.name,
        description: input.description,
        skills: { create: skills.map((s) => ({ skillId: s.id })) },
        members: { create: input.member_ids.map((id) => ({ orgUserId: id })) },
      },
      include: this.panelInclude,
    });
  }

  listSkills(organizationId: string) {
    return this.prisma.skill.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  list(organizationId: string) {
    return this.prisma.panel.findMany({
      where: { organizationId },
      include: this.panelInclude,
      orderBy: { name: "asc" },
    });
  }

  private readonly panelInclude = {
    orgUnit: { select: { id: true, name: true, kind: true } },
    skills: { include: { skill: { select: { name: true, nameNorm: true } } } },
    members: { include: { orgUser: { select: { id: true, name: true, email: true } } } },
  } as const;

  /**
   * Ranked panelist suggestions for an application's position:
   * eligible panels = org-wide OR scoped to an ancestor-or-self unit of the
   * position's team (the org-unit inheritance pattern, docs/09 §3).
   * Member score = Σ matched skills (must_have = 2, good_to_have = 1),
   * skills unioned across all of a member's eligible panels.
   */
  async suggestions(organizationId: string, applicationId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: {
        position: { include: { skills: { include: { skill: true } } } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    const units = await this.prisma.orgUnit.findMany({
      where: { organizationId },
      select: { id: true, parentId: true },
    });
    const parentOf = new Map(units.map((u) => [u.id, u.parentId]));
    const ancestors = new Set<string>();
    let cur: string | null = application.position.orgUnitId;
    while (cur) {
      ancestors.add(cur);
      cur = parentOf.get(cur) ?? null;
    }

    const panels = await this.prisma.panel.findMany({
      where: {
        organizationId,
        OR: [{ orgUnitId: null }, { orgUnitId: { in: [...ancestors] } }],
      },
      include: this.panelInclude,
    });

    const wanted = new Map(
      application.position.skills.map((ps) => [ps.skill.nameNorm, { name: ps.skill.name, level: ps.level }]),
    );

    interface Suggestion {
      org_user: { id: string; name: string; email: string };
      panels: string[];
      matched_skills: { name: string; level: string }[];
      score: number;
    }
    const byUser = new Map<string, Suggestion & { matchedNorms: Set<string> }>();

    for (const panel of panels) {
      const panelMatches = panel.skills
        .map((ps) => ps.skill.nameNorm)
        .filter((norm) => wanted.has(norm));
      if (panelMatches.length === 0) continue;
      for (const m of panel.members) {
        const entry =
          byUser.get(m.orgUser.id) ??
          {
            org_user: m.orgUser,
            panels: [],
            matched_skills: [],
            score: 0,
            matchedNorms: new Set<string>(),
          };
        if (!entry.panels.includes(panel.name)) entry.panels.push(panel.name);
        for (const norm of panelMatches) entry.matchedNorms.add(norm);
        byUser.set(m.orgUser.id, entry);
      }
    }

    const out = [...byUser.values()].map((e) => {
      e.matched_skills = [...e.matchedNorms].map((n) => wanted.get(n)!);
      e.score = e.matched_skills.reduce(
        (n, s) => n + (s.level === "must_have" ? 2 : 1),
        0,
      );
      const { matchedNorms: _unused, ...rest } = e;
      return rest;
    });
    out.sort((a, b) => b.score - a.score);

    return {
      position_skills: [...wanted.values()],
      suggestions: out,
    };
  }
}
