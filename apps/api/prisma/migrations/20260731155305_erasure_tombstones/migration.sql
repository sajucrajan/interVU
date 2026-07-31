-- AlterEnum
ALTER TYPE "identity_kind" ADD VALUE 'tombstone';

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "erased_at" TIMESTAMP(3);
