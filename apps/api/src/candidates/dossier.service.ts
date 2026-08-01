import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const DAY = 86_400_000;

/**
 * feature_breakdown holds two different kinds of thing: per-feature SIMILARITY
 * scores (0..1), and boolean diagnostics about how the match was reached.
 * Only the first kind belongs on a confidence bar — rendering
 * `distinct_candidates_hit` as "100%" claims a contribution it never made.
 */
const SIMILARITY_FEATURES: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email_local", label: "Email" },
  { key: "employer", label: "Employer" },
  { key: "title", label: "Title" },
  { key: "location", label: "Location" },
];

/** Boolean diagnostics, shown as plain statements rather than as bars. */
const SIGNAL_LABELS: Record<string, string> = {
  email_hit: "Matched on email",
  phone_hit: "Matched on phone",
  identity_conflict: "Conflicting identity",
  erased_record_existed: "An erased record matched",
  distinct_candidates_hit: "Matched several candidates",
};

/** How a stored identity came to be attached to this master record. */
function matchMethod(kind: string, valueRaw: string, valueNorm: string): string {
  if (kind === "tombstone") return "erased";
  // Email and phone are matched on an exact normalised value, so they are
  // deterministic. If normalisation had to change the raw value to get there
  // (a +tag, a googlemail alias, punctuation in a number), say so — that is
  // the case reviewers most often want to sanity-check.
  const normalised = valueRaw.trim().toLowerCase() !== valueNorm;
  if (kind === "email" || kind === "phone") {
    return normalised ? "alias-normalised" : "deterministic";
  }
  return "probabilistic";
}

/**
 * The candidate dossier (design option 1f).
 *
 * Cross-team history is the reason InterVU exists, so this assembles the whole
 * picture in one call: who they are, how confident we are that these records
 * are one person, every vendor that has ever submitted them, and what other
 * teams already decided.
 */
@Injectable()
export class DossierService {
  constructor(private readonly prisma: PrismaService) {}

  async dossier(organizationId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
      include: {
        identities: {
          select: { id: true, kind: true, valueRaw: true, valueNorm: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        applications: {
          select: {
            id: true,
            createdAt: true,
            position: { select: { title: true, reference: true } },
            decision: { select: { outcome: true, reason: true, decidedAt: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");

    const [submissions, org, bestMatch, mergeEvents] = await Promise.all([
      this.prisma.submission.findMany({
        where: { candidateId, organizationId },
        select: {
          id: true,
          receivedAt: true,
          status: true,
          ownershipStatus: true,
          vendorOrg: { select: { tier: true, vendor: { select: { name: true } } } },
        },
        orderBy: { receivedAt: "desc" },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      }),
      // The strongest link we have to this master record, and the feature
      // breakdown behind it. Today this is only visible on /match-reviews —
      // it belongs where people actually decide about the person.
      this.prisma.matchDecision.findFirst({
        // A zero score means nothing matched — a NEW candidate, not a weak
        // one. Reporting "0% identity confidence" would read as doubt about a
        // record we were never uncertain about.
        where: { candidateId, score: { gt: 0 } },
        orderBy: { score: "desc" },
        select: { score: true, featureBreakdown: true },
      }),
      this.prisma.mergeEvent.findMany({
        where: { organizationId, survivingCandidateId: candidateId, reversedAt: null },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const windowDays =
      ((org?.settings as { ownership_window_days?: number })?.ownership_window_days) ?? 180;
    const now = Date.now();

    const sources = submissions.map((s) => {
      const expiresAt = new Date(s.receivedAt.getTime() + windowDays * DAY);
      const owns = s.ownershipStatus === "owner";
      return {
        id: s.id,
        vendor: s.vendorOrg.vendor.name,
        tier: s.vendorOrg.tier,
        submitted_at: s.receivedAt,
        /** owns | blocked | expired — what this vendor may still claim. */
        state: owns
          ? expiresAt.getTime() < now
            ? "expired"
            : "owns"
          : s.ownershipStatus === "duplicate"
            ? "blocked"
            : "none",
        window_expires_at: owns ? expiresAt : null,
      };
    });

    // The most recent decision on ANY application, by any team. This is the
    // signal an interviewer most needs before walking into the room.
    const decided = candidate.applications
      .filter((a) => a.decision)
      .sort(
        (a, b) => b.decision!.decidedAt.getTime() - a.decision!.decidedAt.getTime(),
      )[0];

    const features = (bestMatch?.featureBreakdown ?? {}) as Record<string, number>;

    return {
      id: candidate.id,
      reference: candidate.reference,
      display_name: candidate.displayName,
      current_title: candidate.currentTitle,
      current_employer: candidate.currentEmployer,
      location: candidate.location,
      erased: candidate.erasedAt !== null,
      identities_merged: candidate.identities.length,
      vendors: new Set(submissions.map((s) => s.vendorOrg.vendor.name)).size,
      /** 3rd time means three applications, not three submissions. */
      application_count: candidate.applications.length,
      identity_confidence: bestMatch ? Math.round(bestMatch.score * 100) : null,
      identity_features: SIMILARITY_FEATURES.filter(
        (f) => typeof features[f.key] === "number",
      ).map((f) => ({
        key: f.key,
        label: f.label,
        value: Math.round((features[f.key] as number) * 100),
      })),
      /** Diagnostics worth stating, but never as a percentage. */
      identity_signals: Object.keys(SIGNAL_LABELS)
        .filter((k) => Boolean(features[k]))
        .map((k) => ({
          key: k,
          label: SIGNAL_LABELS[k]!,
          tone: k === "identity_conflict" || k === "erased_record_existed" ? "warn" : "ok",
        })),
      identities: candidate.identities.map((i) => ({
        id: i.id,
        kind: i.kind,
        value: i.valueRaw,
        method: matchMethod(i.kind, i.valueRaw, i.valueNorm),
      })),
      sources,
      merge_events: mergeEvents,
      prior_outcome: decided
        ? {
            outcome: decided.decision!.outcome,
            reason: decided.decision!.reason,
            decided_at: decided.decision!.decidedAt,
            position_title: decided.position.title,
            position_reference: decided.position.reference,
          }
        : null,
    };
  }
}
