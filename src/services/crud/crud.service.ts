import type { Model, PopulateOptions, SortOrder } from "mongoose";
import type { ZodType } from "zod";
import { ApiError } from "../../utils/ApiError.js";
import { assertObjectId, escapeRegex, slugify } from "../../utils/helpers.js";
import type { ListQuery } from "../../validations/common.js";
import type { PaginationMeta } from "../../utils/response.js";
import type { PermissionModule } from "../../config/permissions.js";
import type { TranslatableType } from "../translation/registry.js";
import { deleteTranslationsFor } from "../translation/translation.service.js";

type AnyRecord = Record<string, unknown>;

export interface ResourceConfig {
  /** Machine name used for activity logs and translations, e.g. "tour". */
  name: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  permission: PermissionModule;
  createSchema: ZodType;
  updateSchema: ZodType;
  /** Fields searched with ?search= (case-insensitive, regex-escaped). */
  searchFields: string[];
  /** Field the slug is generated from, if the model has a slug. */
  slugFrom?: string;
  /** Extra uniqueness scope for slugs (e.g. category kind). */
  slugScope?: string[];
  defaultSort: Record<string, SortOrder>;
  /** Whitelisted query-string filters mapped to model fields. */
  filters?: Partial<Record<keyof ListQuery, string>>;
  populate?: PopulateOptions[];
  /** Projection for list views (omit heavy fields). */
  listSelect?: string;
  cacheTags: string[];
  translatable?: TranslatableType;
  /** "status" (draft/published) or "enabled" (on/off). */
  publishField?: "status" | "enabled";
  /** Fields copied with "(Copy)" suffix on duplicate. */
  duplicateTitleField?: string;
  /** Throw to refuse a delete (e.g. a record the site cannot work without). */
  beforeDelete?: (doc: AnyRecord) => void | Promise<void>;
  /** Removes references to a deleted record from other content so nothing points at a missing document. */
  onDelete?: (id: string) => Promise<void>;
  /** Extra cache tags to refresh after a delete (content touched by onDelete). */
  deleteCacheTags?: string[];
}

export class CrudService {
  constructor(readonly cfg: ResourceConfig) {}

  private get model() {
    return this.cfg.model;
  }

  private buildFilter(q: Partial<ListQuery>): AnyRecord {
    const filter: AnyRecord = {};
    if (q.search && this.cfg.searchFields.length) {
      const rx = new RegExp(escapeRegex(q.search), "i");
      filter.$or = this.cfg.searchFields.map((f) => ({ [f]: rx }));
    }
    for (const [queryKey, field] of Object.entries(this.cfg.filters ?? {})) {
      const value = q[queryKey as keyof ListQuery];
      if (value === undefined || value === "" || !field) continue;
      if (queryKey === "featured") filter[field] = value === "true";
      else if (queryKey === "from") filter[field] = { ...(filter[field] as AnyRecord), $gte: value };
      else if (queryKey === "to") filter[field] = { ...(filter[field] as AnyRecord), $lte: value };
      else filter[field] = value;
    }
    return filter;
  }

  private parseSort(sort?: string): Record<string, SortOrder> {
    if (!sort) return this.cfg.defaultSort;
    const desc = sort.startsWith("-");
    const field = desc ? sort.slice(1) : sort;
    // Only allow sorting on top-level schema paths to avoid arbitrary field probing.
    if (!this.model.schema.path(field) && field !== "createdAt" && field !== "updatedAt") return this.cfg.defaultSort;
    return { [field]: desc ? -1 : 1, _id: -1 };
  }

