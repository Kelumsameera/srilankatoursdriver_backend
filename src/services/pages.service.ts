import { Page, PageSection } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { assertObjectId } from "../utils/helpers.js";
import { deleteTranslationsFor } from "./translation/translation.service.js";

type AnyRecord = Record<string, unknown>;

export const SYSTEM_PAGES = [
  "home",
  "tours",
  "destinations",
  "excursions",
  "vehicles",
  "tailor-made-tours",
  "gallery",
  "blog",
  "reviews",
  "contact",
  "booking",
  "faqs",
] as const;

export async function listPages() {
  const pages = await Page.find({}).sort({ isSystem: -1, title: 1 }).lean();
  const counts = await PageSection.aggregate<{ _id: unknown; count: number }>([{ $group: { _id: "$page", count: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  return pages.map((p) => ({ ...p, sectionCount: map.get(String(p._id)) ?? 0 }));
}

export async function getPageWithSections(id: string) {
  assertObjectId(id);
  const page = await Page.findById(id).lean();
  if (!page) throw ApiError.notFound("Page not found");
  const sections = await PageSection.find({ page: page._id }).sort({ order: 1 }).lean();
  return { ...page, sections };
}

export async function createPage(data: AnyRecord, userId?: string) {
  if ((SYSTEM_PAGES as readonly string[]).includes(String(data.slug))) throw ApiError.conflict("That slug is reserved for a system page");
  return (await Page.create({ ...data, isSystem: false, createdBy: userId, updatedBy: userId })).toObject();
}

export async function updatePage(id: string, data: AnyRecord, userId?: string) {
  assertObjectId(id);
  const page = await Page.findById(id);
  if (!page) throw ApiError.notFound("Page not found");
  if (page.isSystem && data.slug && data.slug !== page.slug) throw ApiError.badRequest("System page slugs cannot be changed");
  page.set({ ...data, updatedBy: userId });
  await page.save();
  return page.toObject();
}

export async function deletePage(id: string) {
  assertObjectId(id);
  const page = await Page.findById(id);
  if (!page) throw ApiError.notFound("Page not found");
  if (page.isSystem) throw ApiError.badRequest("System pages cannot be deleted – disable their sections instead");
  const sections = await PageSection.find({ page: page._id }).select("_id").lean();
  await PageSection.deleteMany({ page: page._id });
  await Promise.all(sections.map((s) => deleteTranslationsFor("pageSection", String(s._id))));
  await deleteTranslationsFor("page", id);
  await page.deleteOne();
  return page.toObject();
}

/* ───────────── Sections ───────────── */

export async function createSection(pageId: string, data: AnyRecord) {
  assertObjectId(pageId);
  if (!(await Page.exists({ _id: pageId }))) throw ApiError.notFound("Page not found");
  const last = await PageSection.findOne({ page: pageId }).sort({ order: -1 }).select("order").lean();
  const section = new PageSection({ ...data, page: pageId, order: typeof data.order === "number" ? data.order : (last?.order ?? 0) + 1 });
  await section.save();
  return section.toObject();
}

export async function updateSection(pageId: string, sectionId: string, data: AnyRecord) {
  assertObjectId(sectionId);
  const section = await PageSection.findOne({ _id: sectionId, page: pageId });
  if (!section) throw ApiError.notFound("Section not found");
  section.set(data);
  await section.save();
  return section.toObject();
}

export async function deleteSection(pageId: string, sectionId: string) {
  assertObjectId(sectionId);
  const section = await PageSection.findOneAndDelete({ _id: sectionId, page: pageId }).lean();
  if (!section) throw ApiError.notFound("Section not found");
  await deleteTranslationsFor("pageSection", sectionId);
  return section;
}

export async function duplicateSection(pageId: string, sectionId: string) {
  assertObjectId(sectionId);
  const section = await PageSection.findOne({ _id: sectionId, page: pageId }).lean();
  if (!section) throw ApiError.notFound("Section not found");
  const { _id, createdAt: _c, updatedAt: _u, ...rest } = section as AnyRecord & { _id: unknown };
  void _id;
  // Shift following sections down to make room right after the original.
  await PageSection.updateMany({ page: pageId, order: { $gt: section.order } }, { $inc: { order: 1 } });
  const copy = new PageSection({ ...rest, name: `${section.name || section.title || section.type} (Copy)`, order: section.order + 1, enabled: false });
  await copy.save();
  return copy.toObject();
}

export async function reorderSections(pageId: string, items: { id: string; order: number }[]) {
  await PageSection.bulkWrite(items.map((i) => ({ updateOne: { filter: { _id: i.id, page: pageId }, update: { $set: { order: i.order } } } })));
}
