/** Name normalisation shared by match-images.ts (pure functions, unit-testable). */

/** Spelling variants and short forms, mapped to the canonical compact form used in slugs. */
const ALIASES: Record<string, string> = {
  nuwaraeliya: "nuwaraeliya",
  nuwara: "nuwaraeliya",
  trinco: "trincomalee",
  arugam: "arugambay",
  arugambay: "arugambay",
  udawalawa: "udawalawe",
  uda: "udawalawe",
  pasikuda: "passikudah",
  pasikudah: "passikudah",
  passekudah: "passikudah",
  sigiri: "sigiriya",
  dambulu: "dambulla",
  hikkadua: "hikkaduwa",
  polonnaruva: "polonnaruwa",
  anuradapura: "anuradhapura",
  kithulgala: "kitulgala",
  sinharajah: "sinharaja",
  yalanationalpark: "yala",
};

/** Words that say nothing about the place (file noise and generic travel terms). */
const STOP = new Set(["img", "image", "photo", "pic", "dsc", "jpg", "jpeg", "png", "webp", "zip", "destinations", "destination", "excursions", "excursion", "tours", "tour", "migrated", "the", "of", "and", "in", "at", "a", "sri", "lanka", "srilanka", "final", "copy", "edit", "new", "old", "web", "hd", "large", "small"]);

export function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "");
}

/** Lower-case word tokens without noise words, numbers or file extensions. */
export function tokens(value: string): string[] {
  return fold(value)
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t) && !/^v\d+$/.test(t));
}

export const compact = (value: string) => {
  const c = tokens(value).join("");
  return ALIASES[c] ?? c;
};

/**
 * How well an image's text describes a target name (0–1).
 * 1 = the image text is exactly the name (any spelling variant). Extra words in the file name lower the score,
 * so "galle-face-green" is only a weak match for "Galle" (it is a Colombo landmark).
 */
export function scoreText(imageText: string, target: string): number {
  const t = tokens(target);
  const i = tokens(imageText);
  if (!t.length || !i.length) return 0;
  if (compact(imageText) === compact(target)) return 1;
  const tc = new Set(t.map((x) => ALIASES[x] ?? x));
  const ic = i.map((x) => ALIASES[x] ?? x);
  const hit = ic.filter((x) => tc.has(x)).length;
  if (!hit) {
    // e.g. "nuwaraeliya-lake" vs "Nuwara Eliya": compare the compact target inside each token.
    const ct = compact(target);
    const joined = ic.find((x) => x === ct);
    return joined ? 1 / ic.length : 0;
  }
  return hit / Math.max(tc.size, ic.length);
}
