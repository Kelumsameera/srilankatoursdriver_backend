// Compares public API responses before and after a code change. READ-ONLY: it only sends GET requests.
//
// 1. Save a snapshot of every public GET endpoint (run once on the old code, once on the new code):
//      npx tsx scripts/compare-api.ts snapshot http://localhost:5000/api "$LOCALAPPDATA/sltd-qa/api-before"
// 2. Compare two saved snapshots:
//      npx tsx scripts/compare-api.ts diff "$LOCALAPPDATA/sltd-qa/api-before" "$LOCALAPPDATA/sltd-qa/api-after"
//
// Detail slugs are taken from the list responses, so both snapshots must be taken against the same database.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// One saved response
interface SavedResponse {
  path: string;
  status: number;
  body: unknown;
}

const LOCALES = ["en", "ar", "de"];
const COLLECTIONS = ["tours", "excursions", "vehicles", "blog", "destinations"];
const LISTS_ONLY = ["gallery", "guest-shorts", "reviews", "faqs"];

// Fixed endpoints: global content, list variations, and the expected 400 / 404 cases
function fixedPaths() {
  const paths = ["/health", "/branding", "/languages", "/sitemap-data", "/reviews/tripadvisor"];

  for (const locale of LOCALES) {
    paths.push(`/site-settings?locale=${locale}`, `/navigation?locale=${locale}`, `/hero?locale=${locale}`);
    paths.push(`/pages/home?locale=${locale}`);
    paths.push(`/seo/home?locale=${locale}`, `/seo/tours?locale=${locale}`);
  }

  for (const kind of ["tour", "destination", "excursion", "vehicle", "blog", "gallery", "faq"]) {
    paths.push(`/categories?kind=${kind}`, `/categories?kind=${kind}&locale=ar`);
  }

  for (const collection of [...COLLECTIONS, ...LISTS_ONLY]) {
    paths.push(`/${collection}`);
    paths.push(`/${collection}?locale=ar`);
    paths.push(`/${collection}?limit=2&page=2`);
    paths.push(`/${collection}?limit=60`);
    paths.push(`/${collection}?featured=true`);
    paths.push(`/${collection}?search=colombo`);
    paths.push(`/${collection}?category=does-not-exist`);
  }
  paths.push("/guest-shorts?platform=youtube", "/reviews?platform=tripadvisor");

  // Expected 400: invalid query or params
  paths.push("/tours?limit=0", "/tours?limit=61", "/tours?page=0", "/tours?page=abc", "/tours?featured=maybe");
  paths.push("/tours?destination=not-an-id", "/excursions?destination=123", "/categories?kind=bogus");
  paths.push("/destinations?locale=toolong", "/seo/bad_key", `/tours/${"x".repeat(161)}`);

  // Expected 404: unknown slugs and routes
  for (const collection of COLLECTIONS) paths.push(`/${collection}/does-not-exist-xyz`);
  paths.push("/destinations/does-not-exist-xyz/nearby", "/pages/does-not-exist-xyz", "/seo/does-not-exist-xyz", "/no-such-route");

  // Expected 401/403: preview without a valid token
  paths.push("/preview/pages/home", "/preview/pages/home?token=invalid");

  return paths;
}

// Detail endpoints, built from the slugs that the list endpoints return
async function detailPaths(baseUrl: string) {
  const paths: string[] = [];

  try {
    const sitemap = (await getJson(baseUrl, "/sitemap-data")).body as { data?: Record<string, { slug: string }[]> };
    const lists = sitemap.data ?? {};

    for (const collection of COLLECTIONS) {
      for (const item of (lists[collection] ?? []).slice(0, 3)) {
        for (const locale of LOCALES) paths.push(`/${collection}/${item.slug}?locale=${locale}`);
      }
    }
    for (const item of (lists.destinations ?? []).slice(0, 2)) {
      paths.push(`/destinations/${item.slug}/nearby`, `/destinations/${item.slug}/nearby?locale=ar&limit=3`);
    }
    for (const page of lists.pages ?? []) paths.push(`/pages/${page.slug}`, `/pages/${page.slug}?locale=ar`);

    // Filter tours and excursions by the first destination id
    const destinations = (await getJson(baseUrl, "/destinations?limit=1")).body as { data?: { _id: string }[] };
    const destinationId = destinations.data?.[0]?._id;
    if (destinationId) paths.push(`/tours?destination=${destinationId}`, `/excursions?destination=${destinationId}`);
  } catch (error) {
    console.error("Could not build detail paths:", error);
  }

  return paths;
}

