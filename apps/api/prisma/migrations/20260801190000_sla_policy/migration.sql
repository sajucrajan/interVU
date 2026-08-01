-- How long a piece of work may sit before it is late. sla_state is derived at
-- query time (ok / aging past 70% / breached), never stored, so changing a
-- threshold re-colours everything immediately.
CREATE TABLE "sla_policy" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "threshold_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sla_policy_organization_id_event_key"
    ON "sla_policy"("organization_id", "event");

ALTER TABLE "sla_policy" ADD CONSTRAINT "sla_policy_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defaults for every existing organization; these are editable per org.
INSERT INTO "sla_policy" ("id","organization_id","event","threshold_hours","updated_at")
SELECT gen_random_uuid(), o.id, d.event, d.hours, CURRENT_TIMESTAMP
FROM "organization" o
CROSS JOIN (VALUES
    ('first_screen', 48),
    ('scorecard_due', 24),
    ('decision_due', 72),
    ('vendor_ack', 24)
) AS d(event, hours);
