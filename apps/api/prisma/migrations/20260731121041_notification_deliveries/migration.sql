-- CreateEnum
CREATE TYPE "delivery_channel" AS ENUM ('email', 'slack', 'teams', 'webhook');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('pending', 'delivered', 'dead');

-- CreateTable
CREATE TABLE "notification_delivery" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel" "delivery_channel" NOT NULL,
    "endpoint_id" UUID,
    "target" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_delivery_status_next_attempt_at_idx" ON "notification_delivery"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_delivery_organization_id_created_at_idx" ON "notification_delivery"("organization_id", "created_at");
