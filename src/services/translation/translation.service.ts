import { Types } from "mongoose";
import { Translation } from "../../models/Translation.js";
import { TranslationJob, type TranslationJobAttrs } from "../../models/TranslationJob.js";
import { isLocale, SOURCE_LOCALE, TARGET_LOCALES, type Locale } from "../../config/locales.js";
import { ApiError } from "../../utils/ApiError.js";
import { assertObjectId, hashFields, setPath, sha256 } from "../../utils/helpers.js";
import { revalidateFrontend } from "../revalidate.service.js";
import { extractFields, isTranslatableType, TRANSLATABLE, type TranslatableType } from "./registry.js";
import { getProviderForLocale } from "./providers.js";
import { logger } from "../../config/logger.js";

/**
 * missing    – no translation yet
 * outdated   – the English source changed after translating (or some fields are untranslated)
 * failed     – the last machine translation attempt failed and the locale is not up to date
 * up_to_date – every field was translated from the current English text
 */
export type TranslationState = "missing" | "outdated" | "failed" | "up_to_date";

/**
 * MongoDB/Mongoose map keys cannot contain "." – field paths such as "itinerary.0.title"
 * are stored with "." encoded as "~" and decoded when read.
 */
const encodeKey = (path: string) => path.replace(/\./g, "~");
const decodeKey = (key: string) => key.replace(/~/g, ".");
function encodeRecord(rec: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [encodeKey(k), v]));
}

function hashMap(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, sha256(v)]));
}

/** Reads a stored map (Map or plain object) back into a path → value record. */
function toRecord(map: unknown): Record<string, string> {
  if (!map) return {};
  const entries = map instanceof Map ? Array.from(map.entries()) : Object.entries(map as Record<string, string>);
  return Object.fromEntries(entries.map(([k, v]) => [decodeKey(String(k)), String(v)]));
}

async function loadSource(entityType: TranslatableType, entityId: string) {
  const cfg = TRANSLATABLE[entityType];
  const doc = await cfg.model.findById(entityId).lean();
  if (!doc) throw ApiError.notFound("Content not found");
  return { cfg, doc, fields: extractFields(doc, cfg.fields) };
}

/* ───────────────────────── Public read path ───────────────────────── */

/** Deep-copies plain objects/arrays while keeping ObjectIds, Dates etc. as-is (structuredClone would break ObjectIds). */
function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clonePlain(v)) as unknown as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, clonePlain(v)])) as T;
  }
  return value;
}

/**
 * Overlays published translations onto lean documents. A field is only replaced when its
 * translation was made from the *current* English text, so outdated translations fall back
 * to English instead of showing stale content.
 */
export async function localize<T extends { _id?: unknown }>(entityType: TranslatableType, docs: T[], locale?: string): Promise<T[]> {
  if (!locale || locale === SOURCE_LOCALE || !isLocale(locale) || docs.length === 0) return docs;
  const cfg = TRANSLATABLE[entityType];
  const ids = docs.map((d) => d._id).filter(Boolean) as Types.ObjectId[];
  const rows = await Translation.find({ entityType, entityId: { $in: ids }, locale, published: true }).lean();
  if (rows.length === 0) return docs;
  const byId = new Map(rows.map((r) => [String(r.entityId), r]));
  return docs.map((doc) => {
    const row = byId.get(String(doc._id));
    if (!row) return doc;
    const translated = toRecord(row.fields);
    const hashes = toRecord(row.sourceHashes);
    const source = extractFields(doc, cfg.fields);
    const copy = clonePlain(doc) as unknown as Record<string, unknown>;
    for (const [path, text] of Object.entries(translated)) {
      const src = source[path];
      if (src === undefined || !text) continue;
      if (hashes[path] && hashes[path] !== sha256(src)) continue; // outdated → keep English
      setPath(copy, path, text);
    }
    return copy as unknown as T;
  });
}

export async function localizeOne<T extends { _id?: unknown }>(entityType: TranslatableType, doc: T | null, locale?: string) {
  if (!doc) return doc;
  const [out] = await localize(entityType, [doc], locale);
  return out;
}

