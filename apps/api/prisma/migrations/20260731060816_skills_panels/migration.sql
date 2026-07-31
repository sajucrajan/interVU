-- CreateEnum
CREATE TYPE "requirement_level" AS ENUM ('must_have', 'good_to_have');

-- CreateTable
CREATE TABLE "skill" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_norm" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_skill" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" "requirement_level" NOT NULL,

    CONSTRAINT "position_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_skill" (
    "id" UUID NOT NULL,
    "panel_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "panel_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_member" (
    "id" UUID NOT NULL,
    "panel_id" UUID NOT NULL,
    "org_user_id" UUID NOT NULL,

    CONSTRAINT "panel_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_organization_id_name_norm_key" ON "skill"("organization_id", "name_norm");

-- CreateIndex
CREATE UNIQUE INDEX "position_skill_position_id_skill_id_key" ON "position_skill"("position_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "panel_organization_id_name_key" ON "panel"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "panel_skill_panel_id_skill_id_key" ON "panel_skill"("panel_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "panel_member_panel_id_org_user_id_key" ON "panel_member"("panel_id", "org_user_id");

-- AddForeignKey
ALTER TABLE "position_skill" ADD CONSTRAINT "position_skill_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_skill" ADD CONSTRAINT "position_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel" ADD CONSTRAINT "panel_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_skill" ADD CONSTRAINT "panel_skill_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_skill" ADD CONSTRAINT "panel_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_member" ADD CONSTRAINT "panel_member_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_member" ADD CONSTRAINT "panel_member_org_user_id_fkey" FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