// GET one endpoint. This is the only place that sends requests, and it only ever uses GET.
async function getJson(baseUrl: string, apiPath: string): Promise<SavedResponse> {
  const response = await fetch(baseUrl + apiPath, { method: "GET", headers: { accept: "application/json" } });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: keep the raw text so a change is still visible
  }
  return { path: apiPath, status: response.status, body: normalise(apiPath, body) };
}

// Sort object keys and remove values that change on every request, so two runs can be compared
function normalise(apiPath: string, body: unknown): unknown {
  if (apiPath === "/health" && body && typeof body === "object") {
    const health = body as { data?: { uptime?: number } };
    if (health.data) health.data.uptime = 0;
  }
  return sortKeys(body);
}

// Recursively sort object keys (array order is kept)
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    return sorted;
  }
  return value;
}

// Turn an API path into a safe file name, e.g. /tours?locale=ar -> tours_locale=ar.json
function fileNameFor(apiPath: string) {
  const safe = apiPath.replace(/^\//, "").replace(/[^a-zA-Z0-9=&.-]+/g, "_");
  return (safe.length > 150 ? safe.slice(0, 150) + "_long" : safe) + ".json";
}

// snapshot mode: call every endpoint and save one JSON file per endpoint
async function snapshot(baseUrl: string, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const paths = [...fixedPaths(), ...(await detailPaths(baseUrl))];
  const statusCounts: Record<number, number> = {};

  for (const apiPath of paths) {
    try {
      const saved = await getJson(baseUrl, apiPath);
      statusCounts[saved.status] = (statusCounts[saved.status] ?? 0) + 1;
      writeFileSync(path.join(outDir, fileNameFor(apiPath)), JSON.stringify(saved, null, 2) + "\n");
    } catch (error) {
      console.error(`Request failed: ${apiPath}`, error);
    }
  }

  console.log(`Saved ${paths.length} responses to ${outDir}`);
  console.log("Status codes:", statusCounts);
}

// diff mode: compare two snapshot folders file by file
function diff(beforeDir: string, afterDir: string) {
  const beforeFiles = new Set(readdirSync(beforeDir).filter((file) => file.endsWith(".json")));
  const afterFiles = new Set(readdirSync(afterDir).filter((file) => file.endsWith(".json")));
  const problems: string[] = [];

  for (const file of beforeFiles) {
    if (!afterFiles.has(file)) {
      problems.push(`missing in after: ${file}`);
      continue;
    }
    const before = readFileSync(path.join(beforeDir, file), "utf8");
    const after = readFileSync(path.join(afterDir, file), "utf8");
    if (before !== after) problems.push(`different: ${file}`);
  }
  for (const file of afterFiles) {
    if (!beforeFiles.has(file)) problems.push(`only in after: ${file}`);
  }

  console.log(`Compared ${beforeFiles.size} responses.`);
  if (problems.length === 0) {
    console.log("All responses are identical.");
    return;
  }
  for (const problem of problems) console.log(problem);
  process.exitCode = 1;
}

// Read the command line and run the chosen mode
async function main() {
  const [mode, first, second] = process.argv.slice(2);

  if (mode === "snapshot" && first && second) return snapshot(first.replace(/\/$/, ""), second);
  if (mode === "diff" && first && second) return diff(first, second);

  console.log("Usage:\n  tsx scripts/compare-api.ts snapshot <baseUrl> <outDir>\n  tsx scripts/compare-api.ts diff <beforeDir> <afterDir>");
  process.exitCode = 1;
}

await main();