/* ───────────────────────── Admin ───────────────────────── */

export function computeState(
  source: Record<string, string>,
  row?: { sourceHashes?: unknown; fields?: unknown; lastError?: string | null } | null,
): TranslationState {
  if (!row) return Object.keys(source).length === 0 ? "up_to_date" : "missing";
  const hashes = toRecord(row.sourceHashes);
  const fields = toRecord(row.fields);
  const hasAny = Object.keys(fields).length > 0;
  for (const [path, value] of Object.entries(source)) {
    if (!fields[path] || (hashes[path] && hashes[path] !== sha256(value))) {
      if (row.lastError) return "failed";
      return hasAny ? "outdated" : "missing";
    }
  }
  return "up_to_date";
}

/** Translation status matrix for every entity of a type (or all types). */
export async function getStatusOverview(entityType?: string) {
  const types = entityType ? [entityType] : Object.keys(TRANSLATABLE);
  const result: {
    entityType: string;
    label: string;
    items: { entityId: string; title: string; fieldCount: number; locales: Record<string, { state: TranslationState; locked: boolean; published: boolean; origin?: string; lastError?: string }> }[];
  }[] = [];

  for (const type of types) {
    if (!isTranslatableType(type)) throw ApiError.badRequest(`Unknown content type: ${type}`);
    const cfg = TRANSLATABLE[type];
    const docs = await cfg.model.find({}).sort({ order: 1, createdAt: -1 }).limit(500).lean();
    const rows = await Translation.find({ entityType: type, entityId: { $in: docs.map((d) => d._id) } }).lean();
    const index = new Map(rows.map((r) => [`${String(r.entityId)}:${r.locale}`, r]));
    result.push({
      entityType: type,
      label: cfg.label,
      items: docs.map((doc) => {
        const source = extractFields(doc, cfg.fields);
        const locales: Record<string, { state: TranslationState; locked: boolean; published: boolean; origin?: string; lastError?: string }> = {};
        for (const locale of TARGET_LOCALES) {
          const row = index.get(`${String(doc._id)}:${locale}`);
          locales[locale] = {
            state: computeState(source, row),
            locked: Boolean(row?.locked),
            published: row ? row.published !== false : false,
            origin: row?.origin,
            ...(row?.lastError ? { lastError: row.lastError } : {}),
          };
        }
        return {
          entityId: String(doc._id),
          title: String((doc as Record<string, unknown>)[cfg.titleField] ?? "(untitled)"),
          fieldCount: Object.keys(source).length,
          locales,
        };
      }),
    });
  }
  return result;
}

/** Source fields + every locale's translation for one entity (editor view). */
export async function getEntityTranslations(entityType: string, entityId: string) {
  if (!isTranslatableType(entityType)) throw ApiError.badRequest("Unknown content type");
  const { fields } = await loadSource(entityType, entityId);
  const rows = await Translation.find({ entityType, entityId }).lean();
  const byLocale = Object.fromEntries(rows.map((r) => [r.locale, r]));
  return {
    entityType,
    entityId,
    source: fields,
    locales: Object.fromEntries(
      TARGET_LOCALES.map((l) => {
        const row = byLocale[l];
        return [
          l,
          {
            state: computeState(fields, row),
            fields: toRecord(row?.fields),
            locked: Boolean(row?.locked),
            published: row ? row.published !== false : false,
            origin: row?.origin ?? null,
            translatedAt: row?.translatedAt ?? null,
            lastError: row?.lastError || null,
          },
        ];
      }),
    ),
  };
}

interface GenerateOptions {
  entityType: string;
  entityId: string;
  locales?: string[];
  /** true = re-translate every field (regenerate); false = only missing/outdated fields. */
  force?: boolean;
  userId?: string;
}

