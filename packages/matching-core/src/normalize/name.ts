const HONORIFICS = new Set(["mr", "mrs", "ms", "dr", "prof", "sir", "madam", "shri", "smt"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md"]);

/**
 * Canonical matching form of a person name: NFKC, casefold, strip honorifics/
 * suffixes/punctuation, collapse whitespace, token-sort (docs/04 §2.1).
 */
export function normalizeName(raw: string): string {
  const tokens = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,'"()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t, i, arr) => {
      if (i === 0 && HONORIFICS.has(t)) return false;
      if (i === arr.length - 1 && SUFFIXES.has(t)) return false;
      return true;
    });
  return tokens.sort().join(" ");
}
