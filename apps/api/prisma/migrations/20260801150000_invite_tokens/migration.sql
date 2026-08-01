-- Single-use activation tokens for users who have no password yet.
-- Only the SHA-256 hash is stored, mirroring "session".
CREATE TABLE "invite_token" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_user_id" UUID,
    "vendor_user_id" UUID,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_token_token_hash_key" ON "invite_token"("token_hash");
CREATE INDEX "invite_token_org_user_id_idx" ON "invite_token"("org_user_id");
CREATE INDEX "invite_token_vendor_user_id_idx" ON "invite_token"("vendor_user_id");

ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_org_user_id_fkey"
    FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_vendor_user_id_fkey"
    FOREIGN KEY ("vendor_user_id") REFERENCES "vendor_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
