import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface NormalizedPhone {
  /** E.164 form when the number parses as valid, e.g. "+14155552671". */
  e164: string | null;
  /**
   * Last 10 digits — the fallback blocking key used when vendors submit
   * the same number with/without country code. Null if fewer than 7 digits.
   */
  last10: string | null;
}

/**
 * Normalize a phone number. `defaultRegion` is the org's configured
 * default country (docs/04-candidate-matching.md §2).
 */
export function normalizePhone(
  raw: string,
  defaultRegion: CountryCode = "US",
): NormalizedPhone {
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.length >= 7 ? digits.slice(-10) : null;

  const parsed = parsePhoneNumberFromString(raw, defaultRegion);
  const e164 = parsed?.isValid() ? parsed.number : null;

  return { e164, last10 };
}
