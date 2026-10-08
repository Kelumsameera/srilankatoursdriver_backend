import { describe, expect, it } from "vitest";
import { convertPriceText, toUsd } from "../src/services/currency.service.js";

const rates = { USD: 1, LKR: 300, EUR: 0.9 };

describe("USD price conversion", () => {
  it("converts LKR prices and leaves USD / unknown currencies alone", () => {
    expect(toUsd({ price: 42000, currency: "LKR" }, rates)).toEqual({ price: 140, currency: "USD" });
    expect(toUsd({ dailyRate: 55, currency: "USD" }, rates)).toEqual({ dailyRate: 55, currency: "USD" });
    expect(toUsd({ price: 10, currency: "XYZ" }, rates)).toEqual({ price: 10, currency: "XYZ" });
    expect(toUsd({ price: null, currency: "LKR" }, rates)).toEqual({ price: null, currency: "USD" });
  });

  it("rewrites amounts inside price notes", () => {
    expect(convertPriceText("Car LKR 42,000 · Van LKR 50,000 · Bus LKR 65,000 · 290 km", rates)).toBe("Car $140 · Van $167 · Bus $217 · 290 km");
    expect(toUsd({ priceNote: "From USD 50", currency: "USD" }, rates).priceNote).toBe("From USD 50");
  });
});
