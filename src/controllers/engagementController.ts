import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { BlogPost, Comment, Customer, Like, Story } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { created, ok } from "../utils/response.js";

/*
 * Likes and comments for blog posts (/engagement/blog/:slug) and guest stories (/engagement/story/:id).
 * Mounted under /api/customer, because the customer's session cookie is only sent there.
 */

// The published blog post or story behind the URL, or a 404 error
async function findTarget(type: string, key: string) {
  if (type === "blog") {
    const post = await BlogPost.findOne({ slug: key, status: "published" }).select("_id").lean();
    if (post) return { targetModel: "BlogPost" as const, target: post._id };
  } else if (type === "story" && mongoose.isValidObjectId(key)) {
    const story = await Story.findOne({ _id: key, status: "published" }).select("_id").lean();
    if (story) return { targetModel: "Story" as const, target: story._id };
  }
  throw ApiError.notFound("Not found");
}

// GET /api/customer/engagement/:type/:key - like count, whether this customer liked it, and the approved comments
export async function getEngagement(req: Request, res: Response, next: NextFunction) {
  try {
    const { target } = await findTarget(String(req.params.type), String(req.params.key));
    const [likes, liked, comments] = await Promise.all([
      Like.countDocuments({ target }),
      req.customer ? Like.exists({ target, customer: req.customer.id }) : null,
      Comment.find({ target, status: "published" }).select("authorName text createdAt").sort({ createdAt: 1 }).limit(200).lean(),
    ]);
    ok(res, { likes, liked: Boolean(liked), comments });
  } catch (error) {
    next(error);
  }
}

// POST /api/customer/engagement/:type/:key/like - like it, or remove the like when it is already liked
export async function toggleLike(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetModel, target } = await findTarget(String(req.params.type), String(req.params.key));
    const customer = req.customer!.id;
    const removed = await Like.findOneAndDelete({ target, customer });
    if (!removed) {
      // upsert: two quick clicks never create two likes
      await Like.updateOne({ target, customer }, { $setOnInsert: { targetModel, target, customer } }, { upsert: true });
    }
    const likes = await Like.countDocuments({ target });
    ok(res, { liked: !removed, likes });
  } catch (error) {
    next(error);
  }
}

// POST /api/customer/engagement/:type/:key/comments - write a comment; it is shown after an admin approves it
export async function addComment(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetModel, target } = await findTarget(String(req.params.type), String(req.params.key));
    const customer = await Customer.findById(req.customer!.id).select("name").lean();
    if (!customer) throw ApiError.unauthorized("Account not found");
    const { text } = req.validated?.body as { text: string };
    await Comment.create({ targetModel, target, customer: customer._id, authorName: customer.name, text, status: "pending" });
    created(res, { status: "pending" }, "Thanks! Your comment will appear after it is approved.");
  } catch (error) {
    next(error);
  }
}
