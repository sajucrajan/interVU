-- CreateTable
CREATE TABLE "position_template" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "seniority" "seniority",
    "employment_type" "employment_type" NOT NULL DEFAULT 'full_time',
    "location_policy" "location_policy",
    "location_text" TEXT,
    "min_total_years" INTEGER,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "rate_min" INTEGER,
    "rate_max" INTEGER,
    "rate_currency" TEXT NOT NULL DEFAULT 'USD',
    "rate_period" "rate_period",
    "must_haves" JSONB NOT NULL DEFAULT '[]',
    "org_unit_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_template_skill" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" "requirement_level" NOT NULL,
    "proficiency" "proficiency" NOT NULL DEFAULT 'working',
    "min_years" INTEGER,

    CONSTRAINT "position_template_skill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "position_template_organization_id_name_key" ON "position_template"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "position_template_skill_template_id_skill_id_key" ON "position_template_skill"("template_id", "skill_id");

-- AddForeignKey
ALTER TABLE "position_template" ADD CONSTRAINT "position_template_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_template_skill" ADD CONSTRAINT "position_template_skill_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "position_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_template_skill" ADD CONSTRAINT "position_template_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

