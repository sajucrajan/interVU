import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { DeliveryWorkerService } from "./delivery-worker.service";

/** The notification delivery log: what went out, what's retrying, what died. */
@Controller("notification-deliveries")
@OrgScope()
export class DeliveriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly worker: DeliveryWorkerService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext, @Query("status") status?: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    return this.prisma.notificationDelivery.findMany({
      where: {
        organizationId: tenant.org!.organizationId,
        ...(status === "pending" || status === "delivered" || status === "dead"
          ? { status }
          : {}),
      },
      select: {
        id: true,
        channel: true,
        target: true,
        event: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /** Revive a dead letter (or force an early retry of a pending one). */
  @Post(":id/retry")
  async retry(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const updated = await this.prisma.notificationDelivery.updateMany({
      where: {
        id,
        organizationId: tenant.org!.organizationId,
        status: { in: ["dead", "pending"] },
      },
      data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    if (updated.count === 1) void this.worker.drain();
    return { ok: updated.count === 1 };
  }
}
