import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AttributeCreate, AttributeUpdate, AttributesReorder } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { bareExtreme } from "./evidence";

const select = {
  id: true,
  name: true,
  description: true,
  behaviours: true,
  sortOrder: true,
  archivedAt: true,
} as const;

/**
 * Ways of working (docs/01 §4, Ways of working): the attributes every scorecard in the
 * organization rates, whatever the role.
 *
 * Archived, never deleted: a rating given against an attribute is part of a
 * filed scorecard, and a debrief six months on must still be able to show it.
 */
@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active set, in display order. What a scorecard form shows. */
  active(organizationId: string) {
    return this.prisma.attribute.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select,
    });
  }

  /** Everything, archived last. What the admin page shows. */
  all(organizationId: string) {
    return this.prisma.attribute.findMany({
      where: { organizationId },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select,
    });
  }

  async create(organizationId: string, actorId: string, input: AttributeCreate) {
    await this.refuseDuplicateName(organizationId, input.name);
    const last = await this.prisma.attribute.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.attribute.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description,
        behaviours: input.behaviours,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select,
    });
    await this.audit(organizationId, actorId, "attribute.created", created.id, { name: input.name });
    return created;
  }

  async update(organizationId: string, actorId: string, id: string, input: AttributeUpdate) {
    const existing = await this.prisma.attribute.findFirst({
      where: { id, organizationId },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!existing) throw new NotFoundException("Attribute not found");
    if (input.name && input.name !== existing.name) {
      await this.refuseDuplicateName(organizationId, input.name);
    }
    const updated = await this.prisma.attribute.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.behaviours !== undefined ? { behaviours: input.behaviours } : {}),
        ...(input.archived === true && !existing.archivedAt ? { archivedAt: new Date() } : {}),
        ...(input.archived === false ? { archivedAt: null } : {}),
      },
      select,
    });
    const event =
      input.archived === true
        ? "attribute.archived"
        : input.archived === false
          ? "attribute.restored"
          : "attribute.updated";
    await this.audit(organizationId, actorId, event, id, input);
    return updated;
  }

  /** Reorder the active set. Partial lists are refused rather than guessed at. */
  async reorder(organizationId: string, actorId: string, input: AttributesReorder) {
    const active = await this.active(organizationId);
    const activeIds = new Set(active.map((a) => a.id));
    const given = new Set(input.ids);
    if (given.size !== input.ids.length || given.size !== activeIds.size || [...given].some((id) => !activeIds.has(id))) {
      throw new BadRequestException({
        code: "reorder_incomplete",
        detail: "Send every active attribute exactly once",
      });
    }
    await this.prisma.$transaction(
      input.ids.map((id, i) => this.prisma.attribute.update({ where: { id }, data: { sortOrder: i } })),
    );
    await this.audit(organizationId, actorId, "attribute.reordered", organizationId, { ids: input.ids });
    return this.active(organizationId);
  }

  /**
   * Checks a scorecard's attribute ratings before they are stored: every id
   * is this organization's, and a 1 or a 5 carries a note. The ends of the
   * scale are the ratings that swing a debrief; a bare number there is an
   * opinion, and the room asks for the evidence while it is still fresh.
   */
  async validateRatings(
    organizationId: string,
    ratings: { attribute_id: string; rating: number | null; note?: string }[],
  ) {
    if (ratings.length === 0) return;
    const ids = [...new Set(ratings.map((r) => r.attribute_id))];
    const known = await this.prisma.attribute.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, name: true },
    });
    if (known.length !== ids.length) {
      throw new BadRequestException({
        code: "unknown_attribute",
        detail: "A rated attribute does not belong to this organization",
      });
    }
    const nameOf = new Map(known.map((k) => [k.id, k.name]));
    const bare = bareExtreme(ratings);
    if (bare) {
      throw new BadRequestException({
        code: "attribute_evidence_required",
        detail: `A ${bare.rating} on ${nameOf.get(bare.attribute_id)} needs a note on what you saw`,
      });
    }
  }

  private async refuseDuplicateName(organizationId: string, name: string) {
    const clash = await this.prisma.attribute.findFirst({
      where: { organizationId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException({
        code: "attribute_exists",
        detail: `There is already an attribute called "${name}"`,
      });
    }
  }

  private audit(organizationId: string, actorId: string, event: string, entityId: string, payload: unknown) {
    return this.prisma.auditLog.create({
      data: {
        organizationId,
        actorType: "org_user",
        actorId,
        event,
        entityType: "attribute",
        entityId,
        payload: payload as object,
      },
    });
  }
}
