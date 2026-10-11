/* eslint-disable no-console */
/**
 * Create a real organization and its first admin (docs/13).
 *
 * The seed builds the Acme demo. This builds YOURS: one organization, the
 * built-in roles, the default ways of working, and one admin who can then
 * invite everyone else from Admin → People & access. Idempotent: run it
 * again to reset the admin's password or to add a second organization.
 *
 *   ORG_NAME="Globex Ltd" ORG_SLUG=globex \
 *   ADMIN_EMAIL=you@globex.example ADMIN_NAME="Your Name" ADMIN_PASSWORD='…' \
 *   tsx prisma/bootstrap.ts
 *
 * In the container image: docker compose --profile setup run --rm bootstrap
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ATTRIBUTES } from "../src/attributes/defaults";
import { hashPassword } from "../src/auth/password";
import { SYSTEM_ROLES } from "../src/entitlements/permissions";

const prisma = new PrismaClient();

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`${name} is required.`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const name = need("ORG_NAME");
  const slug = need("ORG_SLUG").toLowerCase();
  const adminEmail = need("ADMIN_EMAIL").toLowerCase();
  // Optional: a re-run without it keeps the name already on file.
  const givenName = process.env.ADMIN_NAME?.trim() || null;
  const adminName = givenName ?? adminEmail.split("@")[0]!;
  const adminPassword = need("ADMIN_PASSWORD");

  if (!SLUG.test(slug)) {
    console.error("ORG_SLUG must be 1–40 lowercase letters, digits or hyphens (it becomes part of the sign-in).");
    process.exit(2);
  }
  if (!EMAIL.test(adminEmail)) {
    console.error("ADMIN_EMAIL does not look like an email address.");
    process.exit(2);
  }
  if (adminPassword.length < 10) {
    console.error("ADMIN_PASSWORD must be at least 10 characters.");
    process.exit(2);
  }

  const org = await prisma.organization.upsert({
    where: { slug },
    update: { name },
    create: {
      name,
      slug,
      settings: {
        ownership_scope: "position",
        ownership_window_days: 180,
        feedback_visibility: "hidden_until_submitted",
      },
    },
  });

  // The built-in roles every organization starts with (docs/09 §2).
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

  // The default ways of working (docs/01 §4). Only added when the
  // organization has none, so a list an admin has already edited is kept.
  const attributes = await prisma.attribute.count({ where: { organizationId: org.id } });
  if (attributes === 0) {
    await prisma.attribute.createMany({
      data: DEFAULT_ATTRIBUTES.map((a, i) => ({
        organizationId: org.id,
        name: a.name,
        description: a.description,
        behaviours: a.behaviours,
        sortOrder: i,
      })),
    });
  }

  const admin = await prisma.orgUser.upsert({
    where: { organizationId_email: { organizationId: org.id, email: adminEmail } },
    update: {
      ...(givenName ? { name: givenName } : {}),
      status: "active",
      passwordHash: hashPassword(adminPassword),
    },
    create: {
      organizationId: org.id,
      email: adminEmail,
      name: adminName,
      status: "active",
      passwordHash: hashPassword(adminPassword),
    },
  });
  const adminRole = roleByKey.get("org_admin")!;
  const membership = await prisma.orgMembership.findFirst({
    where: { orgUserId: admin.id, roleId: adminRole, orgUnitId: null },
  });
  if (!membership) {
    await prisma.orgMembership.create({
      data: { orgUserId: admin.id, roleId: adminRole, orgUnitId: null },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorType: "system",
      actorId: null,
      event: "org.bootstrapped",
      entityType: "organization",
      entityId: org.id,
      payload: { admin: adminEmail },
    },
  });

  const orgs = await prisma.organization.count();
  console.log(`Organization "${name}" (${slug}) is ready.`);
  console.log(`Admin: ${adminEmail} (${admin.name}).`);
  console.log(
    orgs > 1
      ? `This deployment now has ${orgs} organizations, so the sign-in page asks for the organization: type "${slug}".`
      : "Sign in with that email and password; the organization is picked up automatically.",
  );
  console.log("Next: Admin → People & access to invite your team, Admin → Vendors to add agencies, Positions to post a role.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
