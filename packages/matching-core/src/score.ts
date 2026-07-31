import { jaroWinkler } from "./similarity/jaro-winkler.js";
import { normalizeName } from "./normalize/name.js";

export interface CandidateFeatures {
  name: string;
  emailLocal?: string | null; // local part of normalized email
  employer?: string | null;
  title?: string | null;
  location?: string | null;
}

export interface MatchFeatureBreakdown {
  name: number;
  email_local: number;
  employer: number;
  title: number;
  location: number;
}

export interface MatchScore {
  score: number;
  breakdown: MatchFeatureBreakdown;
}

/**
 * Pairwise probabilistic score (docs/04 §2.4). Weights sum to 1; a feature
 * missing on either side contributes 0 (conservative). Structural guard:
 * name+location alone max out at 0.55 — far below the auto-link threshold —
 * so common-name false merges are impossible by construction.
 */
export const WEIGHTS = {
  name: 0.45,
  email_local: 0.15,
  employer: 0.2,
  title: 0.1,
  location: 0.1,
} as const;

export const T_AUTO = 0.92; // ≥ auto-link
export const T_REVIEW = 0.7; // ≥ human review queue

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(norm(a).split(" "));
  const tb = new Set(norm(b).split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

export function scorePair(a: CandidateFeatures, b: CandidateFeatures): MatchScore {
  const breakdown: MatchFeatureBreakdown = {
    name: jaroWinkler(normalizeName(a.name), normalizeName(b.name)),
    email_local:
      a.emailLocal && b.emailLocal ? jaroWinkler(norm(a.emailLocal), norm(b.emailLocal)) : 0,
    employer:
      a.employer && b.employer
        ? norm(a.employer) === norm(b.employer)
          ? 1
          : tokenOverlap(a.employer, b.employer)
        : 0,
    title: a.title && b.title ? jaroWinkler(norm(a.title), norm(b.title)) : 0,
    location: a.location && b.location ? (norm(a.location) === norm(b.location) ? 1 : 0) : 0,
  };
  const score =
    breakdown.name * WEIGHTS.name +
    breakdown.email_local * WEIGHTS.email_local +
    breakdown.employer * WEIGHTS.employer +
    breakdown.title * WEIGHTS.title +
    breakdown.location * WEIGHTS.location;
  return { score: Math.round(score * 1000) / 1000, breakdown };
}
