-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "org_unit_kind" AS ENUM ('unit', 'team');

-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('org_admin', 'recruiter', 'hiring_manager', 'interviewer');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "vendor_status" AS ENUM ('invited', 'active', 'suspended', 'terminated');

-- CreateEnum
CREATE TYPE "vendor_role" AS ENUM ('vendor_admin', 'vendor_recruiter');

-- CreateEnum
CREATE TYPE "position_status" AS ENUM ('draft', 'open', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "release_mode" AS ENUM ('all_at_once', 'tiered', 'manual');

-- CreateEnum
CREATE TYPE "release_source" AS ENUM ('policy', 'manual');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "kind" "org_unit_kind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_user" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_membership" (
    "id" UUID NOT NULL,
    "org_user_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "role" "org_role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_org" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "status" "vendor_status" NOT NULL DEFAULT 'invited',
    "contract_start" TIMESTAMP(3),
    "contract_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_user" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "vendor_role" NOT NULL DEFAULT 'vendor_recruiter',
    "status" "user_status" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "status" "position_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_policy" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "mode" "release_mode" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_vendor_release" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "vendor_org_id" UUID NOT NULL,
    "visible_from" TIMESTAMP(3) NOT NULL,
    "source" "release_source" NOT NULL DEFAULT 'policy',
    "released_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_vendor_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID,
    "event" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "request_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "org_unit_organization_id_parent_id_idx" ON "org_unit"("organization_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_organization_id_parent_id_name_key" ON "org_unit"("organization_id", "parent_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "org_user_organization_id_email_key" ON "org_user"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "org_membership_org_user_id_org_unit_id_role_key" ON "org_membership"("org_user_id", "org_unit_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_org_vendor_id_organization_id_key" ON "vendor_org"("vendor_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_user_vendor_id_email_key" ON "vendor_user"("vendor_id", "email");

-- CreateIndex
CREATE INDEX "position_organization_id_status_idx" ON "position"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "release_policy_position_id_key" ON "release_policy"("position_id");

-- CreateIndex
CREATE INDEX "position_vendor_release_vendor_org_id_visible_from_idx" ON "position_vendor_release"("vendor_org_id", "visible_from");

-- CreateIndex
CREATE UNIQUE INDEX "position_vendor_release_position_id_vendor_org_id_key" ON "position_vendor_release"("position_id", "vendor_org_id");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_entity_type_entity_id_idx" ON "audit_log"("organization_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_user" ADD CONSTRAINT "org_user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_org_user_id_fkey" FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_org" ADD CONSTRAINT "vendor_org_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_org" ADD CONSTRAINT "vendor_org_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_user" ADD CONSTRAINT "vendor_user_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policy" ADD CONSTRAINT "release_policy_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_vendor_release" ADD CONSTRAINT "position_vendor_release_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_vendor_release" ADD CONSTRAINT "position_vendor_release_vendor_org_id_fkey" FOREIGN KEY ("vendor_org_id") REFERENCES "vendor_org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

