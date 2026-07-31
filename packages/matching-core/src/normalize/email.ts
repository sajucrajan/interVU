export interface EmailNormalizeOptions {
  /**
   * Strip dots from the local part for providers that ignore them
   * (gmail.com / googlemail.com). See docs/04-candidate-matching.md §2.
   * Default: true.
   */
  providerDotStripping?: boolean;
  /** Strip `+tag` suffixes from the local part. Default: true. */
  stripPlusTag?: boolean;
}

const DOT_IGNORING_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const DOMAIN_ALIASES: Record<string, string> = {
  "googlemail.com": "gmail.com",
};

/**
 * Normalize an email address into its canonical matching form.
 * Returns null when the input is not a plausible email address —
 * callers must treat null as "no identifier", never as a match key.
 */
export function normalizeEmail(
  raw: string,
  opts: EmailNormalizeOptions = {},
): string | null {
  const { providerDotStripping = true, stripPlusTag = true } = opts;

  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  domain = DOMAIN_ALIASES[domain] ?? domain;

  if (stripPlusTag) {
    const plus = local.indexOf("+");
    if (plus !== -1) local = local.slice(0, plus);
  }
  if (providerDotStripping && DOT_IGNORING_DOMAINS.has(domain)) {
    local = local.replaceAll(".", "");
  }
  if (local.length === 0) return null;

  return `${local}@${domain}`;
}
