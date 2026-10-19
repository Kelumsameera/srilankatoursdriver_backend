import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { BlogPost, Category, Comment, Like, Story } from "../models/index.js";
import { escapeRegex } from "../utils/helpers.js";
import { ok } from "../utils/response.js";

/** ?type= on the community feed: everything, or only one kind of post */
export const FEED_TYPES = ["all", "stories", "reels", "photos", "articles"] as const;

export const feedQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  q: z.string().trim().max(100).optional(),
  type: z.enum(FEED_TYPES).optional(),
  /** Blog category slug: only articles in that category */
  category: z.string().trim().max(120).optional(),
});

// The fields a feed item needs (lean documents)
type FeedDoc = { _id: unknown; publishDate?: Date; publishedAt?: Date } & Record<string, unknown>;

// Text search on the given fields (case-insensitive, the search words are escaped)
function searchFilter(q: string | undefined, fields: string[]) {
  if (!q) return {};
  const rx = new RegExp(escapeRegex(q), "i");
  return { $or: fields.map((field) => ({ [field]: rx })) };
}

// Like counts and approved-comment counts for a list of posts / stories
async function counts(ids: unknown[]) {
  const [likes, comments] = await Promise.all([
    Like.aggregate<{ _id: unknown; n: number }>([{ $match: { target: { $in: ids } } }, { $group: { _id: "$target", n: { $sum: 1 } } }]),
    Comment.aggregate<{ _id: unknown; n: number }>([{ $match: { target: { $in: ids }, status: "published" } }, { $group: { _id: "$target", n: { $sum: 1 } } }]),
  ]);
  const find = (list: { _id: unknown; n: number }[], id: unknown) => list.find((x) => String(x._id) === String(id))?.n ?? 0;
  return (id: unknown) => ({ likeCount: find(likes, id), commentCount: find(comments, id) });
}

/**
 * GET /api/feed - the community feed: published blog articles and guest stories mixed, newest first.
 * ?type=stories|reels|photos|articles narrows it, ?q= searches titles and text, ?page= for "load more".
 */
export async function getFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 8, q, category } = (req.validated?.query ?? {}) as z.infer<typeof feedQuery>;
    // A blog category only applies to articles
    const type = category ? "articles" : ((req.validated?.query as z.infer<typeof feedQuery>)?.type ?? "all");
    // To build page N of a merged, date-sorted list, take the newest N×limit of each kind, merge, then cut out page N
    const take = page * limit;
    const wantArticles = type === "all" || type === "articles";
    const wantStories = type !== "articles";

    const storyFilter: Record<string, unknown> = { status: "published", ...searchFilter(q, ["title", "text", "place", "authorName"]) };
    if (type === "reels") storyFilter["media.resourceType"] = "video";
    if (type === "photos") storyFilter.media = { $elemMatch: { resourceType: { $ne: "video" } } };
    const articleFilter: Record<string, unknown> = { status: "published", publishDate: { $lte: new Date() }, ...searchFilter(q, ["title", "excerpt", "tags"]) };
    if (category) {
      const found = await Category.findOne({ kind: "blog", slug: category }).select("_id").lean();
      // Unknown category: match nothing rather than everything
      articleFilter.category = found?._id ?? null;
    }

    const [articles, articleTotal, stories, storyTotal] = await Promise.all([
      wantArticles ? BlogPost.find(articleFilter).select("title slug excerpt coverImage author publishDate category readingMinutes").populate("category", "name slug").sort({ publishDate: -1 }).limit(take).lean<FeedDoc[]>() : [],
      wantArticles ? BlogPost.countDocuments(articleFilter) : 0,
      wantStories ? Story.find(storyFilter).select("authorName title text place media featured publishedAt").sort({ publishedAt: -1 }).limit(take).lean<FeedDoc[]>() : [],
      wantStories ? Story.countDocuments(storyFilter) : 0,
    ]);

    const merged = [
      ...articles.map((a) => ({ kind: "article" as const, date: a.publishDate ?? new Date(0), item: a })),
      ...stories.map((s) => ({ kind: "story" as const, date: s.publishedAt ?? new Date(0), item: s })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice((page - 1) * limit, take);

    const countFor = await counts(merged.map((m) => m.item._id));
    const items = merged.map((m) => ({ kind: m.kind, ...m.item, ...countFor(m.item._id) }));
    const total = articleTotal + storyTotal;
    ok(res, items, "OK", 200, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
}