/** Machine-translates an entity into the requested locales. Locked translations are never touched. */
export async function generateTranslations(opts: GenerateOptions) {
  if (!isTranslatableType(opts.entityType)) throw ApiError.badRequest("Unknown content type");
  const { cfg, fields } = await loadSource(opts.entityType, opts.entityId);
  const locales = (opts.locales?.length ? opts.locales : TARGET_LOCALES).filter(
    (l): l is Locale => isLocale(l) && l !== SOURCE_LOCALE,
  );
  // Resolved up front so a missing provider configuration fails fast (Sinhala uses the free engine).
  const providers = new Map(locales.map((l) => [l, getProviderForLocale(l)]));
  const sourceHashes = hashMap(fields);
  const results: { locale: string; translated: number; skipped?: string; error?: string }[] = [];

  for (const locale of locales) {
    const provider = providers.get(locale)!;
    const existing = await Translation.findOne({ entityType: opts.entityType, entityId: opts.entityId, locale });
    if (existing?.locked) {
      results.push({ locale, translated: 0, skipped: "locked" });
      continue;
    }
    const prevFields = toRecord(existing?.fields);
    const prevHashes = toRecord(existing?.sourceHashes);
    const todo = Object.keys(fields).filter((p) => opts.force || !prevFields[p] || prevHashes[p] !== sourceHashes[p]);
    // Drop translations for fields that no longer exist in the source.
    const kept = Object.fromEntries(Object.entries(prevFields).filter(([p]) => p in fields && !todo.includes(p)));

    try {
      const translated = todo.length ? await provider.translate(todo.map((p) => fields[p]), locale, SOURCE_LOCALE) : [];
      const merged: Record<string, string> = { ...kept };
      todo.forEach((p, i) => (merged[p] = translated[i] ?? ""));
      await Translation.findOneAndUpdate(
        { entityType: opts.entityType, entityId: new Types.ObjectId(opts.entityId), locale },
        {
          $set: {
            fields: encodeRecord(merged),
            sourceHashes: encodeRecord(sourceHashes),
            sourceHash: hashFields(fields),
            origin: existing?.origin === "manual" && !opts.force ? "manual" : "machine",
            provider: provider.name,
            translatedAt: new Date(),
            lastError: "",
            ...(opts.userId ? { updatedBy: opts.userId } : {}),
          },
          $setOnInsert: { locked: false, published: true },
        },
        { upsert: true },
      );
      results.push({ locale, translated: todo.length });
    } catch (err) {
      logger.warn({ err, locale }, "Translation failed");
      const message = (err instanceof Error ? err.message : "Translation failed").slice(0, 300);
      // Remember the failure so the status matrix shows "failed" instead of silently staying "missing".
      await Translation.updateOne(
        { entityType: opts.entityType, entityId: new Types.ObjectId(opts.entityId), locale },
        { $set: { lastError: message, lastErrorAt: new Date() }, $setOnInsert: { locked: false, published: true, origin: "machine", provider: provider.name } },
        { upsert: true },
      ).catch((e: unknown) => logger.warn({ err: e }, "Could not record translation failure"));
      results.push({ locale, translated: 0, error: message });
    }
  }
  revalidateFrontend(cfg.cacheTag);
  return results;
}

/** Manual edit of one locale. Marks the translation as manual and current. */
export async function saveManualTranslation(
  entityType: string,
  entityId: string,
  locale: string,
  input: { fields?: Record<string, string>; locked?: boolean; published?: boolean },
  userId?: string,
) {
  if (!isTranslatableType(entityType)) throw ApiError.badRequest("Unknown content type");
  if (!isLocale(locale) || locale === SOURCE_LOCALE) throw ApiError.badRequest("Invalid locale");
  const { cfg, fields: source } = await loadSource(entityType, entityId);

  const update: Record<string, unknown> = { updatedBy: userId };
  if (input.fields) {
    const clean = Object.fromEntries(
      Object.entries(input.fields)
        .filter(([path, v]) => path in source && typeof v === "string")
        .map(([p, v]) => [p, v.slice(0, 200_000)]),
    );
    update.fields = encodeRecord(clean);
    update.sourceHashes = encodeRecord(hashMap(source));
    update.sourceHash = hashFields(source);
    update.origin = "manual";
    update.translatedAt = new Date();
    update.lastError = "";
  }
  if (typeof input.locked === "boolean") update.locked = input.locked;
  if (typeof input.published === "boolean") update.published = input.published;

  const row = await Translation.findOneAndUpdate(
    { entityType, entityId: new Types.ObjectId(entityId), locale },
    { $set: update },
    { upsert: true, returnDocument: "after" },
  ).lean();
  revalidateFrontend(cfg.cacheTag);
  return row;
}

