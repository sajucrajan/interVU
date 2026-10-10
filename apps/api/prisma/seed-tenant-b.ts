/* eslint-disable no-console */
// A second, minimal organization — "Globex" — for the cross-tenant checks in
// tools/access-check.mjs. Not part of the public demo seed: the demo is one
// organization, and a second one there would only be a login-page puzzle.
//
// Run after the main seed: pnpm --filter @intervu/api db:seed:tenant-b
// Idempotent, like the main seed.

import { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLES } from "../src/entitlements/permissions";
import { hashPassword } from "../src/auth/password";

const prisma = new PrismaClient();
const passwordHash = hashPassword("intervu-demo");

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "globex" },
    update: {},
    create: { name: "Globex", slug: "globex", settings: {} },
  });

  const unit =
    (await prisma.orgUnit.findFirst({ where: { organizationId: org.id, name: "Research" } })) ??
    (await prisma.orgUnit.create({
      data: { organizationId: org.id, parentId: null, name: "Research", kind: "unit" },
    }));

  const adminRole = SYSTEM_ROLES.find((r) => r.key === "org_admin")!;
  const role = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: adminRole.key } },
    update: {},
    create: {
      organizationId: org.id,
      key: adminRole.key,
      name: adminRole.name,
      description: adminRole.description,
      permissions: [...adminRole.permissions],
      isSystem: true,
    },
  });

  const admin = await prisma.orgUser.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "admin@globex.test" } },
    update: { status: "active", passwordHash },
    create: {
      organizationId: org.id,
      email: "admin@globex.test",
      name: "Gale Globex",
      status: "active",
      passwordHash,
    },
  });
  if (!(await prisma.orgMembership.findFirst({ where: { orgUserId: admin.id, roleId: role.id } }))) {
    await prisma.orgMembership.create({
      data: { orgUserId: admin.id, orgUnitId: null, roleId: role.id },
    });
  }

  const position = await prisma.position.upsert({
    where: { organizationId_reference: { organizationId: org.id, reference: "GLX-001" } },
    update: {},
    create: {
      organizationId: org.id,
      orgUnitId: unit.id,
      reference: "GLX-001",
      title: "Research Scientist",
      status: "open",
      createdById: admin.id,
    },
  });

  // An agency that supplies Globex only, with the position released to it.
  const vendor =
    (await prisma.vendor.findFirst({ where: { name: "Globex Staffing" } })) ??
    (await prisma.vendor.create({ data: { name: "Globex Staffing" } }));
  const vendorOrg = await prisma.vendorOrg.upsert({
    where: { vendorId_organizationId: { vendorId: vendor.id, organizationId: org.id } },
    update: {},
    create: { vendorId: vendor.id, organizationId: org.id, tier: 1, status: "active" },
  });
  await prisma.vendorUser.upsert({
    where: { vendorId_email: { vendorId: vendor.id, email: "recruiter@globexstaffing.test" } },
    update: { status: "active", passwordHash },
    create: {
      vendorId: vendor.id,
      email: "recruiter@globexstaffing.test",
      name: "Gil Staffing",
      status: "active",
      passwordHash,
    },
  });
  await prisma.positionVendorRelease.upsert({
    where: { positionId_vendorOrgId: { positionId: position.id, vendorOrgId: vendorOrg.id } },
    update: {},
    create: { positionId: position.id, vendorOrgId: vendorOrg.id, visibleFrom: new Date() },
  });

  // A candidate mid-loop, with an interview and a filed scorecard: every
  // kind of record the cross-tenant checks try to reach from Acme.
  const candidate =
    (await prisma.candidate.findFirst({ where: { organizationId: org.id, reference: "GLX-C-001" } })) ??
    (await prisma.candidate.create({
      data: { organizationId: org.id, reference: "GLX-C-001", displayName: "Gwen Globex-Candidate" },
    }));
  const application = await prisma.application.upsert({
    where: { positionId_candidateId: { positionId: position.id, candidateId: candidate.id } },
    update: {},
    create: {
      organizationId: org.id,
      positionId: position.id,
      candidateId: candidate.id,
      currentStage: "interviewing",
    },
  });
  let interview = await prisma.interview.findFirst({ where: { applicationId: application.id } });
  if (!interview) {
    interview = await prisma.interview.create({
      data: {
        organizationId: org.id,
        applicationId: application.id,
        roundName: "Research talk",
        scheduledAt: new Date(Date.now() - 48 * 3_600_000),
        status: "completed",
        createdById: admin.id,
        panelists: { create: [{ orgUserId: admin.id }] },
      },
    });
  }
  await prisma.scorecard.upsert({
    where: { interviewId_orgUserId: { interviewId: interview.id, orgUserId: admin.id } },
    update: {},
    create: {
      organizationId: org.id,
      interviewId: interview.id,
      orgUserId: admin.id,
      overallRating: 4,
      recommendation: "yes",
      notes: "Globex-only scorecard. Acme must never see this.",
    },
  });

  console.log("Seeded tenant B: globex (admin@globex.test, recruiter@globexstaffing.test)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
