/* eslint-disable no-console */
// Demo seed: one org with a unit hierarchy, three vendors across two tiers,
// and positions demonstrating all three release policies.
// Run: pnpm db:seed  (idempotent — safe to re-run)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const HOUR_MS = 3_600_000;

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      name: "Acme Corp",
      slug: "acme",
      settings: { ownership_scope: "position", ownership_window_days: 180 },
    },
  });

  // --- Hierarchy: Acme → Engineering (vertical) → Platform, Data teams
  //                Acme → GTM (vertical) → Sales Ops team
  async function unit(name: string, kind: "unit" | "team", parentId: string | null) {
    const existing = await prisma.orgUnit.findFirst({
      where: { organizationId: org.id, parentId, name },
    });
    return (
      existing ??
      prisma.orgUnit.create({
        data: { organizationId: org.id, parentId, name, kind },
      })
    );
  }
  const engineering = await unit("Engineering", "unit", null);
  const platform = await unit("Platform", "team", engineering.id);
  const data = await unit("Data", "team", engineering.id);
  const gtm = await unit("GTM", "unit", null);
  const salesOps = await unit("Sales Ops", "team", gtm.id);

  // --- Org users
  async function orgUser(email: string, name: string, role: "org_admin" | "recruiter" | "hiring_manager", orgUnitId: string | null) {
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: { status: "active" },
      create: { organizationId: org.id, email, name, status: "active" },
    });
    // find-or-create: the composite unique includes a nullable column,
    // which Prisma upsert can't target
    const membership = await prisma.orgMembership.findFirst({
      where: { orgUserId: user.id, orgUnitId, role },
    });
    if (!membership) {
      await prisma.orgMembership.create({
        data: { orgUserId: user.id, orgUnitId, role },
      });
    }
    return user;
  }
  const admin = await orgUser("admin@acme.test", "Avery Admin", "org_admin", null);
  await orgUser("recruiter@acme.test", "Riley Recruiter", "recruiter", null);
  await orgUser("hm.eng@acme.test", "Harper Manager", "hiring_manager", engineering.id); // vertical-scoped
  await orgUser("pm.gtm@acme.test", "Parker PM", "project_manager", gtm.id); // vertical-scoped, read-only
  await orgUser("pm.platform@acme.test", "Peyton PM", "project_manager", platform.id); // single-team scope

  // --- Vendors: TalentBridge (tier 1), HireWorks (tier 2), StaffPro (tier 2)
  async function vendor(name: string, tier: number, userEmail: string) {
    let v = await prisma.vendor.findFirst({ where: { name } });
    v ??= await prisma.vendor.create({ data: { name } });
    const vo = await prisma.vendorOrg.upsert({
      where: { vendorId_organizationId: { vendorId: v.id, organizationId: org.id } },
      update: { tier, status: "active" },
      create: { vendorId: v.id, organizationId: org.id, tier, status: "active" },
    });
    await prisma.vendorUser.upsert({
      where: { vendorId_email: { vendorId: v.id, email: userEmail } },
      update: { status: "active" },
      create: { vendorId: v.id, email: userEmail, name: `${name} Recruiter`, role: "vendor_admin", status: "active" },
    });
    return vo;
  }
  const talentBridge = await vendor("TalentBridge", 1, "recruiter@talentbridge.test");
  const hireWorks = await vendor("HireWorks", 2, "recruiter@hireworks.test");
  await vendor("StaffPro", 2, "recruiter@staffpro.test");

  // --- Positions (idempotent: skip if org already has positions)
  const existingPositions = await prisma.position.count({ where: { organizationId: org.id } });
  if (existingPositions === 0) {
    const now = new Date();
    const activeVendorOrgs = await prisma.vendorOrg.findMany({
      where: { organizationId: org.id, status: "active" },
    });

    // 1) All-at-once on Platform team → every vendor sees it now
    const p1 = await prisma.position.create({
      data: {
        organizationId: org.id,
        orgUnitId: platform.id,
        title: "Senior Platform Engineer",
        description: "Kubernetes, Go, internal developer platform.",
        openings: 2,
        status: "open",
        publishedAt: now,
        createdById: admin.id,
        releasePolicy: { create: { mode: "all_at_once", config: {} } },
      },
    });
    await prisma.positionVendorRelease.createMany({
      data: activeVendorOrgs.map((vo) => ({
        positionId: p1.id,
        vendorOrgId: vo.id,
        visibleFrom: now,
        source: "policy" as const,
      })),
    });

    // 2) Tiered on Data team → tier 1 immediately, tier 2 after 7 days
    const p2 = await prisma.position.create({
      data: {
        organizationId: org.id,
        orgUnitId: data.id,
        title: "Data Engineer",
        description: "Spark, Airflow, lakehouse pipelines.",
        status: "open",
        publishedAt: now,
        createdById: admin.id,
        releasePolicy: {
          create: {
            mode: "tiered",
            config: { steps: [{ tier: 1, delay_hours: 0 }, { tier: 2, delay_hours: 168 }] },
          },
        },
      },
    });
    await prisma.positionVendorRelease.createMany({
      data: activeVendorOrgs.map((vo) => ({
        positionId: p2.id,
        vendorOrgId: vo.id,
        visibleFrom: new Date(now.getTime() + (vo.tier === 1 ? 0 : 168 * HOUR_MS)),
        source: "policy" as const,
      })),
    });

    // 3) Manual on Sales Ops → released to TalentBridge only
    const p3 = await prisma.position.create({
      data: {
        organizationId: org.id,
        orgUnitId: salesOps.id,
        title: "Sales Operations Analyst",
        description: "CRM analytics and pipeline reporting.",
        status: "open",
        publishedAt: now,
        createdById: admin.id,
        releasePolicy: { create: { mode: "manual", config: {} } },
      },
    });
    await prisma.positionVendorRelease.create({
      data: {
        positionId: p3.id,
        vendorOrgId: talentBridge.id,
        visibleFrom: now,
        source: "manual",
        releasedById: admin.id,
      },
    });

    console.log(`Seeded positions: ${p1.title}, ${p2.title}, ${p3.title}`);
  }

  console.log(`
Demo accounts (dev header auth — see src/tenancy/dev-auth.guard.ts):
  Org (headers: x-intervu-org: acme, x-intervu-user: <email>)
    admin@acme.test        org_admin (org-wide)
    recruiter@acme.test    recruiter (org-wide)
    hm.eng@acme.test       hiring_manager (Engineering vertical → Platform + Data)
    pm.gtm@acme.test       project_manager (GTM vertical, read-only)
    pm.platform@acme.test  project_manager (Platform team only, read-only)
  Vendors (header: x-intervu-vendor-user: <email>)
    recruiter@talentbridge.test   TalentBridge (tier 1)
    recruiter@hireworks.test      HireWorks (tier 2)
    recruiter@staffpro.test       StaffPro (tier 2)

Expected portal visibility right now:
  TalentBridge → 3 positions (all-at-once, tiered t1, manual release)
  HireWorks/StaffPro → 1 position (all-at-once; tiered unlocks in 7 days)
`);

  void hireWorks; // referenced in docs above
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
