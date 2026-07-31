import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Sanitized position view for vendors — no tiers, no internal data. */
export interface VendorPositionDto {
  id: string;
  organization: string;
  title: string;
  description: string;
  openings: number;
  released_at: string;
}

@Injectable()
export class VendorPortalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The visibility predicate (docs/05 §2), evaluated at query time —
   * DB is truth, no scheduler involved:
   *   position open AND now() >= visible_from AND vendor_org active
   */
  async visiblePositions(vendorId: string): Promise<VendorPositionDto[]> {
    const now = new Date();
    const releases = await this.prisma.positionVendorRelease.findMany({
      where: {
        visibleFrom: { lte: now },
        vendorOrg: { vendorId, status: "active" },
        position: { status: "open" },
      },
      include: {
        position: {
          select: {
            id: true,
            title: true,
            description: true,
            openings: true,
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: { visibleFrom: "desc" },
    });
    return releases.map((r) => ({
      id: r.position.id,
      organization: r.position.organization.name,
      title: r.position.title,
      description: r.position.description,
      openings: r.position.openings,
      released_at: r.visibleFrom.toISOString(),
    }));
  }
}
