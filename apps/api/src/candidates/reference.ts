import type { Prisma } from "@prisma/client";

/**
 * Next human-readable master id for an organization (CM-0428).
 *
 * Same convention as Position.reference. Counting rather than holding a
 * sequence is fine here: references are cosmetic identifiers, and the unique
 * index is what actually guarantees no two candidates share one — a collision
 * under concurrency retries rather than corrupts.
 */
export async function nextCandidateReference(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  const n = await tx.candidate.count({ where: { organizationId } });
  return `CM-${String(n + 1).padStart(4, "0")}`;
}
