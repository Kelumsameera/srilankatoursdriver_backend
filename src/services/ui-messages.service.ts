import type { Types } from "mongoose";
import { UiMessage } from "../models/index.js";

/** All overrides for one language as { "nav.tours": "…" }. */
export async function listUiMessages(locale: string): Promise<Record<string, string>> {
  const rows = await UiMessage.find({ locale }).select("key value").lean();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Saves the changed keys: non-empty text is stored, empty text deletes the override. Returns the new full list. */
export async function updateUiMessages(locale: string, messages: Record<string, string>, userId?: Types.ObjectId | string) {
  const entries = Object.entries(messages);
  const removed = entries.filter(([, v]) => !v.trim()).map(([k]) => k);
  const saved = entries.filter(([, v]) => v.trim());
  if (saved.length) {
    await UiMessage.bulkWrite(
      saved.map(([key, value]) => ({
        updateOne: { filter: { locale, key }, update: { $set: { value, ...(userId ? { updatedBy: userId } : {}) } }, upsert: true },
      })),
    );
  }
  if (removed.length) await UiMessage.deleteMany({ locale, key: { $in: removed } });
  return listUiMessages(locale);
}
