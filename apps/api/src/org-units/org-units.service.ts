import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrgUnit } from "@prisma/client";
import type { OrgUnitCreate, OrgUnitUpdate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";

export interface OrgUnitNode {
  id: string;
  name: string;
  kind: string;
  children: OrgUnitNode[];
}

export interface OrgUnitNodeWithCounts extends Omit<OrgUnitNode, "children"> {
  positions: number;
  grants: number;
  children: OrgUnitNodeWithCounts[];
}

@Injectable()
export class OrgUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: OrgUnitCreate): Promise<OrgUnit> {
    if (input.parent_id) {
      const parent = await this.prisma.orgUnit.findFirst({
        where: { id: input.parent_id, organizationId },
      });
      if (!parent) throw new NotFoundException("Parent unit not found");
      if (parent.kind !== "unit") {
        throw new BadRequestException({
          code: "invalid_parent",
          detail: "Teams cannot contain child units",
        });
      }
    }
    return this.prisma.orgUnit.create({
      data: {
        organizationId,
        parentId: input.parent_id ?? null,
        name: input.name,
        kind: input.kind,
      },
    });
  }

  /**
   * Rename and/or re-parent a unit.
   *
   * Moving a node moves its whole subtree, and therefore moves everyone's
   * effective entitlements with it (docs/09 §3) — which is why the move is
   * guarded rather than a plain update.
   */
  async update(
    organizationId: string,
    id: string,
    input: OrgUnitUpdate,
  ): Promise<OrgUnit> {
    const unit = await this.prisma.orgUnit.findFirst({ where: { id, organizationId } });
    if (!unit) throw new NotFoundException("Org unit not found");

    const moving = input.parent_id !== undefined;
    const newParentId = input.parent_id ?? null;

    if (moving && newParentId !== unit.parentId) {
      if (newParentId !== null) {
        const parent = await this.prisma.orgUnit.findFirst({
          where: { id: newParentId, organizationId },
        });
        if (!parent) throw new NotFoundException("Parent unit not found");
        if (parent.kind !== "unit") {
          throw new BadRequestException({
            code: "invalid_parent",
            detail: "Teams cannot contain child units",
          });
        }
        // A node cannot become its own ancestor: that would detach the cycle
        // from the tree entirely, orphaning every position beneath it.
        const subtree = await this.descendantIds(organizationId, id);
        if (subtree.includes(newParentId)) {
          throw new BadRequestException({
            code: "cycle",
            detail: "A unit cannot be moved beneath itself.",
          });
        }
      }
    }

    return this.prisma.orgUnit.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(moving ? { parentId: newParentId } : {}),
      },
    });
  }

  /**
   * Delete a unit, but only when nothing depends on it. Reassigning a
   * position's team silently, or dropping people's grants, would be a data
   * change disguised as a structural one — so this refuses and says what is
   * in the way.
   */
  async remove(organizationId: string, id: string): Promise<{ ok: true }> {
    const unit = await this.prisma.orgUnit.findFirst({ where: { id, organizationId } });
    if (!unit) throw new NotFoundException("Org unit not found");

    const [children, positions, memberships, panels, templates] = await Promise.all([
      this.prisma.orgUnit.count({ where: { parentId: id } }),
      this.prisma.position.count({ where: { orgUnitId: id } }),
      this.prisma.orgMembership.count({ where: { orgUnitId: id } }),
      this.prisma.panel.count({ where: { orgUnitId: id } }),
      this.prisma.positionTemplate.count({ where: { orgUnitId: id } }),
    ]);

    const blockers = [
      children && `${children} child unit${children > 1 ? "s" : ""}`,
      positions && `${positions} position${positions > 1 ? "s" : ""}`,
      memberships && `${memberships} access grant${memberships > 1 ? "s" : ""}`,
      panels && `${panels} panel${panels > 1 ? "s" : ""}`,
      templates && `${templates} template${templates > 1 ? "s" : ""}`,
    ].filter(Boolean) as string[];

    if (blockers.length > 0) {
      throw new BadRequestException({
        code: "unit_in_use",
        detail: `Still in use by ${blockers.join(", ")}. Move or remove those first.`,
      });
    }

    await this.prisma.orgUnit.delete({ where: { id } });
    return { ok: true };
  }

  /** Full hierarchy for the org, assembled as a tree. */
  async tree(organizationId: string): Promise<OrgUnitNode[]> {
    const units = await this.prisma.orgUnit.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    const nodes = new Map<string, OrgUnitNode>(
      units.map((u) => [u.id, { id: u.id, name: u.name, kind: u.kind, children: [] }]),
    );
    const roots: OrgUnitNode[] = [];
    for (const u of units) {
      const node = nodes.get(u.id)!;
      const parent = u.parentId ? nodes.get(u.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /**
   * The tree with per-node usage counts, so the admin screen can show what a
   * unit holds before someone tries to delete or move it.
   */
  async manageTree(organizationId: string) {
    const [tree, positions, memberships] = await Promise.all([
      this.tree(organizationId),
      this.prisma.position.groupBy({
        by: ["orgUnitId"],
        where: { organizationId },
        _count: true,
      }),
      this.prisma.orgMembership.groupBy({
        by: ["orgUnitId"],
        where: { orgUser: { organizationId } },
        _count: true,
      }),
    ]);
    const posBy = new Map(positions.map((p) => [p.orgUnitId, p._count]));
    const memBy = new Map(memberships.map((m) => [m.orgUnitId, m._count]));

    const decorate = (nodes: OrgUnitNode[]): OrgUnitNodeWithCounts[] =>
      nodes.map((n) => ({
        ...n,
        positions: posBy.get(n.id) ?? 0,
        grants: memBy.get(n.id) ?? 0,
        children: decorate(n.children),
      }));
    return decorate(tree);
  }

  /**
   * The unit plus all descendants — the scope of a unit-level membership
   * (docs/03-data-model.md §2). Iterative BFS; tree depth is small.
   */
  async descendantIds(organizationId: string, unitId: string): Promise<string[]> {
    const units = await this.prisma.orgUnit.findMany({
      where: { organizationId },
      select: { id: true, parentId: true },
    });
    const childrenOf = new Map<string | null, string[]>();
    for (const u of units) {
      const list = childrenOf.get(u.parentId) ?? [];
      list.push(u.id);
      childrenOf.set(u.parentId, list);
    }
    const out: string[] = [];
    const queue = [unitId];
    while (queue.length) {
      const id = queue.shift()!;
      out.push(id);
      queue.push(...(childrenOf.get(id) ?? []));
    }
    return out;
  }
}
