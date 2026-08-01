/* eslint-disable no-console */
// Demo seed: one org with a unit hierarchy, three vendors across two tiers,
// and positions demonstrating all three release policies.
// Run: pnpm db:seed  (idempotent — safe to re-run)

import { PrismaClient, type OrgRole } from "@prisma/client";
import { hashPassword } from "../src/auth/password";

const prisma = new PrismaClient();
const HOUR_MS = 3_600_000;
const DEMO_PASSWORD = "intervu-demo";

/** Seeded positions use the same human-readable scheme the app generates. */
let refCounter = 0;
const nextRef = () => `POS-${String(++refCounter).padStart(3, "0")}`;
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
        reference: nextRef(),
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
        reference: nextRef(),
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
        reference: nextRef(),
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
        reference: nextRef(),
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

  // --- Starter JD templates (guarded), so the picker isn't empty on a fresh
  // install and the "start from a template" flow is discoverable.
  const templateCount = await prisma.positionTemplate.count({
    where: { organizationId: org.id },
  });
  if (templateCount === 0) {
    const skillId = async (name: string) => {
      const norm = name.toLowerCase();
      const existing = await prisma.skill.findFirst({
        where: { organizationId: org.id, nameNorm: norm },
      });
      return (
        existing ??
        (await prisma.skill.create({
          data: { organizationId: org.id, name, nameNorm: norm },
        }))
      ).id;
    };
    const mkTemplate = async (
      name: string,
      summary: string,
      data: Record<string, unknown>,
      skills: [string, "must_have" | "good_to_have", string][],
    ) => {
      const rows = await Promise.all(
        skills.map(async ([n, level, proficiency]) => ({
          skillId: await skillId(n),
          level,
          proficiency,
        })),
      );
      await prisma.positionTemplate.create({
        data: {
          organizationId: org.id,
          name,
          summary,
          createdById: admin.id,
          ...data,
          skills: { create: rows as never },
        } as never,
      });
    };

    await mkTemplate(
      "Backend Engineer — standard",
      "Server-side product engineering; adjust seniority and rate per opening.",
      {
        title: "Backend Engineer",
        description:
          "Design, build and operate backend services. Partner with product on API design, own reliability of what you ship.",
        seniority: "mid",
        employmentType: "full_time",
        locationPolicy: "hybrid",
        minTotalYears: 3,
        mustHaves: ["Eligible to work without sponsorship"],
      },
      [
        ["Java", "must_have", "proficient"],
        ["Spring Boot", "must_have", "working"],
        ["SQL", "must_have", "working"],
        ["Kubernetes", "good_to_have", "awareness"],
      ],
    );

    await mkTemplate(
      "Data Engineer — standard",
      "Pipelines and warehouse modelling; commonly opened as a contract role.",
      {
        title: "Data Engineer",
        description:
          "Build and operate batch and streaming pipelines feeding the analytics warehouse.",
        seniority: "mid",
        employmentType: "contract",
        locationPolicy: "remote",
        minTotalYears: 3,
        rateMin: 70,
        rateMax: 95,
        rateCurrency: "USD",
        ratePeriod: "hourly",
      },
      [
        ["Spark", "must_have", "proficient"],
        ["Airflow", "must_have", "working"],
        ["Snowflake", "good_to_have", "working"],
        ["Python", "must_have", "proficient"],
      ],
    );

    await mkTemplate(
      "Frontend Engineer — standard",
      "Product UI engineering against the design system.",
      {
        title: "Frontend Engineer",
        description: "Build accessible, fast product surfaces with React and TypeScript.",
        seniority: "mid",
        employmentType: "full_time",
        locationPolicy: "remote",
        minTotalYears: 3,
      },
      [
        ["React", "must_have", "proficient"],
        ["TypeScript", "must_have", "proficient"],
        ["Design Systems", "good_to_have", "working"],
      ],
    );
    console.log("Seeded 3 job-description templates");
  }

  // --- Role posting metadata (guarded: only if no position has it yet)
  const withMeta = await prisma.position.count({
    where: { organizationId: org.id, NOT: { seniority: null } },
  });
  if (withMeta === 0) {
    const meta: Record<string, object> = {
      "Senior Platform Engineer": {
        seniority: "senior", employmentType: "full_time", locationPolicy: "hybrid",
        locationText: "Austin, TX", minTotalYears: 6, rateMin: 90, rateMax: 120,
        ratePeriod: "hourly", mustHaves: ["CKA certification", "US work authorization"],
      },
      "Data Engineer": {
        seniority: "mid", employmentType: "contract", locationPolicy: "remote",
        minTotalYears: 3, rateMin: 70, rateMax: 95, ratePeriod: "hourly",
        mustHaves: ["Overlap with US Central hours"],
      },
      "Frontend Engineer": {
        seniority: "mid", employmentType: "full_time", locationPolicy: "remote", minTotalYears: 3,
      },
      "ML Engineer": {
        seniority: "senior", employmentType: "contract_to_hire", locationPolicy: "hybrid",
        locationText: "Austin, TX", minTotalYears: 5, rateMin: 100, rateMax: 140, ratePeriod: "hourly",
      },
      "Growth Marketer": { seniority: "mid", employmentType: "full_time", locationPolicy: "remote" },
      "Sales Operations Analyst": {
        seniority: "junior", employmentType: "full_time", locationPolicy: "onsite",
        locationText: "Austin, TX", mustHaves: ["Salesforce admin experience"],
      },
    };
    for (const [title, data] of Object.entries(meta)) {
      await prisma.position.updateMany({
        where: { organizationId: org.id, title },
        data,
      });
    }
    console.log("Seeded role posting metadata");
  }

  console.log(`
╭───────────────────────────────────────────────────────────────────────────╮
│  DEMO ACCOUNTS — every account uses password: ${DEMO_PASSWORD}              │
│  Organization slug: acme   ·   Full guide: docs/10-demo-accounts.md        │
╰───────────────────────────────────────────────────────────────────────────╯

ORGANIZATION — sign in at http://localhost:3000/login
  admin@acme.test          org_admin        org-wide     settings, vendors, erasure
  recruiter@acme.test      recruiter        org-wide     the main workflow
  hm.eng@acme.test         hiring_manager   Engineering  subset of positions; no review queue
  pm.gtm@acme.test         project_manager  GTM          read-only, scope isolation
  pm.platform@acme.test    project_manager  Platform     read-only, narrowest scope
  interviewer1@acme.test   interviewer      assignment   0 positions; see /interviews
  interviewer2@acme.test   interviewer      assignment   pair w/ interviewer1 for feedback policy

VENDORS — sign in at http://localhost:3000/vendor/login  (org slug: acme)
  recruiter@talentbridge.test   TalentBridge  tier 1   sees tiered releases immediately
  recruiter@hireworks.test      HireWorks     tier 2   fewer positions until tiers unlock
  recruiter@staffpro.test       StaffPro      tier 2

Outside production, dev header auth also works instead of a session:
  org:    -H "x-intervu-org: acme" -H "x-intervu-user: <email>"
  vendor: -H "x-intervu-org: acme" -H "x-intervu-vendor-user: <email>"
`);

  void hireWorks; // referenced in docs above
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
