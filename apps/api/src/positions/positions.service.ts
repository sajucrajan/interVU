import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Position } from "@prisma/client";
import type { PositionCreate, ReleasePolicy } from "@intervu/contracts";
import { PanelsService } from "../panels/panels.service";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 3_600_000;

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panels: PanelsService,
  ) {}

  async create(
    organizationId: string,
    createdById: string,
    input: PositionCreate,
  ): Promise<Position> {
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id: input.org_unit_id, organizationId },
    });
    if (!unit) throw new NotFoundException("Org unit not found");
    if (unit.kind !== "team") {
      throw new BadRequestException({
        code: "invalid_org_unit",
        detail: "Positions attach to team nodes, not units/verticals",
      });
    }
    const skills = await this.panels.upsertSkills(
      organizationId,
      input.skills.map((s) => s.name),
    );
    const levelByNorm = new Map(input.skills.map((s) => [s.name.trim().toLowerCase(), s.level]));
    return this.prisma.position.create({
      data: {
        organizationId,
        orgUnitId: unit.id,
        title: input.title,
        description: input.description ?? "",
        openings: input.openings ?? 1,
        createdById,
        skills: {
          create: skills.map((s) => ({
            skillId: s.id,
            level: levelByNorm.get(s.nameNorm) ?? "good_to_have",
          })),
        },
      },
    });
  }

  /** Scoped listing: users only receive positions in units they can view. */
  list(organizationId: string, viewableUnitIds: "org" | string[]) {
    return this.prisma.position.findMany({
      where: {
        organizationId,
        ...(viewableUnitIds === "org"
          ? {}
          : { orgUnitId: { in: viewableUnitIds } }),
      },
      include: {
        orgUnit: { select: { id: true, name: true, kind: true } },
        skills: { include: { skill: { select: { name: true } } } },
        releasePolicy: true,
        releases: {
          include: {
            vendorOrg: {
              select: { id: true, tier: true, vendor: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Publish: open the position, persist the release policy, and materialize
   * release rows. Visibility is the DB predicate `now() >= visible_from`
   * (docs/05 §2) — publishing tiered positions needs no scheduler for
   * correctness; a notifier worker (M1) only announces tier unlocks.
   */
  async publish(
    organizationId: string,
    positionId: string,
    actorId: string,
    policy: ReleasePolicy,
  ) {
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, organizationId },
    });
    if (!position) throw new NotFoundException("Position not found");
    if (position.status !== "draft") {
      throw new ConflictException({
        code: "invalid_status",
        detail: `Cannot publish a ${position.status} position`,
      });
    }

    const publishedAt = new Date();
    const vendorOrgs = await this.prisma.vendorOrg.findMany({
      where: { organizationId, status: "active" },
    });

    const releaseRows: { vendorOrgId: string; visibleFrom: Date }[] = [];
    if (policy.mode === "all_at_once") {
      for (const vo of vendorOrgs) {
        releaseRows.push({ vendorOrgId: vo.id, visibleFrom: publishedAt });
      }
    } else if (policy.mode === "tiered") {
      const delayByTier = new Map(
        policy.steps.map((s) => [s.tier, s.delay_hours]),
      );
      for (const vo of vendorOrgs) {
        const delay = delayByTier.get(vo.tier);
        if (delay === undefined) continue; // tiers not in the policy are not released
        releaseRows.push({
          vendorOrgId: vo.id,
          visibleFrom: new Date(publishedAt.getTime() + delay * HOUR_MS),
        });
      }
    }
    // manual: no rows at publish time

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.position.update({
        where: { id: position.id },
        data: { status: "open", publishedAt },
      });
      await tx.releasePolicy.create({
        data: {
          positionId: position.id,
          mode: policy.mode,
          config: policy.mode === "tiered" ? { steps: policy.steps } : {},
        },
      });
      if (releaseRows.length > 0) {
        await tx.positionVendorRelease.createMany({
          data: releaseRows.map((r) => ({
            positionId: position.id,
            vendorOrgId: r.vendorOrgId,
            visibleFrom: r.visibleFrom,
            source: "policy" as const,
            releasedById: actorId,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "position.published",
          entityType: "position",
          entityId: position.id,
          payload: { policy, releases: releaseRows.length },
        },
      });
      return updated;
    });
  }

  /**
   * Manual / early release to a single vendor. Monotonic: only ever creates
   * visibility or moves it earlier — never later (docs/05 §2).
   */
  async releaseToVendor(
    organizationId: string,
    positionId: string,
    vendorOrgId: string,
    actorId: string,
  ) {
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, organizationId },
    });
    if (!position) throw new NotFoundException("Position not found");
    if (position.status !== "open") {
      throw new ConflictException({
        code: "invalid_status",
        detail: "Only open positions can be released",
      });
    }
    const vendorOrg = await this.prisma.vendorOrg.findFirst({
      where: { id: vendorOrgId, organizationId, status: "active" },
    });
    if (!vendorOrg) throw new NotFoundException("Active vendor not found");

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.positionVendorRelease.findUnique({
        where: {
          positionId_vendorOrgId: { positionId, vendorOrgId },
        },
      });
      const release = existing
        ? existing.visibleFrom <= now
          ? existing
          : await tx.positionVendorRelease.update({
              where: { id: existing.id },
              data: { visibleFrom: now, source: "manual", releasedById: actorId },
            })
        : await tx.positionVendorRelease.create({
            data: {
              positionId,
              vendorOrgId,
              visibleFrom: now,
              source: "manual",
              releasedById: actorId,
            },
          });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "position.released_to_vendor",
          entityType: "position",
          entityId: positionId,
          payload: { vendorOrgId, visibleFrom: release.visibleFrom },
        },
      });
      return release;
    });
  }
}
