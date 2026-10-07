import { BrandSetting, Language, SiteSetting } from "../models/index.js";
import { LOCALE_META, SUPPORTED_LOCALES } from "../config/locales.js";
import { ApiError } from "../utils/ApiError.js";
import { localizeOne } from "./translation/translation.service.js";

type AnyRecord = Record<string, unknown>;

/** Deep-merges plain objects so partial updates of nested settings don't wipe siblings. */
function deepMerge(target: AnyRecord, patch: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as AnyRecord, v as AnyRecord);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function getSiteSettings(locale?: string) {
  const doc = await SiteSetting.findOne({ key: "default" }).lean();
  if (!doc) throw ApiError.notFound("Site settings have not been initialised. Run `npm run seed`.");
  return localizeOne("siteSetting", doc, locale);
}

export async function updateSiteSettings(patch: AnyRecord) {
  const doc = await SiteSetting.findOne({ key: "default" });
  if (!doc) throw ApiError.notFound("Site settings have not been initialised. Run `npm run seed`.");
  const merged = deepMerge(doc.toObject() as AnyRecord, patch);
  delete merged._id;
  delete merged.__v;
  doc.set(merged);
  await doc.save();
  return doc.toObject();
}

export async function getBranding() {
  const doc = await BrandSetting.findOne({ key: "default" }).lean();
  return doc ?? (await BrandSetting.create({ key: "default" })).toObject();
}

export async function updateBranding(patch: AnyRecord) {
  const doc = (await BrandSetting.findOne({ key: "default" })) ?? new BrandSetting({ key: "default" });
  for (const [k, v] of Object.entries(patch)) {
    if (k === "colors" && v && typeof v === "object") doc.set("colors", { ...(doc.toObject().colors ?? {}), ...(v as AnyRecord) });
    else doc.set(k, v === null ? undefined : v); // null removes a logo
  }
  await doc.save();
  return doc.toObject();
}

export async function listLanguages(onlyEnabled = false) {
  const rows = await Language.find(onlyEnabled ? { enabled: true } : {}).sort({ order: 1 }).lean();
  if (rows.length > 0) return rows;
  // Fallback before seeding: expose all supported locales.
  return SUPPORTED_LOCALES.map((code, i) => ({
    code,
    name: LOCALE_META[code].name,
    nativeName: LOCALE_META[code].nativeName,
    rtl: Boolean(LOCALE_META[code].rtl),
    enabled: true,
    order: i,
  }));
}

export async function updateLanguages(languages: { code: string; enabled: boolean; order?: number }[]) {
  if (!languages.some((l) => l.code === "en" && l.enabled)) throw ApiError.badRequest("English (source language) must stay enabled");
  await Language.bulkWrite(
    languages.map((l) => ({
      updateOne: {
        filter: { code: l.code },
        update: {
          $set: { enabled: l.enabled, ...(l.order !== undefined ? { order: l.order } : {}) },
          $setOnInsert: {
            name: LOCALE_META[l.code as keyof typeof LOCALE_META].name,
            nativeName: LOCALE_META[l.code as keyof typeof LOCALE_META].nativeName,
            rtl: Boolean(LOCALE_META[l.code as keyof typeof LOCALE_META].rtl),
          },
        },
        upsert: true,
      },
    })),
  );
  return listLanguages();
}
