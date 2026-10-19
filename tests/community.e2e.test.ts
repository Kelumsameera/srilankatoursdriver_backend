import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

/*
 * End-to-end check of the community features through the real Express app and a real MongoDB:
 * customer sign-up, likes, comments, guest stories (upload checks, submit, approve), the feed and clean-up on delete.
 *
 * It needs its own throwaway database and is skipped otherwise, e.g.
 *   COMMUNITY_E2E_MONGODB_URI=mongodb://127.0.0.1:27017/sltd_community_e2e npm test
 * The database is dropped at the start and at the end. Add COMMUNITY_E2E_CLOUDINARY=1 to also upload
 * (and then delete) one tiny real photo in Cloudinary.
 */
const E2E_URI = process.env.COMMUNITY_E2E_MONGODB_URI;
const skip = E2E_URI ? false : "set COMMUNITY_E2E_MONGODB_URI to a throwaway database to run";
if (E2E_URI) {
  if (!/(e2e|test)/i.test(E2E_URI)) throw new Error("COMMUNITY_E2E_MONGODB_URI must name a throwaway database (containing 'e2e' or 'test') – it is dropped");
  // Must be set before the app's config is imported
  process.env.MONGODB_URI = E2E_URI;
  // Only warnings and errors in the test output (no per-request logs)
  process.env.LOG_LEVEL ??= "warn";
}

// Set by before(); the modules are imported only when the test runs, so the env above is used
let base = "";
let close: () => Promise<void> = async () => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let m: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let crud: (key: "comments" | "stories") => any;
let storiesFolder = "";

// A tiny cookie jar: the customer's cookies are sent back on later requests
const jar = new Map<string, string>();
async function call(method: string, url: string, body?: unknown, opts: { auth?: boolean; form?: FormData } = {}) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth !== false && jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(`${base}${url}`, { method, headers, body: opts.form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const [k, ...v] = pair.split("=");
    jar.set(k, v.join("="));
  }
  return { status: res.status, json: (await res.json().catch(() => null)) as { data?: unknown; meta?: { total: number; totalPages: number } } | null };
}

