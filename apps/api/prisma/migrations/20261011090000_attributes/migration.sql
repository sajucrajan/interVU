-- Ways of working: org-wide attributes rated on every scorecard (docs/01 §4, Ways of working).
CREATE TABLE "attribute" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "behaviours" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scorecard_attribute" (
    "id" UUID NOT NULL,
    "scorecard_id" UUID NOT NULL,
    "attribute_id" UUID NOT NULL,
    "rating" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scorecard_attribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attribute_organization_id_name_key" ON "attribute"("organization_id", "name");
CREATE INDEX "attribute_organization_id_sort_order_idx" ON "attribute"("organization_id", "sort_order");
CREATE UNIQUE INDEX "scorecard_attribute_scorecard_id_attribute_id_key" ON "scorecard_attribute"("scorecard_id", "attribute_id");

ALTER TABLE "attribute" ADD CONSTRAINT "attribute_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard_attribute" ADD CONSTRAINT "scorecard_attribute_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard_attribute" ADD CONSTRAINT "scorecard_attribute_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