export async function deleteTranslationsFor(entityType: string, entityId: string) {
  await Translation.deleteMany({ entityType, entityId });
}

/* ───────────────────────── Bulk translation (background job) ───────────────────────── */

/** A job still "running" from before this process started was cut off by a restart. */
const PROCESS_STARTED_AT = new Date();

type JobRecord = TranslationJobAttrs & { _id: unknown; createdAt: Date };

/** The job as the admin UI sees it: a run cut off by a restart is reported as "interrupted". */
function jobView(job: JobRecord) {
  const interrupted = job.status === "running" && job.createdAt < PROCESS_STARTED_AT;
  return {
    id: String(job._id),
    entityType: job.entityType,
    locales: job.locales,
    status: interrupted ? "interrupted" : job.status,
    total: job.total,
    processed: job.processed,
    failed: job.failed,
    error: job.error || null,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt ?? null,
  };
}

/**
 * Starts translating every item of a type that is missing or outdated. Runs in the background
 * (it can take many minutes); poll getBulkTranslationJob for progress. While a job for a type is
 * running, asking again returns that job instead of starting a second one.
 */
export async function startBulkTranslation(entityType: string, locales: string[] | undefined, userId?: string) {
  if (!isTranslatableType(entityType)) throw ApiError.badRequest("Unknown content type");
  const targets = (locales?.length ? locales : TARGET_LOCALES).filter((l): l is Locale => isLocale(l) && l !== SOURCE_LOCALE);
  // getProviderForLocale throws (503) when machine translation isn't configured: fail now, not inside the job.
  for (const locale of targets) getProviderForLocale(locale);

  const running = await TranslationJob.findOne({ entityType, status: "running", createdAt: { $gte: PROCESS_STARTED_AT } }).lean<JobRecord>();
  if (running) return jobView(running);

  const docs = await TRANSLATABLE[entityType].model.find({}).select("_id").limit(500).lean();
  const ids = docs.map((d) => String(d._id));
  const job = await TranslationJob.create({ entityType, locales: targets, total: ids.length, createdBy: userId });
  void runBulkTranslation(String(job._id), entityType, ids, targets, userId);
  return jobView(job.toObject());
}

async function runBulkTranslation(jobId: string, entityType: string, ids: string[], locales: string[], userId?: string) {
  try {
    for (const entityId of ids) {
      let failed = false;
      try {
        await generateTranslations({ entityType, entityId, locales, userId });
      } catch (err) {
        // e.g. the item was deleted while the job ran. Per-locale provider errors are recorded by generateTranslations.
        failed = true;
        logger.warn({ err, entityType, entityId }, "Bulk translation skipped an item");
      }
      await TranslationJob.updateOne({ _id: jobId }, { $inc: { processed: 1, failed: failed ? 1 : 0 } });
    }
    await TranslationJob.updateOne({ _id: jobId }, { status: "done", finishedAt: new Date() });
  } catch (err) {
    logger.error({ err, jobId }, "Bulk translation job failed");
    await TranslationJob.updateOne({ _id: jobId }, { status: "failed", error: (err as Error).message.slice(0, 300), finishedAt: new Date() }).catch(
      () => undefined,
    );
  }
}

export async function getBulkTranslationJob(id: string) {
  assertObjectId(id);
  const job = await TranslationJob.findById(id).lean<JobRecord>();
  if (!job) throw ApiError.notFound("Translation job not found");
  return jobView(job);
}
