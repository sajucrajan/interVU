-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'resume',
    "owner_type" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "parsed_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachment_owner_type_owner_id_idx" ON "attachment"("owner_type", "owner_id");
