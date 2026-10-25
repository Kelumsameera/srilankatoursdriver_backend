/** Parses the "Our Rates" tables of the old site's "Transfers from <origin>" pages (saved as .txt). */

export interface ParsedRateRow {
  destination: string;
  car: number | null;
  van: number | null;
  duration: string;
  distanceKm: number | null;
}

const HEADER = /^Destination\tCar\tVan\tEstimated Duration\tMileage \(Km\)\s*$/;

/** File names that differ from the spelling used in the rate tables themselves. */
const ORIGIN_NAMES: Record<string, string> = {
  Arugambay: "Arugam Bay",
  "Thissamaharama (Yala)": "Tissamaharama (Yala)",
};

export function originFromFileName(fileName: string): string {
  const base = fileName.replace(/\.txt$/i, "").trim();
  return ORIGIN_NAMES[base] ?? base;
}

/** "28,000LKR" → 28000; anything else → null. */
function lkr(value: string): number | null {
  const m = /^([\d,]+)\s*LKR$/i.exec(value.trim());
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Rows of the tab-separated table that follows the "Destination Car Van …" header line. */
export function parseRateTable(text: string): ParsedRateRow[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADER.test(l));
  if (start < 0) throw new Error("Rate table header not found");
  const rows: ParsedRateRow[] = [];
  for (const line of lines.slice(start + 1)) {
    const cells = line.split("\t");
    if (cells.length !== 5) break;
    const [destination, car, van, duration, km] = cells.map((c) => c.trim());
    const distance = /^(\d+(?:\.\d+)?)\s*Km$/i.exec(km);
    rows.push({ destination, car: lkr(car), van: lkr(van), duration, distanceKm: distance ? Number(distance[1]) : null });
  }
  if (!rows.length) throw new Error("Rate table has no rows");
  return rows;
}
