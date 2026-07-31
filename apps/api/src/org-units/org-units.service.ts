import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrgUnit } from "@prisma/client";
import type { OrgUnitCreate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";

export interface OrgUnitNode {
  id: string;
  name: string;
  kind: string;
  children: OrgUnitNode[];
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