before(async () => {
  if (skip) return;
  const mongoose = (await import("mongoose")).default;
  const { createApp } = await import("../src/app.js");
  const { connectDatabase } = await import("../src/config/db.js");
  const { RESOURCES } = await import("../src/config/resources.js");
  const { CrudService } = await import("../src/services/crud/crud.service.js");
  const { folderPath } = await import("../src/services/cloudinary/index.js");
  m = await import("../src/models/index.js");
  crud = (key) => new CrudService(RESOURCES[key]);
  storiesFolder = folderPath("stories");

  await connectDatabase(E2E_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([m.Like.syncIndexes(), m.Customer.syncIndexes()]);
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
});

after(async () => close());

// A story body whose photo looks like one uploaded through /customer/stories/upload
const photo = (n: number) => ({ publicId: `${storiesFolder}/e2e-${n}`, url: `https://res.cloudinary.com/demo/image/upload/v1/${storiesFolder}/e2e-${n}.jpg`, resourceType: "image" });

test("community: likes, comments, stories, feed and clean-up", { skip }, async () => {
  // A published blog post in a category
  const category = await m.Category.create({ kind: "blog", name: "Destinations", slug: "destinations", enabled: true });
  const post = await m.BlogPost.create({ title: "Kandy guide", slug: "kandy-guide", excerpt: "Temples and lakes", status: "published", category: category._id, publishDate: new Date("2026-01-01") });

  // SIGN-UP (a website customer)
  const reg = await call("POST", "/customer/auth/register", { name: "Anna Tester", email: "anna.e2e@example.com", password: "Travel2026!" });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));

  // LIKES on the blog post
  assert.equal((await call("POST", "/customer/engagement/blog/kandy-guide/like", {}, { auth: false })).status, 401);
  assert.equal((await call("GET", "/customer/engagement/blog/no-such-post")).status, 404);
  let like = await call("POST", "/customer/engagement/blog/kandy-guide/like", {});
  assert.deepEqual(like.json?.data, { liked: true, likes: 1 });
  like = await call("POST", "/customer/engagement/blog/kandy-guide/like", {});
  assert.deepEqual(like.json?.data, { liked: false, likes: 0 });
  await call("POST", "/customer/engagement/blog/kandy-guide/like", {});
  let eng = await call("GET", "/customer/engagement/blog/kandy-guide");
  assert.deepEqual({ likes: (eng.json?.data as { likes: number }).likes, liked: (eng.json?.data as { liked: boolean }).liked }, { likes: 1, liked: true });
  // Anonymous visitors see the count but not "liked"
  eng = await call("GET", "/customer/engagement/blog/kandy-guide", undefined, { auth: false });
  assert.equal((eng.json?.data as { liked: boolean }).liked, false);

  // COMMENTS wait for approval
  assert.equal((await call("POST", "/customer/engagement/blog/kandy-guide/comments", { text: "x" })).status, 400);
  assert.equal((await call("POST", "/customer/engagement/blog/kandy-guide/comments", { text: "Lovely tips, thanks!" })).status, 201);
  eng = await call("GET", "/customer/engagement/blog/kandy-guide");
  assert.equal((eng.json?.data as { comments: unknown[] }).comments.length, 0, "pending comments are hidden");
  const comment = await m.Comment.findOne({ target: post._id }).lean();
  assert.equal(comment.authorName, "Anna Tester");
  assert.equal(comment.status, "pending");
  await crud("comments").setStatus(String(comment._id), { status: "published" });
  eng = await call("GET", "/customer/engagement/blog/kandy-guide");
  assert.deepEqual((eng.json?.data as { comments: { text: string }[] }).comments.map((c) => c.text), ["Lovely tips, thanks!"]);

  // STORY UPLOADS: files are checked before anything reaches Cloudinary
  assert.equal((await call("POST", "/customer/stories/upload", undefined, { form: new FormData() })).status, 400);
  const fake = new FormData();
  fake.append("file", new Blob([Buffer.from("not really an image")], { type: "image/jpeg" }), "photo.jpg");
  assert.equal((await call("POST", "/customer/stories/upload", undefined, { form: fake })).status, 400);
  if (process.env.COMMUNITY_E2E_CLOUDINARY === "1") {
    // 1×1 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const tmp = path.join(os.tmpdir(), "sltd-e2e.png");
    fs.writeFileSync(tmp, png);
    const real = new FormData();
    real.append("file", new Blob([png], { type: "image/png" }), "sltd-e2e.png");
    const up = await call("POST", "/customer/stories/upload", undefined, { form: real });
    fs.unlinkSync(tmp);
    assert.equal(up.status, 201, JSON.stringify(up.json));
    const asset = up.json?.data as { publicId: string; url: string };
    assert.ok(asset.publicId.startsWith(`${storiesFolder}/`));
    const { deleteMedia } = await import("../src/services/cloudinary/index.js");
    assert.equal(await deleteMedia(asset.publicId, "image"), true);
  }

  // STORY SUBMIT: only our own uploads, then pending until an admin publishes it
  const story = { title: "Sunrise at Ella", text: "We climbed Little Adam's Peak at sunrise. Beautiful!", place: "Ella", media: [photo(1)] };
  const foreign = { ...story, media: [{ publicId: "someone-else/x", url: "https://example.com/x.jpg" }] };
  assert.equal((await call("POST", "/customer/stories", foreign)).status, 400);
  assert.equal((await call("POST", "/customer/stories", story, { auth: false })).status, 401);
  const sent = await call("POST", "/customer/stories", story);
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  const storyId = (sent.json?.data as { _id: string })._id;
  assert.equal((await call("GET", "/stories")).json?.meta?.total, 0, "pending stories are hidden");
  assert.equal((await call("GET", `/stories/${storyId}`)).status, 404);
  assert.equal((await call("GET", `/customer/engagement/story/${storyId}`)).status, 404);

  await crud("stories").setStatus(storyId, { status: "published" });
  const published = await m.Story.findById(storyId).lean();
  assert.ok(published.publishedAt, "publishing sets publishedAt");
  assert.equal((await call("GET", `/stories/${storyId}`)).status, 200);
  like = await call("POST", `/customer/engagement/story/${storyId}/like`, {});
  assert.deepEqual(like.json?.data, { liked: true, likes: 1 });
  await call("POST", `/customer/engagement/story/${storyId}/comments`, { text: "Great photo!" });

  // At most 5 stories waiting at once per guest
  for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/customer/stories", { ...story, media: [photo(10 + i)] })).status, 201);
  assert.equal((await call("POST", "/customer/stories", { ...story, media: [photo(20)] })).status, 429);
  const mine = (await call("GET", "/customer/stories")).json?.data as { status: string }[];
  assert.deepEqual(mine.map((s) => s.status).sort(), ["pending", "pending", "pending", "pending", "pending", "published"]);

  // FEED: 12 more published stories (one with a video) + the article, newest first, paged without gaps or repeats
  const extra = Array.from({ length: 12 }, (_, i) => ({
    authorName: "Guest",
    title: i === 3 ? "Whale video" : `Story ${i}`,
    text: "A day out in Sri Lanka",
    media: [i === 3 ? { ...photo(100 + i), resourceType: "video" } : photo(100 + i)],
    status: "published",
    publishedAt: new Date(Date.UTC(2026, 5, 1 + i)),
  }));
  await m.Story.insertMany(extra);
  const seen: string[] = [];
  let page = 1;
  let totalPages: number;
  do {
    const res = await call("GET", `/feed?limit=5&page=${page}`);
    assert.equal(res.status, 200);
    totalPages = res.json!.meta!.totalPages;
    assert.equal(res.json!.meta!.total, 14);
    seen.push(...(res.json!.data as { _id: string }[]).map((i) => i._id));
    page++;
  } while (page <= totalPages);
  assert.equal(seen.length, 14);
  assert.equal(new Set(seen).size, 14, "no post appears twice");
  const first = (await call("GET", "/feed?limit=3")).json!.data as { kind: string; title: string; likeCount: number }[];
  assert.equal(first[0].title, "Sunrise at Ella", "newest first (published just now)");
  assert.equal(first[0].likeCount, 1);
  assert.equal(((await call("GET", "/feed?type=reels")).json!.data as { title: string }[]).map((i) => i.title).join(), "Whale video");
  assert.equal((await call("GET", "/feed?type=photos")).json!.meta!.total, 12);
  assert.equal((await call("GET", "/feed?type=articles")).json!.meta!.total, 1);
  assert.equal((await call("GET", "/feed?category=destinations")).json!.meta!.total, 1);
  assert.equal((await call("GET", "/feed?category=unknown")).json!.meta!.total, 0);
  assert.equal((await call("GET", "/feed?q=ella")).json!.meta!.total, 1);
  assert.equal((await call("GET", "/feed?q=" + encodeURIComponent("(.*"))).status, 200, "search text is escaped");
  assert.equal((await call("GET", "/feed?type=nope")).status, 400);

  // DELETE: a story's likes and comments go with it
  await crud("stories").remove(storyId);
  assert.equal(await m.Like.countDocuments({ target: storyId }), 0);
  assert.equal(await m.Comment.countDocuments({ target: storyId }), 0);
});
