import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { VendorCreate, VendorUpdate, VendorUserCreate } from "@intervu/contracts";
import type { VendorRole, VendorStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InvitesService, type Invite } from "../invites/invites.service";

/**
 * Contract administration for the org↔vendor relationship.
 *
 * `Vendor` holds the agency's identity and `VendorOrg` the contract terms —
 * tier, status, dates. A deployment serves one organization, so the two are
 * 1:1 in practice; queries stay keyed on the contract because that is what
 * submissions and releases reference.
 */
@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
  ) {}

  /** Contracts with their people and submission volume. */
  async list(organizationId: string) {
    const contracts = await this.prisma.vendorOrg.findMany({
      where: { organizationId },
      select: {
        id: true,
        tier: true,
        status: true,
        contractStart: true,
        contractEnd: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            name: true,
            vendorUsers: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                passwordHash: true,
              },
              orderBy: { name: "asc" },
            },
          },
        },
        _count: { select: { submissions: true, releases: true } },
      },
      orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
    });

    return contracts.map((c) => ({
      id: c.id,
      vendor_id: c.vendor.id,
      name: c.vendor.name,
      tier: c.tier,
      status: c.status,
      contract_start: c.contractStart,
      contract_end: c.contractEnd,
      submissions: c._count.submissions,
      releases: c._count.releases,
      users: c.vendor.vendorUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        pending_activation: u.passwordHash === null,
      })),
    }));
  }

  /**
   * Add a vendor. A deployment serves ONE organization (docs/02 §1), so a
   * vendor belongs to this organization and nothing else — an agency of the
   * same name is never silently reused, because there is no other tenant it
   * could have come from.
   */
  async create(organizationId: string, input: VendorCreate) {
    const name = input.name.trim();

    const clash = await this.prisma.vendorOrg.findFirst({
      where: { organizationId, vendor: { name } },
    });
    if (clash) {
      throw new ConflictException({
        code: "contract_exists",
        detail: `${name} is already a vendor here.`,
      });
    }

    this.assertDateOrder(input.contract_start, input.contract_end);

    const vendor = await this.prisma.vendor.create({ data: { name } });
    return this.prisma.vendorOrg.create({
      data: {
        vendorId: vendor.id,
        organizationId,
        tier: input.tier,
        status: input.status as VendorStatus,
        contractStart: input.contract_start ?? null,
        contractEnd: input.contract_end ?? null,
      },
      select: { id: true, tier: true, status: true },
    });
  }

  async update(organizationId: string, contractId: string, input: VendorUpdate) {
    const contract = await this.prisma.vendorOrg.findFirst({
      where: { id: contractId, organizationId },
    });
    if (!contract) throw new NotFoundException("Vendor contract not found");

    const start =
      input.contract_start !== undefined ? input.contract_start : contract.contractStart;
    const end =
      input.contract_end !== undefined ? input.contract_end : contract.contractEnd;
    this.assertDateOrder(start, end);

    return this.prisma.vendorOrg.update({
      where: { id: contractId },
      data: {
        ...(input.tier !== undefined ? { tier: input.tier } : {}),
        ...(input.status !== undefined ? { status: input.status as VendorStatus } : {}),
        ...(input.contract_start !== undefined
          ? { contractStart: input.contract_start ?? null }
          : {}),
        ...(input.contract_end !== undefined
          ? { contractEnd: input.contract_end ?? null }
          : {}),
      },
      select: { id: true, tier: true, status: true },
    });
  }

  /**
   * Invite a person at the vendor. Their credential namespace is
   * (vendor, email), and they will sign in per client organization — so the
   * invitation is issued against the organization whose admin sent it.
   */
  async inviteUser(
    organizationId: string,
    contractId: string,
    input: VendorUserCreate,
  ): Promise<{ id: string; email: string; name: string; invite: Invite }> {
    const contract = await this.prisma.vendorOrg.findFirst({
      where: { id: contractId, organizationId },
      select: { vendorId: true, status: true },
    });
    if (!contract) throw new NotFoundException("Vendor contract not found");
    if (contract.status === "terminated" || contract.status === "suspended") {
      throw new BadRequestException({
        code: "contract_inactive",
        detail: "Reactivate the contract before inviting people to it.",
      });
    }

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.vendorUser.findUnique({
      where: { vendorId_email: { vendorId: contract.vendorId, email } },
    });
    if (existing) {
      throw new ConflictException({
        code: "user_exists",
        detail: `${email} already has an account with this vendor.`,
      });
    }

    const user = await this.prisma.vendorUser.create({
      data: {
        vendorId: contract.vendorId,
        email,
        name: input.name.trim(),
        role: input.role as VendorRole,
        status: "invited",
      },
    });
    const invite = await this.invites.issue({
      organizationId,
      vendorUserId: user.id,
      email: user.email,
      name: user.name,
    });
    return { id: user.id, email: user.email, name: user.name, invite };
  }

  /** Enable, disable, or re-invite a vendor user on this contract. */
  async setUserStatus(
    organizationId: string,
    contractId: string,
    userId: string,
    status: "active" | "disabled",
  ) {
    const user = await this.findContractUser(organizationId, contractId, userId);
    return this.prisma.vendorUser.update({
      where: { id: user.id },
      data: { status },
      select: { id: true, status: true },
    });
  }

  async reinviteUser(
    organizationId: string,
    contractId: string,
    userId: string,
  ): Promise<Invite> {
    const user = await this.findContractUser(organizationId, contractId, userId);
    return this.invites.issue({
      organizationId,
      vendorUserId: user.id,
      email: user.email,
      name: user.name,
    });
  }

  /**
   * Resolve a vendor user through the contract, so one organization's admin
   * can never touch a user of a vendor they have no contract with.
   */
  private async findContractUser(
    organizationId: string,
    contractId: string,
    userId: string,
  ) {
    const contract = await this.prisma.vendorOrg.findFirst({
      where: { id: contractId, organizationId },
      select: { vendorId: true },
    });
    if (!contract) throw new NotFoundException("Vendor contract not found");
    const user = await this.prisma.vendorUser.findFirst({
      where: { id: userId, vendorId: contract.vendorId },
    });
    if (!user) throw new NotFoundException("Vendor user not found");
    return user;
  }

  private assertDateOrder(start?: Date | null, end?: Date | null): void {
    if (start && end && end < start) {
      throw new BadRequestException({
        code: "invalid_contract_dates",
        detail: "The contract end date is before its start date.",
      });
    }
  }
}