  async list(q: Partial<ListQuery>): Promise<{ items: AnyRecord[]; meta: PaginationMeta }> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const filter = this.buildFilter(q);
    let query = this.model
      .find(filter)
      .sort(this.parseSort(q.sort))
      .skip((page - 1) * limit)
      .limit(limit);
    if (this.cfg.listSelect) query = query.select(this.cfg.listSelect);
    for (const p of this.cfg.populate ?? []) query = query.populate(p);
    const [items, total] = await Promise.all([query.lean(), this.model.countDocuments(filter)]);
    return { items: items as AnyRecord[], meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getById(id: string): Promise<AnyRecord> {
    assertObjectId(id);
    const doc = await this.model.findById(id).lean();
    if (!doc) throw ApiError.notFound(`${this.cfg.label} item not found`);
    return doc as AnyRecord;
  }

  private async uniqueSlug(base: string, data: AnyRecord, excludeId?: string): Promise<string> {
    const root = slugify(base);
    const scope = Object.fromEntries((this.cfg.slugScope ?? []).map((k) => [k, data[k]]));
    let candidate = root;
    for (let i = 2; i < 500; i++) {
      const clash = await this.model.exists({ ...scope, slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
      if (!clash) return candidate;
      candidate = `${root}-${i}`;
    }
    throw ApiError.conflict("Could not generate a unique slug");
  }

  async create(input: AnyRecord, userId?: string): Promise<AnyRecord> {
    const data: AnyRecord = { ...input };
    if (this.cfg.slugFrom) {
      const explicit = typeof data.slug === "string" && data.slug.length > 0;
      data.slug = await this.uniqueSlug(explicit ? String(data.slug) : String(data[this.cfg.slugFrom] ?? ""), data);
    }
    if (this.model.schema.path("createdBy") && userId) {
      data.createdBy = userId;
      data.updatedBy = userId;
    }
    if (data.order === undefined && this.model.schema.path("order")) {
      const last = await this.model.findOne({}).sort({ order: -1 }).select("order").lean<{ order?: number }>();
      data.order = (last?.order ?? 0) + 1;
    }
    const doc = await this.model.create(data);
    return doc.toObject() as AnyRecord;
  }

  async update(id: string, input: AnyRecord, userId?: string): Promise<{ before: AnyRecord; after: AnyRecord }> {
    assertObjectId(id);
    const doc = await this.model.findById(id);
    if (!doc) throw ApiError.notFound(`${this.cfg.label} item not found`);
    const before = doc.toObject() as AnyRecord;
    const data: AnyRecord = { ...input };
    if (this.cfg.slugFrom && "slug" in data) {
      const desired = typeof data.slug === "string" && data.slug ? String(data.slug) : String(data[this.cfg.slugFrom] ?? doc.get(this.cfg.slugFrom));
      data.slug = desired === doc.get("slug") ? desired : await this.uniqueSlug(desired, { ...before, ...data }, id);
    }
    if (this.model.schema.path("updatedBy") && userId) data.updatedBy = userId;
    doc.set(data);
    await doc.save();
    return { before, after: doc.toObject() as AnyRecord };
  }

  async remove(id: string): Promise<AnyRecord> {
    assertObjectId(id);
    const doc = await this.model.findById(id).lean<AnyRecord>();
    if (!doc) throw ApiError.notFound(`${this.cfg.label} item not found`);
    await this.cfg.beforeDelete?.(doc);
    await this.model.deleteOne({ _id: id });
    if (this.cfg.translatable) await deleteTranslationsFor(this.cfg.translatable, id);
    await this.cfg.onDelete?.(id);
    return doc;
  }

  async duplicate(id: string, userId?: string): Promise<AnyRecord> {
    const source = await this.getById(id);
    const copy: AnyRecord = { ...source };
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.__v;
    const titleField = this.cfg.duplicateTitleField ?? this.cfg.slugFrom;
    if (titleField && typeof copy[titleField] === "string") copy[titleField] = `${copy[titleField]} (Copy)`;
    if ("slug" in copy) copy.slug = "";
    if (this.cfg.publishField === "status" && "status" in copy) copy.status = "draft";
    if (this.cfg.publishField === "enabled" && "enabled" in copy) copy.enabled = false;
    if ("featured" in copy) copy.featured = false;
    delete copy.order;
    return this.create(copy, userId);
  }

  async reorder(items: { id: string; order: number }[]): Promise<void> {
    if (!this.model.schema.path("order")) throw ApiError.badRequest("This content type cannot be reordered");
    await this.model.bulkWrite(items.map((i) => ({ updateOne: { filter: { _id: i.id }, update: { $set: { order: i.order } } } })));
  }

  async setStatus(id: string, input: { status?: string; enabled?: boolean; featured?: boolean }, userId?: string) {
    const patch: AnyRecord = {};
    if (input.status !== undefined) {
      const allowed = (this.model.schema.path("status") as unknown as { enumValues?: string[] })?.enumValues;
      if (!allowed) throw ApiError.badRequest("This content type has no status");
      if (!allowed.includes(input.status)) throw ApiError.badRequest(`Status must be one of: ${allowed.join(", ")}`);
      patch.status = input.status;
    }
    if (input.enabled !== undefined) {
      if (!this.model.schema.path("enabled")) throw ApiError.badRequest("This content type cannot be enabled/disabled");
      patch.enabled = input.enabled;
    }
    if (input.featured !== undefined) {
      if (!this.model.schema.path("featured")) throw ApiError.badRequest("This content type cannot be featured");
      patch.featured = input.featured;
    }
    if (Object.keys(patch).length === 0) throw ApiError.badRequest("Nothing to update");
    return this.update(id, patch, userId);
  }
}
