import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Position, Prisma } from "@prisma/client";
import type { PositionCreate, PositionUpdate, ReleasePolicy } from "@intervu/contracts";
import { ReleaseNotifierService } from "../notifications/release-notifier.service";
import { PanelsService } from "../panels/panels.service";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 3_600_000;

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panels: PanelsService,
    private readonly notifier: ReleaseNotifierService,
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
    const reference = await this.nextReference(organizationId);
    const skills = await this.panels.upsertSkills(
      organizationId,
      input.skills.map((s) => s.name),
    );
    const specByNorm = new Map(
      input.skills.map((s) => [s.name.trim().toLowerCase(), s]),
    );
    return this.prisma.position.create({
      data: {
        organizationId,
        orgUnitId: unit.id,
        reference,
        title: input.title,
        description: input.description ?? "",
        openings: input.openings ?? 1,
        seniority: input.seniority ?? null,
        employmentType: input.employment_type,
        locationPolicy: input.location_policy ?? null,
        locationText: input.location_text ?? null,
        minTotalYears: input.min_total_years ?? null,
        rateMin: input.rate_min ?? null,
        rateMax: input.rate_max ?? null,
        rateCurrency: input.rate_currency,
        ratePeriod: input.rate_period ?? null,
        mustHaves: input.must_haves,
        // Channel is decided when the role is opened. Omitting it keeps the
        // `vendor` default, which is what every position did before.
        ...(input.sourcing_mode ? { sourcingMode: input.sourcing_mode } : {}),
        ...(input.sourcing_mode === "hybrid" && input.vendor_opens_at
          ? { vendorOpensAt: new Date(input.vendor_opens_at) }
          : {}),
        createdById,
        skills: {
          create: skills.map((s) => {
            const spec = specByNorm.get(s.nameNorm);
            return {
              skillId: s.id,
              level: spec?.level ?? "good_to_have",
              proficiency: spec?.proficiency ?? "working",
              minYears: spec?.min_years ?? null,
            };
          }),
        },
      },
    });
  }

  /**
   * Edit a position: JD fields and/or lifecycle status. Pausing hides it from
   * vendor portals without touching submissions already in flight; closing is
   * terminal. Reopening a paused role restores the existing releases, since
   * visibility is evaluated at query time (docs/05 §2).
   */
  async update(
    organizationId: string,
    id: string,
    actorId: string,
    input: PositionUpdate,
  ) {
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId },
    });
    if (!position) throw new NotFoundException("Position not found");

    if (input.status && input.status !== position.status) {
      if (position.status === "draft") {
        throw new ConflictException({
          code: "publish_required",
          detail: "Publish the position to open it — that sets the release policy",
        });
      }
      if (position.status === "closed") {
        throw new ConflictException({
          code: "position_closed",
          detail: "A closed position cannot be reopened; duplicate it instead",
        });
      }
    }

    // Sourcing mode. Vendors gaining visibility is monotonic elsewhere
    // (docs/05 §2) and it stays monotonic here: narrowing a live position to
    // `direct` would revoke visibility from agencies that already have
    // candidates in flight, so it is refused rather than silently applied.
    const nextMode = input.sourcing_mode ?? position.sourcingMode;
    if (
      input.sourcing_mode &&
      input.sourcing_mode !== position.sourcingMode &&
      input.sourcing_mode === "direct" &&
      position.status !== "draft"
    ) {
      const live = await this.prisma.application.count({
        where: {
          positionId: id,
          status: "active",
          sourceChannel: "vendor",
        },
      });
      if (live > 0) {
        throw new ConflictException({
          code: "vendor_candidates_in_flight",
          detail: `${live} vendor-sourced candidate${live === 1 ? " is" : "s are"} still active on this role. Close them out before making it direct-only.`,
        });
      }
    }
    // A stale unlock date must not survive a change of mind.
    const vendorOpensAt =
      nextMode === "hybrid"
        ? input.vendor_opens_at === undefined
          ? undefined
          : input.vendor_opens_at === null
            ? null
            : new Date(input.vendor_opens_at)
        : null;
    if (nextMode !== "hybrid" && input.vendor_opens_at) {
      throw new ConflictException({
        code: "not_hybrid",
        detail: "A vendor unlock date only applies to hybrid sourcing",
      });
    }

    // Replacing the skill matrix is all-or-nothing, so it stays consistent.
    let skillData: { skillId: string; level: string; proficiency: string; minYears: number | null }[] | null =
      null;
    if (input.skills) {
      const resolved = await this.panels.upsertSkills(
        organizationId,
        input.skills.map((s) => s.name),
      );
      const specByNorm = new Map(
        input.skills.map((s) => [s.name.trim().toLowerCase(), s]),
      );
      skillData = resolved.map((s) => {
        const spec = specByNorm.get(s.nameNorm);
        return {
          skillId: s.id,
          level: spec?.level ?? "good_to_have",
          proficiency: spec?.proficiency ?? "working",
          minYears: spec?.min_years ?? null,
        };
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (skillData) {
        await tx.positionSkill.deleteMany({ where: { positionId: id } });
        await tx.positionSkill.createMany({
          data: skillData.map((s) => ({
            positionId: id,
            skillId: s.skillId,
            level: s.level as never,
            proficiency: s.proficiency as never,
            minYears: s.minYears,
          })),
        });
      }
      const result = await tx.position.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.openings !== undefined ? { openings: input.openings } : {}),
          ...(input.seniority !== undefined ? { seniority: input.seniority } : {}),
          ...(input.employment_type !== undefined
            ? { employmentType: input.employment_type }
            : {}),
          ...(input.location_policy !== undefined
            ? { locationPolicy: input.location_policy }
            : {}),
          ...(input.location_text !== undefined
            ? { locationText: input.location_text }
            : {}),
          ...(input.min_total_years !== undefined
            ? { minTotalYears: input.min_total_years }
            : {}),
          ...(input.rate_min !== undefined ? { rateMin: input.rate_min } : {}),
          ...(input.rate_max !== undefined ? { rateMax: input.rate_max } : {}),
          ...(input.rate_currency !== undefined
            ? { rateCurrency: input.rate_currency }
            : {}),
          ...(input.rate_period !== undefined ? { ratePeriod: input.rate_period } : {}),
          ...(input.must_haves !== undefined
            ? { mustHaves: input.must_haves as Prisma.InputJsonValue }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.sourcing_mode !== undefined
            ? { sourcingMode: input.sourcing_mode }
            : {}),
          ...(vendorOpensAt !== undefined ? { vendorOpensAt } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: input.status ? `position.${input.status}` : "position.updated",
          entityType: "position",
          entityId: id,
          payload: { fields: Object.keys(input) },
        },
      });
      return result;
    });
    return updated;
  }

  /**
   * Clone a position into a fresh draft — same JD, new reference, no releases
   * or submissions. The starting point for "another one like this".
   */
  async duplicate(organizationId: string, sourceId: string, createdById: string) {
    const source = await this.prisma.position.findFirst({
      where: { id: sourceId, organizationId },
      include: { skills: true },
    });
    if (!source) throw new NotFoundException("Position not found");

    const reference = await this.nextReference(organizationId);
    return this.prisma.position.create({
      data: {
        organizationId,
        orgUnitId: source.orgUnitId,
        reference,
        title: `${source.title} (copy)`,
        description: source.description,
        openings: source.openings,
        seniority: source.seniority,
        employmentType: source.employmentType,
        locationPolicy: source.locationPolicy,
        locationText: source.locationText,
        minTotalYears: source.minTotalYears,
        rateMin: source.rateMin,
        rateMax: source.rateMax,
        rateCurrency: source.rateCurrency,
        ratePeriod: source.ratePeriod,
        mustHaves: source.mustHaves as Prisma.InputJsonValue,
        createdById,
        // status defaults to draft: a copy is never silently live.
        skills: {
          create: source.skills.map((s) => ({
            skillId: s.skillId,
            level: s.level,
            proficiency: s.proficiency,
            minYears: s.minYears,
          })),
        },
      },
    });
  }

  /**
   * Next human-readable reference for the org (POS-001, POS-002, …).
   * The unique index is the real guard; on a race the caller retries.
   */
  private async nextReference(organizationId: string): Promise<string> {
    const latest = await this.prisma.position.findFirst({
      where: { organizationId },
      orderBy: { reference: "desc" },
      select: { reference: true },
    });
    const n = latest ? Number(latest.reference.replace(/\D/g, "")) || 0 : 0;
    return `POS-${String(n + 1).padStart(3, "0")}`;
  }

  /** Full JD view: role identity, skill matrix, must-haves, release state. */
  async detail(organizationId: string, id: string) {
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId },
      include: {
        orgUnit: { select: { id: true, name: true } },
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
    });
    if (!position) throw new NotFoundException("Position not found");
    return position;
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

    const result = await this.prisma.$transaction(async (tx) => {
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
    // Announce immediately-visible releases now; future tier unlocks are
    // caught by the notifier's interval sweep (docs/05 §5).
    void this.notifier.sweep();
    return result;
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
    const result = await this.prisma.$transaction(async (tx) => {
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
    void this.notifier.sweep();
    return result;
  }
}
