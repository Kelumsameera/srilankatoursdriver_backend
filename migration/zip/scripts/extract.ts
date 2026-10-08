/**
 * Step 1 (read-only): loads the old Next.js site's data modules from ../migrate/data
 * (plain literal exports) and writes them as JSON to migration/zip/raw/.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(process.argv[2] ?? "../migrate");
const OUT = path.resolve("migration/zip/raw");
fs.mkdirSync(OUT, { recursive: true });

async function load(rel: string) {
  const mod = await import(pathToFileURL(path.join(SRC, rel)).href);
  return Object.fromEntries(Object.entries(mod).filter(([k]) => k !== "default" || Object.keys(mod).length === 1));
}

const out: Record<string, unknown> = {};
for (const f of ["contact.ts", "destinations.ts", "excursions.ts", "gallery.ts", "packagePrice.ts", "tours.ts", "drivers.js"]) {
  out[f.replace(/\.(ts|js)$/, "")] = await load(path.join("data", f));
}
for (const dir of ["destinations", "excursions", "packageprices", "tours", "vehicles"]) {
  out[`${dir}/*`] = {};
  for (const f of fs.readdirSync(path.join(SRC, "data", dir)).filter((n) => n.endsWith(".ts"))) {
    (out[`${dir}/*`] as Record<string, unknown>)[f.replace(".ts", "")] = await load(path.join("data", dir, f));
  }
}
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(OUT, `${k.replace("/*", "")}.json`), JSON.stringify(v, null, 2));
const messages: Record<string, unknown> = {};
for (const f of fs.readdirSync(path.join(SRC, "messages"))) messages[f.replace(".json", "")] = JSON.parse(fs.readFileSync(path.join(SRC, "messages", f), "utf8"));
fs.writeFileSync(path.join(OUT, "messages.json"), JSON.stringify(messages, null, 2));
console.log("written:", fs.readdirSync(OUT).join(", "));
