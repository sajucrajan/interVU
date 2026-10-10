/* eslint-disable no-console */
// Demo seed: one org with a unit hierarchy, three vendors across two tiers,
// and positions demonstrating all three release policies.
// Run: pnpm db:seed  (idempotent — safe to re-run)

import { PrismaClient } from "@prisma/client";
import { scorePair, T_AUTO, T_REVIEW } from "@intervu/matching-core";
import { SYSTEM_ROLES } from "../src/entitlements/permissions";
import { hashPassword } from "../src/auth/password";
import { randomUUID } from "node:crypto";

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
      settings: {
        ownership_scope: "position",
        ownership_window_days: 180,
        // Work-in-progress caps per stage, shown on the board column headers.
        wip_caps: { screening: 12, interviewing: 10 },
      },
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

  // --- Roles: the built-ins every organization starts with. Organizations add
  // their own on top (program manager, release train engineer, …).
  const roleByKey = new Map<string, string>();
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key: r.key } },
      update: { name: r.name, description: r.description, permissions: [...r.permissions] },
      create: {
        organizationId: org.id,
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: [...r.permissions],
        isSystem: true,
      },
    });
    roleByKey.set(r.key, role.id);
  }

  // --- Org users
  async function orgUser(email: string, name: string, roleKey: string, orgUnitId: string | null) {
    const roleId = roleByKey.get(roleKey)!;
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      // Persona preferences are reset too: a visitor who picked "open as
      // Hiring manager next time" must not decide what the next visitor sees.
      update: { status: "active", passwordHash: demoHash, defaultPersona: null, askPersonaAtLogin: false },
      create: { organizationId: org.id, email, name, status: "active", passwordHash: demoHash },
    });
    // find-or-create: the composite unique includes a nullable column,
    // which Prisma upsert can't target
    const membership = await prisma.orgMembership.findFirst({
      where: { orgUserId: user.id, orgUnitId, roleId },
    });
    if (!membership) {
      await prisma.orgMembership.create({
        data: { orgUserId: user.id, orgUnitId, roleId },
      });
    }
    return user;
  }
  const admin = await orgUser("admin@acme.test", "Avery Admin", "org_admin", null);
  await orgUser("recruiter@acme.test", "Rafael Recruiter", "recruiter", null);
  await orgUser("hm.eng@acme.test", "Harper Manager", "hiring_manager", engineering.id); // vertical-scoped
  await orgUser("pm.gtm@acme.test", "Parker PM", "project_manager", gtm.id); // vertical-scoped, read-only
  await orgUser("pm.platform@acme.test", "Priya PM", "project_manager", platform.id); // single-team scope
  await orgUser("interviewer1@acme.test", "Ingrid Interviewer", "interviewer", null);
  await orgUser("interviewer2@acme.test", "Ikenna Interviewer", "interviewer", null);

  // An organization-defined role, the way docs/09 says real ones are made: a
  // bundle of permissions with the organization's own name on it. It reads
  // vendor performance without being able to change a contract, which is
  // also what lets the public demo show the agency report at all — the only
  // other way in is the admin account, which the demo guide does not offer.
  const vendorManager = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "vendor_manager" } },
    update: {},
    create: {
      organizationId: org.id,
      key: "vendor_manager",
      name: "Vendor manager",
      description: "Reviews how each agency performs. Can read the pipeline; cannot change contracts or move candidates.",
      permissions: ["positions.view", "submissions.view", "vendors.view_performance"],
      isSystem: false,
    },
  });
  roleByKey.set("vendor_manager", vendorManager.id);
  await orgUser("vendors@acme.test", "Mei Sourcing", "vendor_manager", null);

  // --- Vendors: TalentBridge (tier 1); HireWorks, StaffPro, NorthStar (tier 2)
  async function vendor(
    name: string,
    tier: number,
    userEmail: string,
    contractStart: Date,
  ) {
    let v = await prisma.vendor.findFirst({ where: { name } });
    v ??= await prisma.vendor.create({ data: { name } });
    const vo = await prisma.vendorOrg.upsert({
      where: { vendorId_organizationId: { vendorId: v.id, organizationId: org.id } },
      // Fee percent is what makes cost-per-hire computable at all; a tier-1
      // agency charging more than a tier-2 is the whole argument.
      update: { tier, status: "active", contractStart, feePercent: tier === 1 ? 22 : 18 },
      create: {
        vendorId: v.id,
        organizationId: org.id,
        tier,
        status: "active",
        contractStart,
        feePercent: tier === 1 ? 22 : 18,
      },
    });
    await prisma.vendorUser.upsert({
      where: { vendorId_email: { vendorId: v.id, email: userEmail } },
      update: { status: "active", passwordHash: demoHash },
      create: { vendorId: v.id, email: userEmail, name: `${name} Recruiter`, role: "vendor_admin", status: "active", passwordHash: demoHash },
    });
    return vo;
  }
  // Contract dates make "tier 1 · since 2023" real on the vendor screens.
  const talentBridge = await vendor(
    "TalentBridge", 1, "recruiter@talentbridge.test", new Date("2023-03-01"),
  );
  const hireWorks = await vendor(
    "HireWorks", 2, "recruiter@hireworks.test", new Date("2024-07-15"),
  );
  await vendor("StaffPro", 2, "recruiter@staffpro.test", new Date("2025-01-20"));
  // The fourth agency. Three agencies meant each saw only two peers, below the
  // benchmark's floor of three, so the comparison on the Performance screen
  // was always empty in the demo.
  await vendor("NorthStar Talent", 2, "recruiter@northstar.test", new Date("2025-09-01"));

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

    // Ordered by reference, so slot j of the corpus is always POS-00(j+1).
    const allPositions = await prisma.position.findMany({
      where: { organizationId: org.id },
      orderBy: { reference: "asc" },
    });
    // Full names, not a first × last grid: the grid paired a Kenyan first name
    // with a Chinese surname and so on, and its order decided which people the
    // demo features. About a third North American (Acme is a US company), the
    // rest spread across regions, with genders mixed in each. Index matters —
    // offers land on 0/9/18/27, duplicate claims on every 6th from 5, and the
    // first three in the interviewing lane (10, 15, 20) are the debrief, the
    // overdue scorecard and the upcoming interview the demo guide points to.
    // The rejection step further down takes every third undecided agency
    // application in this order (slots 2, 4, 13, 19, 25, 31, 34, plus one
    // agency extra), so those slots are spread across regions too, and the
    // two near-duplicate originals (22, 32) sit outside them. Re-check the
    // spread with the query in docs/10 if you reorder anything.
    const corpusNames = [
      "Emily Carter", "Diego Ramírez", "Marcus Johnson", "Sakura Tanaka", "Oluwaseun Adeyemi", "Ryan Sullivan",
      "Ananya Gupta", "Taylor Brooks", "Karim Mansour", "Arjun Mehta", "Lucía Fernández", "Sophie Dubois",
      "Brandon Hayes", "Lukas Becker", "Grace Kim", "Jordan Mitchell", "Thandiwe Ndlovu", "Mateo Silva",
      "Kwame Mensah", "Rahul Verma", "Amira Haddad", "Megan Price", "Catherine Walsh", "Siti Rahman",
      "Wei Zhang", "Ashley Morgan", "Kevin Lawson", "Yuna Choi", "Isabella Rossi", "Layla Nasser",
      "Chinedu Okeke", "Jin Park", "Nguyen Van An", "Maria Santos", "Tyler Reed", "Camila Torres",
    ];
    const vendorUsersAll = await prisma.vendorUser.findMany();
    const userByVendor = new Map(vendorUsersAll.map((u) => [u.vendorId, u]));
    const orgByVendorName = new Map(vendorOrgsAll.map((vo) => [vo.vendor.name, vo]));
    // Who sources each role, by corpus slot (POS-001 … POS-006). This used to
    // be round-robin across all agencies, which ignored the releases above:
    // StaffPro submitted to a role released to TalentBridge alone, HireWorks
    // to a tier-1 head start it could not see, and TalentBridge to a role that
    // is direct-only. A demo that breaks its own rules teaches the wrong
    // product. Slots 4–6 keep exactly the agencies they always had.
    //   POS-001 direct-only      → nobody; these people applied themselves
    //   POS-002 tiered, hybrid   → TalentBridge, the only tier-1 agency
    //   POS-003 manual release   → TalentBridge, the only agency it went to
    //   POS-004/005/006          → TalentBridge, HireWorks, StaffPro
    const VENDOR_FOR_SLOT = [null, "TalentBridge", "TalentBridge", "TalentBridge", "HireWorks", "StaffPro"];
    const DIRECT_CHANNELS = ["careers", "referral", "careers", "internal", "careers", "referral"] as const;
    // Deterministic spread: statuses cycle; every 6th is a duplicate; every
    // 5th application advances; every 9th gets an offer decision.
    for (let i = 0; i < 36; i++) {
      const name = corpusNames[i]!;
      const email = `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", ".")}@example.com`;
      const slot = i % allPositions.length;
      const pos = allPositions[slot]!;
      const vendorName = VENDOR_FOR_SLOT[slot];
      const receivedAt = new Date(now.getTime() - (36 - i) * 36e5 * 6);
      const isDup = i % 6 === 5;
      const stage = i % 5 === 0 ? "interviewing" : i % 3 === 0 ? "screening" : "submitted";
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

      let sourceSubmissionId: string | null = null;
      if (vendorName) {
        const vo = orgByVendorName.get(vendorName)!;
        const vu = userByVendor.get(vo.vendorId)!;
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
        if (isDup) continue;
        sourceSubmissionId = submission.id;
      }

      // A direct applicant has no submission, deliberately: giving them a
      // fake one is precisely the invoice fraud the ownership rule blocks.
      const channel = vendorName ? "vendor" : DIRECT_CHANNELS[Math.floor(i / 6) % DIRECT_CHANNELS.length]!;
      const app = await prisma.application.create({
        data: {
          organizationId: org.id,
          positionId: pos.id,
          candidateId: candidate.id,
          sourceSubmissionId,
          sourceChannel: channel,
          sourceDetail: channel === "referral" ? "Referred by an engineer on the team" : null,
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

    // Agencies' own submissions, added after the corpus so the people the
    // demo guide names are untouched.
    //  - NorthStar is the fourth agency: the benchmark refuses below three
    //    other active agencies, because with fewer the "average" would
    //    identify a rival, so with three agencies it was always empty.
    //  - StaffPro's corpus slot is the duplicate slot, so without these it
    //    had nothing but duplicates — zero accepted, and the role it sources
    //    (Growth Marketer) had no candidates at all.
    const EXTRA = [
      { agency: "NorthStar Talent", name: "Ravi Kumar", slot: 3, daysAgo: 6, stage: "screening" },
      { agency: "NorthStar Talent", name: "Lena Fischer", slot: 4, daysAgo: 5, stage: "screening" },
      { agency: "NorthStar Talent", name: "Tomás Herrera", slot: 5, daysAgo: 3, stage: "submitted" },
      { agency: "NorthStar Talent", name: "Haruto Sato", slot: 3, daysAgo: 1.5, stage: "submitted" },
      { agency: "StaffPro", name: "Amara Obi", slot: 5, daysAgo: 7, stage: "screening" },
      { agency: "StaffPro", name: "Jonas Weber", slot: 5, daysAgo: 2, stage: "submitted" },
      { agency: "StaffPro", name: "Noah Bennett", slot: 4, daysAgo: 4, stage: "screening" },
    ] as const;
    for (const c of EXTRA) {
      const agency = orgByVendorName.get(c.agency);
      if (!agency) continue;
      const user = userByVendor.get(agency.vendorId)!;
      const position = allPositions[c.slot]!;
      const email = `${c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", ".")}@example.com`;
      const candidate = await prisma.candidate.create({
        data: { organizationId: org.id, displayName: c.name },
      });
      await prisma.candidateIdentity.create({
        data: { organizationId: org.id, candidateId: candidate.id, kind: "email", valueNorm: email, valueRaw: email },
      });
      const submission = await prisma.submission.create({
        data: {
          organizationId: org.id,
          positionId: position.id,
          vendorOrgId: agency.id,
          vendorUserId: user.id,
          candidateId: candidate.id,
          rawProfile: { candidate_name: c.name, email },
          status: "accepted",
          ownershipStatus: "owner",
          consentConfirmed: true,
          receivedAt: new Date(now.getTime() - c.daysAgo * 86_400_000),
        },
      });
      await prisma.application.create({
        data: {
          organizationId: org.id,
          positionId: position.id,
          candidateId: candidate.id,
          sourceSubmissionId: submission.id,
          sourceChannel: "vendor",
          currentStage: c.stage,
        },
      });
    }
    console.log("Seeded demo analytics corpus: 3 extra positions, 36 people, 7 agency extras");
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
  vendors@acme.test        vendor_manager   org-wide     custom role; vendor performance, read-only

VENDORS — sign in at http://localhost:3000/vendor/login  (org slug: acme)
  recruiter@talentbridge.test   TalentBridge  tier 1   sees tiered releases immediately
  recruiter@hireworks.test      HireWorks     tier 2   fewer positions until tiers unlock
  recruiter@staffpro.test       StaffPro      tier 2
  recruiter@northstar.test      NorthStar     tier 2   the fourth agency, so benchmarks have peers

Outside production, dev header auth also works instead of a session:
  org:    -H "x-intervu-org: acme" -H "x-intervu-user: <email>"
  vendor: -H "x-intervu-org: acme" -H "x-intervu-vendor-user: <email>"
`);

  // --- Demonstrable states: without these the board is all green and the
  // aging, breached and hatched treatments never appear.
  const DAY = 86_400_000;
  const active = await prisma.application.findMany({
    where: { organizationId: org.id, status: "active" },
    orderBy: { createdAt: "asc" },
    take: 6,
    select: { id: true, currentStage: true },
  });

  // Backdate a few so they sit well past the 48h first-screen SLA.
  for (const [i, a] of active.slice(0, 3).entries()) {
    const at = new Date(Date.now() - (4 + i * 3) * DAY);
    await prisma.application.update({ where: { id: a.id }, data: { createdAt: at } });
    await prisma.stageTransition.updateMany({
      where: { applicationId: a.id },
      data: { at },
    });
  }

  // One accepted offer above band: lights up offer accept rate, the funnel's
  // Hired row, and the "above band" flag on the board.
  // Guard on the whole set, not on one row: picking a row without an order
  // returns a different application each run, so a re-run would add a second
  // offer instead of finding the first.
  const offerCount = await prisma.offer.count({ where: { organizationId: org.id } });
  // Agency-sourced on purpose: the hire is what makes cost per hire and the
  // fee comparison computable, and a direct hire carries no fee.
  const offered = await prisma.application.findFirst({
    where: { organizationId: org.id, decision: { outcome: "offer" }, sourceChannel: "vendor" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (offered && offerCount === 0) {
    {
      await prisma.offer.create({
        data: {
          organizationId: org.id,
          applicationId: offered.id,
          amount: 98000,
          currency: "EUR",
          vsRateBand: "above",
          extendedAt: new Date(Date.now() - 9 * DAY),
          acceptedAt: new Date(Date.now() - 2 * DAY),
          // Start date is recorded at acceptance; retained_90d stays null
          // until those 90 days have actually elapsed. The channel table
          // says so rather than guessing.
          startDate: new Date(Date.now() + 26 * DAY),
        },
      });
      await prisma.application.update({
        where: { id: offered.id },
        data: { status: "hired" },
      });
    }
  }

  // --- Interviews, panels and scorecards.
  //
  // These were previously assumed to exist: the blocks further down that add
  // per-competency ratings query for scorecards and silently do nothing when
  // there are none. On a database that has actually been reset — which is now
  // the nightly path — /interviews, the debrief and the interview room were
  // all empty. Creating them here is what makes those screens demonstrable.
  const iv1 = await prisma.orgUser.findFirst({
    where: { organizationId: org.id, email: "interviewer1@acme.test" },
    select: { id: true },
  });
  const iv2 = await prisma.orgUser.findFirst({
    where: { organizationId: org.id, email: "interviewer2@acme.test" },
    select: { id: true },
  });
  const interviewCount = await prisma.interview.count({ where: { organizationId: org.id } });
  if (iv1 && iv2 && interviewCount === 0) {
    // Applications actually IN the interviewing lane, not merely the oldest
    // three. Picking by age put every interview on a card sitting in
    // `submitted` or `screening`, so the board showed five candidates
    // interviewing while /interviews showed three other people entirely.
    const candidates = await prisma.application.findMany({
      where: { organizationId: org.id, status: "active", currentStage: "interviewing" },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { id: true },
    });

    // Three deliberately different states, because the interviewer screen
    // groups by what you must DO and each group needs an occupant:
    //   0 — done, both filed        → the debrief has a full matrix
    //   1 — done, iv1 has NOT filed → "waiting on you", and the room to use
    //   2 — still ahead             → "upcoming"
    // Harper, the hiring manager, also sits on Jordan Mitchell's panel and has
    // not filed either: the one demo account with two personas (docs/09 §7),
    // so the picker, the switcher and "1 waiting as Interviewer" on Today
    // all have something real to show.
    const hm = await prisma.orgUser.findFirst({
      where: { organizationId: org.id, email: "hm.eng@acme.test" },
      select: { id: true },
    });
    const plan = [
      { hoursAgo: 72, panel: [iv1.id, iv2.id], filed: [iv1.id, iv2.id], status: "completed" },
      { hoursAgo: 30, panel: [iv1.id, iv2.id, ...(hm ? [hm.id] : [])], filed: [iv2.id], status: "completed" },
      { hoursAgo: -48, panel: [iv1.id], filed: [], status: "scheduled" },
    ];

    for (const [i, spec] of plan.entries()) {
      const app = candidates[i];
      if (!app) continue;
      const at = new Date(Date.now() - spec.hoursAgo * 3_600_000);
      const interview = await prisma.interview.create({
        data: {
          organizationId: org.id,
          applicationId: app.id,
          roundName: i === 0 ? "Screening call" : "Technical round",
          scheduledAt: at,
          durationMin: 60,
          locationOrLink: "Meet · https://example.test/room",
          status: spec.status,
          panelists: { create: spec.panel.map((orgUserId) => ({ orgUserId })) },
        },
      });
      for (const [j, orgUserId] of spec.filed.entries()) {
        await prisma.scorecard.create({
          data: {
            organizationId: org.id,
            interviewId: interview.id,
            orgUserId,
            overallRating: j === 0 ? 4 : 3,
            recommendation: j === 0 ? "strong_yes" : "no",
            notes:
              j === 0
                ? "Strong systems thinking. Walked through the read-path rework unprompted."
                : "Solid, but thin on the operational side — struggled to reason about failure modes.",
            // Filed a few hours after the round ended, so the debrief's
            // turnaround column has a real span to report.
            submittedAt: new Date(at.getTime() + (3 + j * 5) * 3_600_000),
          },
        });
      }
    }
    console.log(`Seeded ${plan.length} interviews (1 fully filed, 1 awaiting a scorecard, 1 upcoming)`);
  }

  // --- The shared question bank, with usage history.
  //
  // Seeded WITH past usage so the discrimination figure has something to say
  // on arrival: a bank with no history shows "needs N more rated answers"
  // everywhere, which hides the one idea that makes it more than a document.
  const bankCount = await prisma.interviewQuestion.count({ where: { organizationId: org.id } });
  if (bankCount === 0) {
    const allSkills = await prisma.skill.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true },
    });
    const byName = new Map(allSkills.map((s) => [s.name.toLowerCase(), s.id]));
    const BANK: {
      prompt: string;
      rubric: string[];
      followUps: string[];
      kind: "technical" | "system_design" | "behavioural" | "situational";
      level: number;
      skills: string[];
      /** Ratings that followed, seeded to give each question a real spread. */
      ratings: number[];
    }[] = [
      {
        prompt:
          "Walk me through a service you owned end to end. What broke in production, and what did you change so it could not break that way again?",
        rubric: [
          "Describes the failure concretely, not in the abstract",
          "Separates the fix from the mitigation",
          "Talks about what they changed in the SYSTEM, not just the code",
        ],
        followUps: ["What did you decide NOT to fix, and why?"],
        kind: "behavioural",
        level: 3,
        skills: ["kubernetes", "go", "spark"],
        // Wide spread: this one genuinely separates people.
        ratings: [5, 2, 4, 2, 5],
      },
      {
        prompt:
          "How would you design a read path that stays fast as the dataset grows 100x? Talk me through where it breaks first.",
        rubric: [
          "Identifies the first bottleneck rather than listing every technology",
          "Reasons about access patterns before reaching for a cache",
          "Names the tradeoff they are accepting",
        ],
        followUps: ["Where does your cache go stale, and who notices first?"],
        kind: "system_design",
        level: 4,
        skills: ["kubernetes", "airflow", "typescript"],
        ratings: [4, 3, 5, 2],
      },
      {
        prompt: "What does this language give you that you would miss elsewhere?",
        rubric: ["Answers from experience rather than from the docs"],
        followUps: [],
        kind: "technical",
        level: 2,
        skills: ["go", "python", "typescript"],
        // Everyone answers this the same way — a spread of 0 is the point.
        ratings: [4, 4, 4, 4],
      },
      {
        prompt:
          "Tell me about a time you disagreed with a technical decision that had already been made. What did you do?",
        rubric: [
          "Engages with the other position on its merits",
          "Describes what would have changed their own mind",
        ],
        followUps: ["What happened afterwards?"],
        kind: "situational",
        level: 3,
        skills: ["react", "design systems", "python"],
        ratings: [3, 5, 2],
      },
    ];

    const author = iv2 ?? iv1;
    for (const q of BANK) {
      const ids = q.skills
        .map((n) => byName.get(n))
        .filter((x): x is string => Boolean(x));
      if (ids.length === 0) continue;
      const created = await prisma.interviewQuestion.create({
        data: {
          organizationId: org.id,
          createdById: author?.id ?? null,
          prompt: q.prompt,
          rubric: q.rubric,
          followUps: q.followUps,
          kind: q.kind,
          level: q.level,
          skills: { create: ids.map((skillId) => ({ skillId })) },
        },
      });
      // Synthetic history: one usage row per past rating, against a distinct
      // fake interview id so the unique (question, interview, skill) holds.
      await prisma.interviewQuestionUsage.createMany({
        data: q.ratings.map((rating, i) => ({
          questionId: created.id,
          interviewId: randomUUID(),
          skillId: ids[0]!,
          rating,
        })),
        skipDuplicates: true,
      });
    }
    // Votes are cast by people the demo does NOT sign you in as. Seeding them
    // as interviewer1/2 meant arriving with my_vote already set, so the first
    // click on the thumb WITHDREW a vote you never knowingly cast and the
    // score went down — the control looked broken while working correctly.
    const voters = await prisma.orgUser.findMany({
      where: {
        organizationId: org.id,
        email: { in: ["recruiter@acme.test", "hm.eng@acme.test", "admin@acme.test"] },
      },
      select: { id: true },
    });
    const seeded = await prisma.interviewQuestion.findMany({
      where: { organizationId: org.id },
      select: { id: true, level: true, prompt: true },
    });
    for (const q of seeded) {
      const weak = q.prompt.startsWith("What does this language");
      for (const [i, v] of voters.entries()) {
        if (weak && i > 0) continue;
        await prisma.interviewQuestionVote.upsert({
          where: { questionId_orgUserId: { questionId: q.id, orgUserId: v.id } },
          update: { value: weak ? -1 : 1 },
          create: { questionId: q.id, orgUserId: v.id, value: weak ? -1 : 1 },
        });
      }
    }
    console.log(`Seeded ${BANK.length} bank questions with usage history and votes`);
  }

  // A resume on every vendor-sourced application, because that is what a
  // submission IS — a vendor sends a candidate by sending their CV.
  //
  // This used to cover only applications that had interviews, written when the
  // interview room was the only thing that read a resume. Screening happens
  // BEFORE any interview exists, so the screening packet was structurally
  // starved: six of seven candidates in that stage showed 0% coverage and an
  // empty comparison, which reads as a broken feature rather than a thin
  // fixture.
  //
  // Direct applicants still get nothing, deliberately — they have no vendor
  // submission to carry a file, and that empty state is worth seeing too.
  //
  // Plain text is enough: every screen renders extracted TEXT, never the
  // original file, so a realistic CV body is the whole fixture.
  const RESUME = (name: string, title: string, tech: string) => `${name}
${title}

SUMMARY
Nine years building and running production systems. Comfortable owning a
service end to end, from design through on-call.

EXPERIENCE
Senior Engineer, Northwind Systems (2021 - present)
  Led the migration of the billing platform to ${tech.split(", ")[0]}.
  Cut p99 latency by 40% by reworking the read path and its caching.
  Mentored three engineers; ran the hiring loop for the platform team.

Engineer, Halcyon Data (2018 - 2021)
  Built the ingestion pipeline handling 2B events/day.
  Owned the on-call rotation and the incident review process.

SKILLS
${tech}

EDUCATION
BSc Computer Science, University of Edinburgh
`;

  // The organization's own skill rows are the vocabulary the comparison
  // matches against, so a CV that only lists technologies outside it can never
  // produce an "also mentioned" chip. The old fixture appended Docker,
  // PostgreSQL and CI/CD — none of which are skills here — which left that
  // section of the screening packet permanently empty.
  const vocab = await prisma.skill.findMany({
    where: { organizationId: org.id },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  const submitted = await prisma.application.findMany({
    where: { organizationId: org.id, sourceSubmissionId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sourceSubmissionId: true,
      candidate: { select: { displayName: true } },
      position: { select: { title: true, skills: { select: { skill: { select: { name: true } } } } } },
    },
  });
  for (const [i, a] of submitted.entries()) {
    if (!a.sourceSubmissionId) continue;
    const existing = await prisma.attachment.count({
      where: { ownerType: "submission", ownerId: a.sourceSubmissionId, kind: "resume" },
    });
    if (existing > 0) continue;
    // Drop a varying number of required skills from the CV text, so coverage
    // spreads across the board instead of every candidate scoring the same.
    // Screening is a comparison, and a comparison where every row reads alike
    // teaches a screener nothing about the screen.
    //
    // One in three shows every requirement — without a clean fit, the gaps
    // callout looks like an artefact of the fixture rather than a finding.
    const names = a.position.skills.map((s) => s.skill.name);
    // Two technologies this role never asked for, rotated so they differ per
    // candidate: that is what the "also mentioned" section is for — spotting
    // someone who is a poor fit here and an obvious one for the role next door.
    const beyond = vocab
      .map((s) => s.name)
      .filter((n) => !names.includes(n))
      .filter((_, j) => j % 5 === i % 5)
      .slice(0, 2);
    const shown = names
      .slice(i % 3)
      .concat(beyond, ["Docker", "PostgreSQL", "CI/CD"]);
    const text = RESUME(a.candidate.displayName, a.position.title, shown.join(", "));
    await prisma.attachment.create({
      data: {
        organizationId: org.id,
        kind: "resume",
        ownerType: "submission",
        ownerId: a.sourceSubmissionId,
        s3Key: null,
        filename: `${a.candidate.displayName.replace(/\s+/g, "-").toLowerCase()}-cv.txt`,
        contentType: "text/plain",
        size: text.length,
        parsedText: text,
      },
    });
  }

  // --- Sourcing channel (docs/05 §8). Everything above this line is
  // vendor-sourced by default, which is exactly what the migration
  // guarantees for existing data; these rows give the comparison a
  // second and third column to argue with.
  const openPositions = await prisma.position.findMany({
    where: { organizationId: org.id },
    orderBy: { reference: "asc" },
    select: { id: true },
  });
  // One role sourced in-house only, one hybrid where vendors join a week
  // late — the delay that makes hybrid different from "all of the above".
  if (openPositions[0]) {
    await prisma.position.update({
      where: { id: openPositions[0].id },
      data: { sourcingMode: "direct", vendorOpensAt: null },
    });
  }
  // Only the first time: the history block at the end dates the unlock
  // properly, and re-running this reset it to the future, hiding the role
  // from the tier-1 agency that had been submitting to it.
  if (openPositions[1]) {
    await prisma.position.updateMany({
      where: { id: openPositions[1].id, sourcingMode: { not: "hybrid" } },
      data: {
        sourcingMode: "hybrid",
        vendorOpensAt: new Date(Date.now() + 3 * DAY),
      },
    });
  }
  // A handful of direct applicants. These deliberately keep
  // source_submission_id null: a direct applicant has no vendor, and giving
  // them a fake one is precisely the invoice fraud the ownership rule blocks.
  //
  // Guarded, because this block was not idempotent: it took four rows that
  // were STILL marked vendor, and the ones it had already converted no longer
  // matched — so every re-run ate four more. Two runs of `db:seed` took the
  // vendor-sourced count from 26 to 18 and moved the channel mix the analytics
  // page reports, with nothing to show that anything had changed.
  const alreadyDirect = await prisma.application.count({
    where: { organizationId: org.id, sourceChannel: { not: "vendor" } },
  });
  const directable = alreadyDirect > 0
    ? []
    : await prisma.application.findMany({
        where: { organizationId: org.id, sourceChannel: "vendor" },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true },
      });
  const CHANNELS = ["careers", "referral", "careers", "internal"] as const;
  for (const [i, a] of directable.entries()) {
    await prisma.application.update({
      where: { id: a.id },
      data: {
        sourceChannel: CHANNELS[i]!,
        sourceDetail:
          CHANNELS[i] === "referral" ? "Referred by an engineer on the team" : null,
        sourceSubmissionId: null,
      },
    });
  }

  // One dropout, so vendor quality is penalised by something real.
  const droppedAlready = await prisma.application.count({
    where: { organizationId: org.id, dropoutKind: { not: null } },
  });
  const dropper = active.at(-1);
  if (dropper && droppedAlready === 0) {
    await prisma.application.updateMany({
      where: { id: dropper.id, dropoutKind: null },
      data: {
        dropoutKind: "unresponsive",
        dropoutAtStage: dropper.currentStage,
        dropoutAt: new Date(Date.now() - 3 * DAY),
        status: "withdrawn",
      },
    });
  }

  // --- Rejections, so the vendor funnel is not a column of zeroes.
  //
  // Every figure the vendor analytics screen exists to show — rejected at
  // screening, rejected after interview, screen-through rate — was 0 on a
  // fresh database, because nothing here ever recorded a `reject`. A funnel
  // where the only outcome is "offer" makes the whole screen look broken
  // rather than empty, which is the same trap the resume fixture fell into.
  //
  // Two distinct kinds, because the product now distinguishes them and the
  // difference is the point: a screening rejection costs a recruiter ten
  // minutes, a post-interview rejection costs a panel three hours.
  // Looked up rather than captured: the seed does not keep references to
  // these users, and the decider matters — a screening rejection is the
  // recruiter's to make, a post-interview one is not.
  const deciderScreen = await prisma.orgUser.findFirst({
    where: { organizationId: org.id, email: "recruiter@acme.test" },
    select: { id: true },
  });
  const deciderPanel = await prisma.orgUser.findFirst({
    where: { organizationId: org.id, email: "hm.eng@acme.test" },
    select: { id: true },
  });
  // Guarded: without it every re-run found the candidates left undecided and
  // rejected up to eight more of them, so a second `db:seed` quietly emptied
  // the pipeline it was meant to leave unchanged.
  const alreadyRejected = await prisma.decision.count({
    where: { organizationId: org.id, outcome: "reject" },
  });
  // People with real interview records are left alone: they are the debrief,
  // the overdue scorecard and the upcoming loop the demo guide sends visitors
  // to, and rejecting them by position in a list made those pages vanish.
  // Rejections at the interviewing stage still count as post-interview.
  const decidable = alreadyRejected > 0 ? [] : await prisma.application.findMany({
    where: {
      organizationId: org.id,
      decision: null,
      sourceSubmissionId: { not: null },
      interviews: { none: {} },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, currentStage: true, interviews: { select: { id: true } } },
  });
  const REASONS = [
    "Six years short on the platform side; no Kubernetes anywhere in the history.",
    "Strong CV, but every example is greenfield — this role is mostly migration.",
    "Comfortable with the stack, not with the on-call expectation.",
    "Panel agreed: solid engineer, no system design depth at this level.",
    "Two of three panelists had the same concern about ownership.",
  ];
  let rejected = 0;
  for (const [i, a] of decidable.entries()) {
    // Roughly a third, deterministic rather than random so a reseed produces
    // the same board twice — screenshots and demos depend on it.
    if (i % 3 !== 0) continue;
    if (rejected >= 8) break;
    // A panel's verdict is the hiring manager's to record, a screening one the
    // recruiter's; reaching the interviewing stage is what makes it the panel's.
    const afterInterview = a.interviews.length > 0 || a.currentStage === "interviewing";
    await prisma.decision.create({
      data: {
        organizationId: org.id,
        applicationId: a.id,
        outcome: "reject",
        reason: REASONS[rejected % REASONS.length]!,
        decidedById: afterInterview
          ? (deciderPanel?.id ?? admin.id)
          : (deciderScreen?.id ?? admin.id),
      },
    });
    // "rejected", matching what decide() writes. `closed` is not a member of
    // ApplicationStatus and a fixture that sets a state the app cannot
    // produce teaches the wrong thing about the product.
    await prisma.application.update({
      where: { id: a.id },
      data: { status: "rejected" },
    });
    rejected++;
  }
  console.log(`Seeded ${rejected} rejections across screening and post-interview`);

  // --- Per-competency ratings on the seeded scorecards, so the debrief has a
  // matrix to show and one row where the panel genuinely disagrees.
  const seededCards = await prisma.scorecard.findMany({
    where: { organizationId: org.id },
    orderBy: { submittedAt: "asc" },
    select: { id: true, interview: { select: { applicationId: true } } },
  });
  // Position WITHIN the panel, not a hash of the id: hashing happened to give
  // every panelist the same answer, so nothing diverged.
  const seatByApplication = new Map<string, number>();
  for (const card of seededCards) {
    const appId = card.interview.applicationId;
    const seat = seatByApplication.get(appId) ?? 0;
    seatByApplication.set(appId, seat + 1);
    const existing = await prisma.scorecardCompetency.count({
      where: { scorecardId: card.id },
    });
    if (existing > 0) continue;
    const app = await prisma.application.findUnique({
      where: { id: card.interview.applicationId },
      select: { position: { select: { skills: { select: { skillId: true } } } } },
    });
    const skills = app?.position.skills ?? [];
    if (skills.length === 0) continue;
    await prisma.scorecardCompetency.createMany({
      data: skills.map((sk, i) => ({
        scorecardId: card.id,
        skillId: sk.skillId,
        // Deterministic, and deliberately split on the second competency so
        // the divergence callout has something real to point at.
        // Second competency splits the panel: seat 0 scores it 5, seat 1
        // scores it 2, against the same rubric. That is the conversation the
        // divergence callout exists to start.
        rating: i === 1 ? (seat === 0 ? 5 : 2) : 4,
      })),
    });
  }

  // --- The match review queue (docs/04 §3). Empty on a fresh database, so
  // the probabilistic matcher — the most unusual thing in the product — had
  // nothing to show. Two agencies send someone already on file under a
  // slightly different name and a different email. Each is scored by the same
  // function the API uses and parked exactly as parkForReview() would park it;
  // a pair that does not land in the review band is skipped rather than
  // forced, so the queue never claims an uncertainty the matcher would not.
  const queued = await prisma.matchReviewItem.count({ where: { organizationId: org.id } });
  if (queued === 0) {
    const vendorOrgNamed = async (name: string) =>
      prisma.vendorOrg.findFirst({
        where: { organizationId: org.id, vendor: { name } },
        include: { vendor: { include: { vendorUsers: { take: 1 } } } },
      });
    const positionRef = async (reference: string) =>
      prisma.position.findFirst({ where: { organizationId: org.id, reference } });
    const NEAR_MISSES = [
      {
        // A spelling variant: the commonest near-miss there is.
        existing: "Catherine Walsh",
        known: { employer: "Halcyon Data", title: "Data Engineer", location: "Austin, TX" },
        agency: "StaffPro",
        position: "POS-005",
        hoursAgo: 5,
        incoming: {
          candidate_name: "Katherine Walsh",
          email: "kwalsh.dev@example.com",
          phone: "+1 512 555 0171",
          current_employer: "Halcyon Data",
          current_title: "Senior Data Engineer",
          location: "Remote",
        },
      },
      {
        // Family name first on one CV, last on the other — routine for
        // Vietnamese, Chinese, Korean and Hungarian names, and exactly where
        // a matcher that assumes "first last" splits one person into two.
        existing: "Nguyen Van An",
        known: { employer: "Northwind Systems", title: "Data Engineer", location: "Austin, TX" },
        agency: "NorthStar Talent",
        position: "POS-004",
        hoursAgo: 26,
        incoming: {
          candidate_name: "An Nguyen",
          email: "an.nguyen@example.com",
          phone: "+1 512 555 0188",
          current_employer: "Northwind",
          current_title: "Analytics Engineer",
          location: "Austin, TX",
        },
      },
    ];
    let parked = 0;
    for (const m of NEAR_MISSES) {
      const existing = await prisma.candidate.findFirst({
        where: { organizationId: org.id, displayName: m.existing },
        include: { identities: { where: { kind: "email" }, take: 1 } },
      });
      const vo = await vendorOrgNamed(m.agency);
      const pos = await positionRef(m.position);
      const vu = vo?.vendor.vendorUsers[0];
      if (!existing || !vo || !pos || !vu) continue;
      await prisma.candidate.update({
        where: { id: existing.id },
        data: {
          currentEmployer: m.known.employer,
          currentTitle: m.known.title,
          location: m.known.location,
        },
      });
      const local = (e?: string | null) => (e ? e.split("@")[0]! : null);
      const fuzzy = scorePair(
        {
          name: existing.displayName,
          emailLocal: local(existing.identities[0]?.valueNorm),
          employer: m.known.employer,
          title: m.known.title,
          location: m.known.location,
        },
        {
          name: m.incoming.candidate_name,
          emailLocal: local(m.incoming.email),
          employer: m.incoming.current_employer,
          title: m.incoming.current_title,
          location: m.incoming.location,
        },
      );
      if (fuzzy.score < T_REVIEW || fuzzy.score >= T_AUTO) {
        console.warn(`  skipped near-miss ${m.incoming.candidate_name}: score ${fuzzy.score} is outside the review band`);
        continue;
      }
      const at = new Date(Date.now() - m.hoursAgo * 3_600_000);
      const sub = await prisma.submission.create({
        data: {
          organizationId: org.id,
          positionId: pos.id,
          vendorOrgId: vo.id,
          vendorUserId: vu.id,
          rawProfile: m.incoming,
          status: "pending_review",
          consentConfirmed: true,
          receivedAt: at,
        },
      });
      await prisma.matchReviewItem.create({
        data: {
          organizationId: org.id,
          submissionId: sub.id,
          candidateIdSuggested: existing.id,
          score: fuzzy.score,
          featureBreakdown: fuzzy.breakdown as unknown as object,
          createdAt: at,
        },
      });
      parked++;
    }
    console.log(`Seeded ${parked} near-miss submissions into the match review queue`);
  }

  // --- History. Everything above was created "now", so every card on the
  // board read "<1h", every stage dwelled 0.0 days, the median time to offer
  // was 0d, and time to first submission was blank (each role was released
  // after the submissions against it). This block runs LAST, after every step
  // that picks candidates by creation order, so it cannot change who was
  // interviewed, rejected or hired — only when those things happened.
  //
  // Guarded on there being no stage history yet, so a second run is a no-op.
  const hasHistory = await prisma.stageTransition.count({ where: { organizationId: org.id } });
  if (hasHistory === 0) {
    const HOUR = 3_600_000;
    const now = Date.now();
    const STAGES = ["submitted", "screening", "interviewing", "offer"];
    const recruiter = await prisma.orgUser.findFirst({
      where: { organizationId: org.id, email: "recruiter@acme.test" },
      select: { id: true },
    });
    const apps = await prisma.application.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      include: {
        interviews: { select: { scheduledAt: true } },
        decision: { select: { id: true, outcome: true } },
        offer: { select: { id: true, acceptedAt: true } },
      },
    });
    // The application only carries the submission's id; look the dates up.
    const receivedById = new Map(
      (
        await prisma.submission.findMany({
          where: { organizationId: org.id },
          select: { id: true, receivedAt: true },
        })
      ).map((x) => [x.id, x.receivedAt.getTime()]),
    );
    // Direct applicants have no submission to date them; give them a spread.
    const DIRECT_AGE_DAYS = [8, 6.5, 5, 3.5, 2.5, 1.5];
    let directSeen = 0;

    for (const a of apps) {
      const backdated = a.createdAt.getTime() < now - HOUR; // set on purpose above
      const received = a.sourceSubmissionId ? receivedById.get(a.sourceSubmissionId) : undefined;
      let base =
        received ?? now - DIRECT_AGE_DAYS[directSeen++ % DIRECT_AGE_DAYS.length]! * 24 * HOUR;
      const path = STAGES.slice(1, STAGES.indexOf(a.currentStage) + 1);

      // Waiting for a first screen. Compress the age into the last day or so:
      // the corpus spans nine days, and nine-day-old unscreened candidates
      // would put most of the board in breach. Order is preserved.
      if (!backdated && path.length === 0 && a.status === "active") {
        const age = now - base;
        base = now - (2 * HOUR + (age / (9 * 24 * HOUR)) * 28 * HOUR);
        // The dashboard ages this queue from the submission, the board from
        // the application; both must tell the same story.
        if (a.sourceSubmissionId) {
          await prisma.submission.update({
            where: { id: a.sourceSubmissionId },
            data: { receivedAt: new Date(base) },
          });
        }
      }
      if (backdated) base = Math.min(base, a.createdAt.getTime() - path.length * 12 * HOUR);

      // Stage entries spread across the time this person has been in play.
      // Someone still in process entered their CURRENT stage recently — a few
      // hours to a day and a half ago — or most of the board would read as
      // breached; the deliberate breaches are the backdated rows above and
      // the real overdue decision. Closed applications keep an even spread.
      const span = now - base;
      const active = a.status === "active";
      const current = active ? now - (6 + ((apps.indexOf(a) * 7) % 30)) * HOUR : 0;
      const times = path.map((_, j) =>
        active && current > base
          ? path.length === 1
            ? current
            : base + (current - base) * (0.35 + (0.65 * j) / (path.length - 1))
          : base + span * (0.25 + (0.5 * j) / Math.max(path.length, 1)),
      );
      if (backdated && times.length) times[times.length - 1] = a.createdAt.getTime();

      // Nobody is interviewed before they reach interviewing, and nobody gets
      // an offer before their interview.
      const firstIv = Math.min(...a.interviews.map((i) => i.scheduledAt.getTime()));
      const lastIv = Math.max(...a.interviews.map((i) => i.scheduledAt.getTime()));
      const ivIdx = path.indexOf("interviewing");
      if (a.interviews.length && ivIdx >= 0 && times[ivIdx]! > firstIv - 18 * HOUR) {
        times[ivIdx] = firstIv - 18 * HOUR;
        for (let j = ivIdx - 1; j >= 0; j--) {
          times[j] = Math.min(times[j]!, base + ((times[j + 1]! - base) * (j + 1)) / (j + 2));
        }
        base = Math.min(base, times[0]! - 6 * HOUR);
      }
      const offerIdx = path.indexOf("offer");
      if (a.interviews.length && offerIdx >= 0) {
        times[offerIdx] = Math.min(Math.max(times[offerIdx]!, lastIv + 6 * HOUR), now - HOUR);
      }

      let from = "submitted";
      for (const [j, to] of path.entries()) {
        await prisma.stageTransition.create({
          data: {
            organizationId: org.id,
            applicationId: a.id,
            fromStage: from,
            toStage: to,
            byId: recruiter?.id ?? admin.id,
            at: new Date(times[j]!),
          },
        });
        from = to;
      }

      const lastMove = times.length ? times[times.length - 1]! : base;
      if (a.decision) {
        const decidedAt =
          a.decision.outcome === "offer" && offerIdx >= 0
            ? times[offerIdx]!
            : Math.max(lastMove + (now - lastMove) * 0.6, a.interviews.length ? lastIv + 2 * HOUR : 0);
        await prisma.decision.update({
          where: { id: a.decision.id },
          data: { decidedAt: new Date(Math.min(decidedAt, now - HOUR)) },
        });
        if (a.offer) {
          const extended = Math.min(decidedAt, now - 2 * HOUR);
          await prisma.offer.update({
            where: { id: a.offer.id },
            data: {
              extendedAt: new Date(extended),
              ...(a.offer.acceptedAt ? { acceptedAt: new Date(extended + (now - extended) * 0.5) } : {}),
            },
          });
        }
      }
      if (!backdated || base < a.createdAt.getTime()) {
        await prisma.application.update({ where: { id: a.id }, data: { createdAt: new Date(base) } });
      }
    }

    // Duplicate contests wait on a recruiter too. Compressed the same way,
    // oldest first, so one or two read as overdue rather than all six.
    const dupes = await prisma.submission.findMany({
      where: { organizationId: org.id, status: "duplicate" },
      orderBy: { receivedAt: "asc" },
      select: { id: true, receivedAt: true },
    });
    for (const [k, d] of dupes.entries()) {
      const age = now - d.receivedAt.getTime();
      // The agency-acknowledgement clock is 24h, so the rest stay inside it.
      const squeezed = k === 0 ? Math.min(age, 3 * 24 * HOUR) : 2 * HOUR + (age / (9 * 24 * HOUR)) * 18 * HOUR;
      await prisma.submission.update({
        where: { id: d.id },
        data: { receivedAt: new Date(now - squeezed) },
      });
    }

    // Roles were published, and released, before anyone submitted to them.
    const positions = await prisma.position.findMany({
      where: { organizationId: org.id },
      include: {
        submissions: { select: { receivedAt: true }, orderBy: { receivedAt: "asc" }, take: 1 },
        applications: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 },
        releases: true,
      },
    });
    for (const p of positions) {
      const firstSeen = Math.min(
        p.submissions[0]?.receivedAt.getTime() ?? now,
        p.applications[0]?.createdAt.getTime() ?? now,
      );
      const published = firstSeen - 2 * 24 * HOUR;
      const hybrid = p.sourcingMode === "hybrid";
      await prisma.position.update({
        where: { id: p.id },
        data: {
          publishedAt: new Date(published),
          // Hybrid: one day of direct-only head start, then agencies, so the
          // first agency submission lands after the window opened.
          ...(hybrid ? { vendorOpensAt: new Date(published + 24 * HOUR) } : {}),
        },
      });
      for (const r of p.releases) {
        const future = r.visibleFrom.getTime() > now + HOUR;
        await prisma.positionVendorRelease.update({
          where: { id: r.id },
          // A tier still waiting stays waiting, a few days out, so the ladder
          // is visible on the public demo; the nightly reset moves it with it.
          data: { visibleFrom: new Date(future ? now + 3 * 24 * HOUR : published) },
        });
      }
    }
    console.log(`Seeded stage history for ${apps.length} applications; roles published before their first submission`);
  }

  void hireWorks; // referenced in docs above
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
