import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Sanitized position view for vendors — no tiers, no internal data.
 *  The JD fields (seniority, type, location, rate band, skill matrix,
 *  must-haves) ARE vendor-facing: vendors source against them. */
export interface VendorPositionDto {
  id: string;
  /** The reference vendors quote back in email threads (POS-001). */
  reference: string;
  organization: string;
  title: string;
  description: string;
  openings: number;
  seniority: string | null;
  employment_type: string;
  location_policy: string | null;
  location_text: string | null;
  min_total_years: number | null;
  rate_band: string | null;
  must_haves: string[];
  skills: { name: string; level: string; proficiency: string; min_years: number | null }[];
  released_at: string;
}

@Injectable()
export class VendorPortalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The visibility predicate (docs/05 §2), evaluated at query time —
   * DB is truth, no scheduler involved:
   *   position open AND now() >= visible_from AND vendor_org active
   * Scoped to the session's organization: a vendor serving several orgs
   * never sees two orgs' positions in one session.
   */
  async visiblePositions(
    vendorId: string,
    organizationId: string,
  ): Promise<VendorPositionDto[]> {
    const now = new Date();
    const releases = await this.prisma.positionVendorRelease.findMany({
      where: {
        visibleFrom: { lte: now },
        vendorOrg: { vendorId, organizationId, status: "active" },
        position: {
          status: "open",
          organizationId,
          // A direct-only role is never listed to a vendor, and a hybrid one
          // only once its vendor window has opened.
          sourcingMode: { in: ["vendor", "hybrid"] },
          OR: [
            { sourcingMode: "vendor" },
            { vendorOpensAt: null },
            { vendorOpensAt: { lte: new Date() } },
          ],
        },
      },
      include: {
        position: {
          include: {
            organization: { select: { name: true } },
            skills: { include: { skill: { select: { name: true } } } },
          },
        },
      },
      orderBy: { visibleFrom: "desc" },
    });
    return releases.map((r) => ({
      id: r.position.id,
      reference: r.position.reference,
      organization: r.position.organization.name,
      title: r.position.title,
      description: r.position.description,
      openings: r.position.openings,
      seniority: r.position.seniority,
      employment_type: r.position.employmentType,
      location_policy: r.position.locationPolicy,
      location_text: r.position.locationText,
      min_total_years: r.position.minTotalYears,
      rate_band:
        r.position.rateMin != null && r.position.rateMax != null
          ? `${r.position.rateCurrency} ${r.position.rateMin}–${r.position.rateMax}${r.position.ratePeriod ? ` / ${r.position.ratePeriod}` : ""}`
          : null,
      must_haves: (r.position.mustHaves as string[]) ?? [],
      skills: r.position.skills.map((s) => ({
        name: s.skill.name,
        level: s.level,
        proficiency: s.proficiency,
        min_years: s.minYears,
      })),
      released_at: r.visibleFrom.toISOString(),
    }));
  }
}
