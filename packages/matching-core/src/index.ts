export { normalizeEmail, type EmailNormalizeOptions } from "./normalize/email.js";
export { normalizePhone, type NormalizedPhone } from "./normalize/phone.js";
export { normalizeName } from "./normalize/name.js";
export { jaroWinkler } from "./similarity/jaro-winkler.js";
export {
  scorePair,
  WEIGHTS,
  T_AUTO,
  T_REVIEW,
  type CandidateFeatures,
  type MatchFeatureBreakdown,
  type MatchScore,
} from "./score.js";
