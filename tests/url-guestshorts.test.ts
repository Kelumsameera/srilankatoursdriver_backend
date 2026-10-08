import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isHttpUrl, isMapEmbedUrl, isPlatformUrl, isSafeHref } from "../src/utils/url.js";
import { guestShortCreate, guestShortUpdate, heroCreate, navigationCreate, sectionCreate } from "../src/validations/content.js";
import { siteSettingsUpdate } from "../src/validations/settings.js";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { loginAs, seed } from "./helpers/app.js";
import { GuestShort } from "../src/models/index.js";

describe("URL safety", () => {
  const dangerous = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "//evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "\\\\evil.com",
    "https://user:pass@evil.com",
    "https://google.com@evil.com",
    "http://",
    "https://",
    "https:///nohost",
    "http://exa mple.com",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "#",
    "tours",
    "mailto:",
    "tel:alert(1)",
  ];
  const legitimate = [
    "/",
    "/tours",
    "/en/contact?ref=footer#map",
    "#faq",
    "https://www.srilankatoursdriver.com/tours",
    "http://localhost:3000/en",
    "https://goo.gl/maps/jyHJkiXsQ3Vz1JTQA",
    "mailto:info@srilankatoursdriver.com",
    "mailto:info@srilankatoursdriver.com?subject=Tour",
    "tel:+94769300334",
    "tel:+94 76 930 0334",
    "whatsapp",
  ];

  it.each(dangerous)("rejects %j as a link", (url) => {
    expect(isSafeHref(url)).toBe(false);
    expect(navigationCreate.safeParse({ label: "x", url }).success).toBe(false);
  });

  it.each(legitimate)("keeps %j working as a link", (url) => {
    expect(isSafeHref(url)).toBe(true);
    expect(navigationCreate.safeParse({ label: "x", url }).success).toBe(true);
  });

  it("applies to buttons, section items and footer links too", () => {
    expect(heroCreate.safeParse({ title: "x", button1: { label: "Go", url: "//evil.com" } }).success).toBe(false);
    expect(sectionCreate.safeParse({ type: "features", items: [{ title: "x", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(
      siteSettingsUpdate.safeParse({ footer: { columns: [{ title: "Links", links: [{ label: "x", url: "data:text/html,hi" }] }] } }).success,
    ).toBe(false);
    expect(siteSettingsUpdate.safeParse({ footer: { privacyUrl: "/privacy-policy" } }).success).toBe(true);
  });

  it("only accepts real http(s) URLs where an absolute URL is required", () => {
    expect(isHttpUrl("https://www.tripadvisor.com/x")).toBe(true);
    expect(isHttpUrl("/relative")).toBe(false);
    expect(isHttpUrl("javascript://example.com/%0Aalert(1)")).toBe(false);
    expect(siteSettingsUpdate.safeParse({ social: { facebook: "javascript:alert(1)" } }).success).toBe(false);
    expect(siteSettingsUpdate.safeParse({ social: { facebook: "https://facebook.com/x" } }).success).toBe(true);
  });

  it("restricts the map iframe to Google Maps / OpenStreetMap over https", () => {
    expect(isMapEmbedUrl("https://www.google.com/maps/embed?pb=!1m18")).toBe(true);
    expect(isMapEmbedUrl("https://www.openstreetmap.org/export/embed.html?bbox=1")).toBe(true);
    expect(isMapEmbedUrl("http://www.google.com/maps/embed?pb=1")).toBe(false);
    expect(isMapEmbedUrl("https://evil.com/maps/embed")).toBe(false);
    expect(siteSettingsUpdate.safeParse({ mapEmbedUrl: "https://evil.com/x" }).success).toBe(false);
    expect(siteSettingsUpdate.safeParse({ mapEmbedUrl: "" }).success).toBe(true);
  });
});

describe("guest short platform rules", () => {
  const video = { url: "https://res.cloudinary.com/demo/video/upload/v1/x.mp4", publicId: "srilankatoursdriver/guest-shorts/x", resourceType: "video" as const };

  it("upload requires an uploaded video and no URL", () => {
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "upload" }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "upload", videoUrl: "https://youtube.com/shorts/abc" }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "upload", uploadedMedia: { ...video, resourceType: "image" } }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "upload", uploadedMedia: video }).success).toBe(true);
  });

  it("youtube / instagram / tiktok require a link on that platform and no upload", () => {
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube" }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube", uploadedMedia: video }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube", videoUrl: "https://youtube.com/shorts/abc" }).success).toBe(true);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube", videoUrl: "https://youtu.be/abc" }).success).toBe(true);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "youtube", videoUrl: "https://evil.com/watch?v=abc" }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "instagram", videoUrl: "https://www.instagram.com/reel/abc/" }).success).toBe(true);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "instagram", videoUrl: "https://www.tiktok.com/@a/video/1" }).success).toBe(false);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "tiktok", videoUrl: "https://www.tiktok.com/@guest/video/123" }).success).toBe(true);
    expect(guestShortCreate.safeParse({ title: "Clip", platform: "tiktok", videoUrl: "http://www.tiktok.com/@guest/video/123" }).success).toBe(false);
    expect(isPlatformUrl("youtube", "https://www.youtube.com.evil.com/shorts/x")).toBe(false);
  });

  it("update validation checks the fields it receives", () => {
    expect(guestShortUpdate.safeParse({ title: "Renamed" }).success).toBe(true);
    expect(guestShortUpdate.safeParse({ platform: "youtube", videoUrl: "https://evil.com/x" }).success).toBe(false);
  });
});

describe("guest short API (merged document is validated on every save)", () => {
  beforeAll(async () => {
    await startTestDb();
    await seed();
  });
  afterAll(stopTestDb);

  it("creates external and uploaded shorts with the right fields only", async () => {
    const admin = await loginAs();
    const yt = await admin.post("/api/admin/guest-shorts").send({ title: "YT", platform: "youtube", videoUrl: "https://youtube.com/shorts/abc" });
    expect(yt.status).toBe(201);
    const up = await admin.post("/api/admin/guest-shorts").send({
      title: "Upload",
      platform: "upload",
      uploadedMedia: { url: "https://res.cloudinary.com/demo/video/upload/v1/x.mp4", publicId: "srilankatoursdriver/guest-shorts/x", resourceType: "video" },
    });
    expect(up.status).toBe(201);
    const missing = await admin.post("/api/admin/guest-shorts").send({ title: "Bad", platform: "upload" });
    expect(missing.status).toBe(400);
    expect(missing.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: "uploadedMedia" })]));
  });

  it("switching platform without supplying the matching field is rejected", async () => {
    const admin = await loginAs();
    const yt = await admin.post("/api/admin/guest-shorts").send({ title: "Switch", platform: "youtube", videoUrl: "https://youtube.com/shorts/abc" });
    const id = yt.body.data._id;
    const toUpload = await admin.put(`/api/admin/guest-shorts/${id}`).send({ platform: "upload" });
    expect(toUpload.status).toBe(400);
    const clearUrl = await admin.put(`/api/admin/guest-shorts/${id}`).send({ videoUrl: "" });
    expect(clearUrl.status).toBe(400);
    expect((await GuestShort.findById(id).lean())?.videoUrl).toBe("https://youtube.com/shorts/abc");
    const toTiktok = await admin.put(`/api/admin/guest-shorts/${id}`).send({ platform: "tiktok", videoUrl: "https://www.tiktok.com/@g/video/1" });
    expect(toTiktok.status).toBe(200);
  });
});
