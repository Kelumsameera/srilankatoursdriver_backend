import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupPriceFor, type GroupPrice } from "../src/utils/group-price.js";

const data = JSON.parse(readFileSync(new URL("../content/tour-group-prices.json", import.meta.url), "utf8")) as { tours: Record<string, GroupPrice[]> };

test("the price list from the Excel sheet covers 1–10 travellers for every coast package", () => {
  assert.equal(Object.keys(data.tours).length, 10);
  for (const [slug, rows] of Object.entries(data.tours)) {
    assert.deepEqual(rows.map((r) => r.persons), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], slug);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].price >= rows[i - 1].price, `${slug}: price drops at ${rows[i].persons}`);
  }
  assert.deepEqual(groupPriceFor(data.tours["14-days-east-coast"], 1), { persons: 1, price: 1040, vehicle: "Sedan car" });
  assert.deepEqual(groupPriceFor(data.tours["05-days-down-south"], 7), { persons: 7, price: 610, vehicle: "KDH Highroof" });
});

test("no automatic price outside the list", () => {
  assert.equal(groupPriceFor(data.tours["08-days-down-south"], 11), undefined);
  assert.equal(groupPriceFor(undefined, 2), undefined);
  assert.equal(groupPriceFor([], 2), undefined);
});
