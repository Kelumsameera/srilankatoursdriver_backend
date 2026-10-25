import { test } from "node:test";
import assert from "node:assert/strict";
import { originFromFileName, parseRateTable } from "../src/utils/excursion-rates.js";
import { siteSettingsUpdate } from "../src/validations/settings.js";

const sample = [
  "Transfers From",
  "Kandy",
  "Some description\tthat is not a row",
  "Our Rates",
  "Destination\tCar\tVan\tEstimated Duration\tMileage (Km)",
  "Airport\t28,000LKR\t35,000LKR\t3 Hours (Toll Road)\t115Km",
  "Ella\t32,000LKR\t40,000LKR\t4.15 Hours\t140Km\r",
  "Plan Your Transfer with Us",
].join("\n");

test("rate table rows are parsed into numbers, stopping at the end of the table", () => {
  assert.deepEqual(parseRateTable(sample), [
    { destination: "Airport", car: 28000, van: 35000, duration: "3 Hours (Toll Road)", distanceKm: 115 },
    { destination: "Ella", car: 32000, van: 40000, duration: "4.15 Hours", distanceKm: 140 },
  ]);
});

test("a file without the rate table header is rejected", () => {
  assert.throws(() => parseRateTable("Our Rates\nnothing here"), /header not found/);
});

test("origin names come from the file name, with the old site's spellings fixed", () => {
  assert.equal(originFromFileName("Airport (CMB).txt"), "Airport (CMB)");
  assert.equal(originFromFileName("Arugambay.txt"), "Arugam Bay");
  assert.equal(originFromFileName("Thissamaharama (Yala).txt"), "Tissamaharama (Yala)");
});

test("excursion rate tables pass settings validation", () => {
  const result = siteSettingsUpdate.safeParse({
    excursionRates: { enabled: true, currency: "lkr", tables: [{ origin: "Kandy", rows: parseRateTable(sample) }] },
  });
  assert.equal(result.success, true);
  assert.equal(result.data?.excursionRates?.currency, "LKR");
  assert.equal(siteSettingsUpdate.safeParse({ excursionRates: { tables: [{ origin: "", rows: [] }] } }).success, false);
});
