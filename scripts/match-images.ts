/** DRY RUN ONLY – scores every inventoried image against every destination and attraction.
 * Run from backend/ after images:inventory:  npm run images:match [-- --threshold 0.85]
 * Reads scripts/image-inventory.json and content/destinations.json; never connects to MongoDB.
 * Writes scripts/image-match-report.json, prints a table, and creates scripts/image-mapping.json
 * (pre-filled with CONFIDENT matches only) if that file does not exist yet. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreText } from "./image-match-utils.js";
import type { InventoryImage } from "./image-inventory.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY = path.join(HERE, "image-inventory.json");
const CONTENT = path.join(HERE, "../content/destinations.json");
const REPORT = path.join(HERE, "image-match-report.json");
export const MAPPING = path.join(HERE, "image-mapping.json");

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const THRESHOLD = Number(arg("--threshold") ?? 0.85);

interface Target {
  slug: string;
  name: string;
  kind: "destination" | "attraction";
  attraction?: string;
}

interface Candidate {
  imageId: string;
  filename: string;
  url: string;
  score: number;
  reason: string;
}

/** Score = best of file name, title, alt text and tags (alt/tags weighted slightly lower). */
function score(image: InventoryImage, target: Target): { score: number; reason: string } {
  const fields: [string, string, number][] = [
    ["filename", image.filename, 1],
    ["title", image.title, 1],
    ["alt", image.alt, 0.9],
    ["tags", image.tags.join(" "), 0.8],
  ];
  let best = { score: 0, reason: "" };
  for (const [field, text, weight] of fields) {
    if (!text) continue;
    const s = scoreText(text, target.attraction ?? target.name) * weight;
    if (s > best.score) best = { score: Math.round(s * 100) / 100, reason: `${field} "${text}"` };
  }
  return best;
}

function main() {
  if (!fs.existsSync(INVENTORY)) throw new Error("Run `npm run images:inventory` first.");
  const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8")) as { images: InventoryImage[] };
  const content = JSON.parse(fs.readFileSync(CONTENT, "utf8")) as { destinations: { slug: string; name: string; attractions: { name: string }[] }[] };

  const targets: Target[] = content.destinations.flatMap((d) => [
    { slug: d.slug, name: d.name, kind: "destination" as const },
    ...d.attractions.map((a) => ({ slug: d.slug, name: d.name, kind: "attraction" as const, attraction: a.name })),
  ]);

  const results = targets.map((target) => {
    const candidates: Candidate[] = inventory.images
      .map((img) => ({ img, ...score(img, target) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ img, score: s, reason }) => ({ imageId: img.id, filename: img.filename, url: img.url, score: s, reason }));
    const top = candidates[0];
    const group = !top ? "UNMATCHED" : top.score >= THRESHOLD ? "CONFIDENT" : "REVIEW";
    return { ...target, group, best: group === "CONFIDENT" ? top : null, candidates: group === "REVIEW" ? candidates : group === "CONFIDENT" ? [top] : [] };
  });

  const count = (g: string) => results.filter((r) => r.group === g).length;
  const usedImages = new Set(results.filter((r) => r.group === "CONFIDENT").map((r) => r.best!.imageId));
  const report = {
    generatedAt: new Date().toISOString(),
    threshold: THRESHOLD,
    totals: { targets: results.length, confident: count("CONFIDENT"), review: count("REVIEW"), unmatched: count("UNMATCHED"), images: inventory.images.length, imagesUsed: usedImages.size },
    results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  const label = (r: (typeof results)[number]) => (r.attraction ? `${r.slug} › ${r.attraction}` : `${r.slug} (hero)`);
  for (const group of ["CONFIDENT", "REVIEW", "UNMATCHED"]) {
    const rows = results.filter((r) => r.group === group);
    console.log(`\n${group} (${rows.length})`);
    if (group === "UNMATCHED") {
      console.log("  " + rows.map(label).join(", "));
      continue;
    }
    console.table(rows.map((r) => ({ target: label(r), ...Object.fromEntries(r.candidates.map((c, i) => [`#${i + 1}`, `${c.filename} (${c.score})`])) })));
  }
  console.log(`\nReport → ${path.relative(process.cwd(), REPORT)}`);

  if (fs.existsSync(MAPPING)) {
    console.log(`Mapping file already exists – left untouched: ${path.relative(process.cwd(), MAPPING)}`);
    return;
  }
  // Pre-fill only CONFIDENT matches; everything else stays empty for manual review.
  const mapping: Record<string, { hero: string | null; gallery: string[]; attractions: Record<string, string | null> }> = {};
  for (const d of content.destinations) {
    const hero = results.find((r) => r.slug === d.slug && r.kind === "destination" && r.group === "CONFIDENT");
    mapping[d.slug] = {
      hero: hero?.best?.imageId ?? null,
      gallery: [],
      attractions: Object.fromEntries(
        d.attractions.map((a) => {
          const r = results.find((x) => x.slug === d.slug && x.attraction === a.name && x.group === "CONFIDENT");
          return [a.name, r?.best?.imageId ?? null];
        }),
      ),
    };
  }
  fs.writeFileSync(MAPPING, JSON.stringify(mapping, null, 2));
  console.log(`Mapping (CONFIDENT pre-filled, edit before applying) → ${path.relative(process.cwd(), MAPPING)}`);
}

main();
