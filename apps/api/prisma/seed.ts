/* eslint-disable no-console */
// Demo seed: one org with a unit hierarchy, three vendors across two tiers,
// and positions demonstrating all three release policies.
// Run: pnpm db:seed  (idempotent — safe to re-run)

import { PrismaClient, type OrgRole } from "@prisma/client";
import { hashPassword } from "../src/auth/password";

const prisma = new PrismaClient();
const HOUR_MS = 3_600_000;
const DEMO_PASSWORD = "intervu-demo";
const demoHash = hashPassword(DEMO_PASSWORD);

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
  async function orgUser(email: string, name: string, role: OrgRole, orgUnitId: string | null) {
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: { status: "active", passwordHash: demoHash },
      create: { organizationId: org.id, email, name, status: "active", passwordHash: demoHash },
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
  await orgUser("interviewer1@acme.test", "Indira Interviewer", "interviewer", null);
  await orgUser("interviewer2@acme.test", "Ivan Interviewer", "interviewer", null);

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
      update: { status: "active", passwordHash: demoHash },
      create: { vendorId: v.id, email: userEmail, name: `${name} Recruiter`, role: "vendor_admin", status: "active", passwordHash: demoHash },
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

  // --- Demo analytics volume: extra teams/positions + a synthetic submission
  // corpus so dashboards have shape. Deterministic; runs once (guarded).
  const positionCount = await prisma.position.count({ where: { organizationId: org.id } });
  if (positionCount <= 3) {
    const marketing = await unit("Marketing", "team", gtm.id);
    const extraPositions = [
      { unitId: platform.id, title: "Frontend Engineer", desc: "React, design systems." },
      { unitId: data.id, title: "ML Engineer", desc: "Feature pipelines, model serving." },
      { unitId: marketing.id, title: "Growth Marketer", desc: "Lifecycle campaigns, attribution." },
    ];
    const now = new Date();
    const vendorOrgsAll = await prisma.vendorOrg.findMany({
      where: { organizationId: org.id },
      include: { vendor: true },
    });
    for (const ep of extraPositions) {
      const pos = await prisma.position.create({
        data: {
          organizationId: org.id,
          orgUnitId: ep.unitId,
          title: ep.title,
          description: ep.desc,
          status: "open",
          publishedAt: now,
          createdById: admin.id,
          releasePolicy: { create: { mode: "all_at_once", config: {} } },
        },
      });
      await prisma.positionVendorRelease.createMany({
        data: vendorOrgsAll.map((vo) => ({
          positionId: pos.id,
          vendorOrgId: vo.id,
          visibleFrom: now,
          source: "policy" as const,
        })),
      });
    }

    const allPositions = await prisma.position.findMany({
      where: { organizationId: org.id },
    });
    const firstNames = ["Aarav", "Beatriz", "Chen", "Divya", "Emeka", "Fatima", "Gustav", "Hana", "Ines", "Jorge", "Kavya", "Liam", "Mina", "Noor", "Oscar", "Padma", "Quinn", "Rohan", "Sofia", "Tariq", "Uma", "Viktor", "Wangari", "Ximena", "Yusuf", "Zara", "Anders", "Bianca", "Chidi", "Dalia", "Elias", "Freya", "Goro", "Helga", "Idris", "Jana"];
    const lastNames = ["Sharma", "Costa", "Wei", "Iyer", "Okafor", "Hassan", "Lind", "Kato", "Moreau", "Diaz", "Rao", "Byrne", "Park", "Aziz", "Nilsen", "Menon", "Reyes", "Joshi", "Rossi", "Farouk"];
    const vendorUsersAll = await prisma.vendorUser.findMany();
    const userByVendor = new Map(vendorUsersAll.map((u) => [u.vendorId, u]));
    // Deterministic spread: statuses cycle; every 6th is a duplicate; every
    // 5th application advances; every 9th gets an offer decision.
    for (let i = 0; i < 36; i++) {
      const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
      const email = `${name.toLowerCase().replaceAll(" ", ".")}@example.com`;
      const pos = allPositions[i % allPositions.length]!;
      const vo = vendorOrgsAll[i % vendorOrgsAll.length]!;
      const vu = userByVendor.get(vo.vendorId)!;
      const receivedAt = new Date(now.getTime() - (36 - i) * 36e5 * 6);
      const isDup = i % 6 === 5;
      const candidate = await prisma.candidate.create({
        data: { organizationId: org.id, displayName: name },
      });
      await prisma.candidateIdentity.create({
        data: {
          organizationId: org.id,
          candidateId: candidate.id,
          kind: "email",
          valueNorm: email,
          valueRaw: email,
        },
      });
      const submission = await prisma.submission.create({
        data: {
          organizationId: org.id,
          positionId: pos.id,
          vendorOrgId: vo.id,
          vendorUserId: vu.id,
          candidateId: candidate.id,
          rawProfile: { candidate_name: name, email },
          status: isDup ? "duplicate" : "accepted",
          ownershipStatus: isDup ? "duplicate" : "owner",
          consentConfirmed: true,
          receivedAt,
        },
      });
      if (!isDup) {
        const stage = i % 5 === 0 ? "interviewing" : i % 3 === 0 ? "screening" : "submitted";
        const app = await prisma.application.create({
          data: {
            organizationId: org.id,
            positionId: pos.id,
            candidateId: candidate.id,
            sourceSubmissionId: submission.id,
            currentStage: i % 9 === 0 ? "offer" : stage,
          },
        });
        if (i % 9 === 0) {
          await prisma.decision.create({
            data: {
              organizationId: org.id,
              applicationId: app.id,
              outcome: "offer",
              decidedById: admin.id,
            },
          });
        }
      }
    }
    console.log("Seeded demo analytics corpus: 3 extra positions, 36 submissions");
  }

  // --- Skills & interview panels (guarded; docs/03 skills/panels section)
  const skillCount = await prisma.skill.count({ where: { organizationId: org.id } });
  if (skillCount === 0) {
    const skillCache = new Map<string, string>();
    const skillId = async (name: string) => {
      const norm = name.toLowerCase();
      if (!skillCache.has(norm)) {
        const s = await prisma.skill.create({
          data: { organizationId: org.id, name, nameNorm: norm },
        });
        skillCache.set(norm, s.id);
      }
      return skillCache.get(norm)!;
    };

    const bySpec: Record<string, { must: string[]; good: string[] }> = {
      "Senior Platform Engineer": { must: ["Kubernetes", "Go"], good: ["Terraform", "System Design"] },
      "Data Engineer": { must: ["Spark", "Airflow"], good: ["Python"] },
      "Frontend Engineer": { must: ["React", "TypeScript"], good: ["Design Systems"] },
      "ML Engineer": { must: ["Python", "MLOps"], good: ["Spark"] },
      "Growth Marketer": { must: ["Lifecycle Marketing"], good: ["SQL"] },
      "Sales Operations Analyst": { must: ["SQL", "CRM"], good: ["Python"] },
    };
    const allPos = await prisma.position.findMany({ where: { organizationId: org.id } });
    for (const pos of allPos) {
      const spec = bySpec[pos.title];
      if (!spec) continue;
      for (const name of spec.must) {
        await prisma.positionSkill.create({
          data: { positionId: pos.id, skillId: await skillId(name), level: "must_have" },
        });
      }
      for (const name of spec.good) {
        await prisma.positionSkill.create({
          data: { positionId: pos.id, skillId: await skillId(name), level: "good_to_have" },
        });
      }
    }

    const userId = async (email: string) =>
      (await prisma.orgUser.findFirstOrThrow({ where: { organizationId: org.id, email } })).id;
    const mkPanel = async (
      name: string,
      orgUnitId: string | null,
      skills: string[],
      memberEmails: string[],
    ) => {
      const skillIds = await Promise.all(skills.map(skillId));
      const memberIds = await Promise.all(memberEmails.map(userId));
      await prisma.panel.create({
        data: {
          organizationId: org.id,
          orgUnitId,
          name,
          skills: { create: skillIds.map((id) => ({ skillId: id })) },
          members: { create: memberIds.map((id) => ({ orgUserId: id })) },
        },
      });
    };
    // Scope demo covers all three levels: vertical, vertical, org-wide.
    await mkPanel(
      "Platform Panel",
      engineering.id,
      ["Kubernetes", "Go", "Terraform", "System Design"],
      ["interviewer1@acme.test", "hm.eng@acme.test"],
    );
    await mkPanel(
      "Data & ML Panel",
      engineering.id,
      ["Spark", "Airflow", "Python", "MLOps"],
      ["interviewer2@acme.test", "hm.eng@acme.test"],
    );
    await mkPanel(
      "Analytics Guild",
      null, // org-wide: SQL screeners serve every team
      ["SQL", "CRM", "Lifecycle Marketing"],
      ["interviewer1@acme.test", "interviewer2@acme.test"],
    );
    console.log("Seeded skills + 3 panels (2 vertical-scoped, 1 org-wide)");
  }

  console.log(`
All demo accounts use password: ${DEMO_PASSWORD}
  Org login:    POST /api/v1/auth/org/login    {"org_slug":"acme","email":…,"password":…}
  Vendor login: POST /api/v1/auth/vendor/login {"email":…,"password":…}
Dev header auth also works outside production (see src/tenancy/auth.guard.ts):
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
