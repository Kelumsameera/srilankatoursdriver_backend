import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { Comment, Customer, Like, Story } from "../models/index.js";
import { inspectUploadedFile } from "../middleware/upload.js";
import { deleteMedia, folderPath, uploadImage, uploadVideo } from "../services/cloudinary/index.js";
import { ApiError } from "../utils/ApiError.js";
import { created, ok } from "../utils/response.js";

// Fields a visitor may see (no customer id)
const PUBLIC_FIELDS = "authorName title text place media featured publishedAt createdAt";
/** A guest can have this many stories waiting for approval at once */
const MAX_PENDING_PER_CUSTOMER = 5;
/** Longest video a guest may upload (seconds) */
export const MAX_GUEST_VIDEO_SECONDS = 60;
/** Largest guest video (bytes) */
const MAX_GUEST_VIDEO_BYTES = 100 * 1024 * 1024;

// Adds likeCount and commentCount (approved comments) to each story
async function withCounts<T extends { _id: unknown }>(stories: T[]) {
  const ids = stories.map((s) => s._id);
  const [likes, comments] = await Promise.all([
    Like.aggregate<{ _id: unknown; n: number }>([{ $match: { target: { $in: ids } } }, { $group: { _id: "$target", n: { $sum: 1 } } }]),
    Comment.aggregate<{ _id: unknown; n: number }>([{ $match: { target: { $in: ids }, status: "published" } }, { $group: { _id: "$target", n: { $sum: 1 } } }]),
  ]);
  const count = (list: { _id: unknown; n: number }[], id: unknown) => list.find((x) => String(x._id) === String(id))?.n ?? 0;
  return stories.map((s) => ({ ...s, likeCount: count(likes, s._id), commentCount: count(comments, s._id) }));
}

/* ───────────── Public ───────────── */

// GET /api/stories - published guest stories, newest first (?page=1&limit=12, ?video=true for reels)
export async function getStories(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const filter: Record<string, unknown> = { status: "published" };
    if (req.query.video === "true") filter["media.resourceType"] = "video";
    const [items, total] = await Promise.all([
      Story.find(filter).select(PUBLIC_FIELDS).sort({ publishedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Story.countDocuments(filter),
    ]);
    ok(res, await withCounts(items), "OK", 200, { page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
}

// GET /api/stories/:id - one published story
export async function getStory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const story = mongoose.isValidObjectId(id) ? await Story.findOne({ _id: id, status: "published" }).select(PUBLIC_FIELDS).lean() : null;
    if (!story) throw ApiError.notFound("Story not found");
    const [withCount] = await withCounts([story]);
    ok(res, withCount);
  } catch (error) {
    next(error);
  }
}

/* ───────────── Signed-in guests ───────────── */

// POST /api/customer/stories/upload - upload one photo or short video for a story (field name "file")
export async function uploadStoryMedia(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw ApiError.badRequest("Choose a photo or video to upload");
    const { resourceType } = await inspectUploadedFile(req.file, "stories");
    if (resourceType === "video" && req.file.size > MAX_GUEST_VIDEO_BYTES) throw ApiError.tooLarge("Videos can be at most 100 MB");
    const asset = resourceType === "video"
      ? await uploadVideo(req.file.path, "stories", { originalName: req.file.originalname })
      : await uploadImage(req.file.path, "stories", { originalName: req.file.originalname });
    if (resourceType === "video" && (asset.duration ?? 0) > MAX_GUEST_VIDEO_SECONDS) {
      // Too long: remove it from Cloudinary again so it does not use storage
      await deleteMedia(asset.publicId, "video").catch(() => undefined);
      throw ApiError.badRequest(`Videos can be at most ${MAX_GUEST_VIDEO_SECONDS} seconds long`);
    }
    created(res, {
      publicId: asset.publicId,
      url: asset.secureUrl,
      resourceType: asset.resourceType,
      format: asset.format,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/customer/stories - share a story; it is shown after an admin approves it
export async function submitStory(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await Customer.findById(req.customer!.id).select("name").lean();
    if (!customer) throw ApiError.unauthorized("Account not found");
    const body = req.validated?.body as { title: string; text: string; place?: string; media: { publicId: string; url: string; resourceType?: "image" | "video" }[] };

    // Only files uploaded through /customer/stories/upload (our own Cloudinary "stories" folder)
    const folder = `${folderPath("stories")}/`;
    for (const item of body.media) {
      if (!item.publicId.startsWith(folder) || item.publicId.includes("..") || !item.url.includes(item.publicId)) {
        throw ApiError.badRequest("Please upload the photos again");
      }
    }
    if (body.media.filter((m) => m.resourceType === "video").length > 1) throw ApiError.badRequest("A story can have one video");

    const pending = await Story.countDocuments({ customer: customer._id, status: "pending" });
    if (pending >= MAX_PENDING_PER_CUSTOMER) throw new ApiError(429, "You already have stories waiting for approval. Please wait until they are reviewed.", [], "TOO_MANY_PENDING");

    const story = await Story.create({ ...body, customer: customer._id, authorName: customer.name, status: "pending" });
    created(res, { _id: story._id, status: "pending" }, "Thanks! Your story will appear after it is approved.");
  } catch (error) {
    next(error);
  }
}

// GET /api/customer/stories - this guest's own stories (any status), so they can see what is pending
export async function myStories(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await Story.find({ customer: req.customer!.id }).select(`${PUBLIC_FIELDS} status`).sort({ createdAt: -1 }).limit(50).lean();
    ok(res, items);
  } catch (error) {
    next(error);
  }
}
