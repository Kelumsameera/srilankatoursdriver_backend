import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* Cloudinary is mocked – no network, no real credentials. */
const uploader = { upload: vi.fn(), upload_stream: vi.fn(), upload_large: vi.fn(), destroy: vi.fn() };
const cloudApi = { resource: vi.fn() };
vi.mock("cloudinary", () => ({
  v2: { config: vi.fn(), uploader, api: cloudApi, utils: { api_sign_request: vi.fn(() => "sig") } },
}));

const { startTestDb, stopTestDb } = await import("./helpers/db.js");
const { loginAs, seed } = await import("./helpers/app.js");
const { Media, Tour } = await import("../src/models/index.js");
const { assertSafeSvg, inspectUploadedFile, sniffContent } = await import("../src/middleware/upload.js");
const { generateUploadSignature } = await import("../src/services/cloudinary/index.js");

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d00000000049454e44ae426082", "hex");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(40)]);
const SAFE_SVG = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f3d2e"/><use href="#a"/></svg>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sltd-media-test-"));
function tmpFile(name: string, content: Buffer | string) {
  const p = path.join(tmp, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}
const fileFor = (name: string, mimetype: string, content: Buffer | string, size?: number) => {
  const p = tmpFile(name, content);
  return { path: p, originalname: name, mimetype, size: size ?? fs.statSync(p).size };
};

function cloudResponse(publicId: string, extra: Record<string, unknown> = {}) {
  return {
    public_id: publicId,
    secure_url: `https://res.cloudinary.com/demo-cloud/image/upload/v1/${publicId}.png`,
    resource_type: "image",
    format: "png",
    width: 1,
    height: 1,
    bytes: PNG.length,
    folder: publicId.split("/").slice(0, -1).join("/"),
    original_filename: "x",
    version: 1,
    ...extra,
  };
}

beforeAll(async () => {
  await startTestDb();
  await seed();
});
afterAll(async () => {
  await stopTestDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => vi.clearAllMocks());

describe("upload content validation", () => {
  it("identifies files by their bytes, not their name", () => {
    expect(sniffContent(PNG)).toBe("png");
    expect(sniffContent(JPEG)).toBe("jpeg");
    expect(sniffContent(MP4)).toBe("isobmff");
    expect(sniffContent(Buffer.from(SAFE_SVG))).toBe("svg");
    expect(sniffContent(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffContent(Buffer.from("MZ\x90\x00 executable"))).toBeNull();
  });

  it("accepts a real PNG and rejects disguised or disallowed files", async () => {
    await expect(inspectUploadedFile(fileFor("ok.png", "image/png", PNG), "tours")).resolves.toMatchObject({ resourceType: "image", format: "png" });
    await expect(inspectUploadedFile(fileFor("evil.png", "image/png", "<html><script>alert(1)</script></html>"), "tours")).rejects.toThrow(/not a supported/);
    await expect(inspectUploadedFile(fileFor("photo.jpg", "image/jpeg", PNG), "tours")).rejects.toThrow(/does not match/);
    await expect(inspectUploadedFile(fileFor("tool.exe", "image/png", PNG), "tours")).rejects.toThrow(/extension/);
    await expect(inspectUploadedFile(fileFor("noext", "image/png", PNG), "tours")).rejects.toThrow(/extension/);
    await expect(inspectUploadedFile(fileFor("x.png", "text/html", PNG), "tours")).rejects.toThrow(/unsupported file type/);
  });

  it("enforces per-type size limits", async () => {
    await expect(inspectUploadedFile(fileFor("big.png", "image/png", PNG, 16 * 1024 * 1024), "tours")).rejects.toMatchObject({ statusCode: 413 });
    await expect(inspectUploadedFile(fileFor("clip.mp4", "video/mp4", MP4, 16 * 1024 * 1024), "hero")).resolves.toMatchObject({ resourceType: "video" });
  });

  it("only accepts clean SVGs, and only for branding", async () => {
    await expect(inspectUploadedFile(fileFor("logo.svg", "image/svg+xml", SAFE_SVG), "branding")).resolves.toMatchObject({ format: "svg" });
    await expect(inspectUploadedFile(fileFor("logo.svg", "image/svg+xml", SAFE_SVG), "tours")).rejects.toThrow(/only accepted for branding/);
    const bad = [
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><rect/></a></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="https://evil.example"/></foreignObject></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/track.png"/></svg>`,
      `<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/x.css);</style></svg>`,
    ];
    for (const markup of bad) expect(() => assertSafeSvg(markup), markup).toThrow(/SVG rejected/);
    expect(() => assertSafeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>`)).not.toThrow();
  });

  it("never offers SVG for signed direct browser uploads", () => {
    const sig = generateUploadSignature("branding", "image");
    expect(sig.allowed_formats.split(",")).not.toContain("svg");
    expect(sig.allowed_formats.split(",")).toContain("png");
  });
});

describe("media API", () => {
  it("uploads a valid image server-side and stores only metadata", async () => {
    uploader.upload.mockResolvedValue(cloudResponse("srilankatoursdriver/tours/ok"));
    const admin = await loginAs();
    const res = await admin.post("/api/admin/media/upload").field("folder", "tours").attach("files", PNG, { filename: "ok.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data[0].publicId).toBe("srilankatoursdriver/tours/ok");
    expect(await Media.exists({ publicId: "srilankatoursdriver/tours/ok" })).toBeTruthy();
  });

  it("validates every file before uploading any of them", async () => {
    const admin = await loginAs();
    const res = await admin
      .post("/api/admin/media/upload")
      .field("folder", "tours")
      .attach("files", PNG, { filename: "a.png", contentType: "image/png" })
      .attach("files", Buffer.from("<html></html>"), { filename: "b.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it("removes the Cloudinary asset when saving the record fails (no orphans)", async () => {
    uploader.upload.mockResolvedValue(cloudResponse("srilankatoursdriver/tours/orphan"));
    uploader.destroy.mockResolvedValue({ result: "ok" });
    const spy = vi.spyOn(Media, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("database down");
    });
    const admin = await loginAs();
    const res = await admin.post("/api/admin/media/upload").field("folder", "tours").attach("files", PNG, { filename: "o.png", contentType: "image/png" });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(uploader.destroy).toHaveBeenCalledWith("srilankatoursdriver/tours/orphan", expect.objectContaining({ resource_type: "image" }));
  });

  it("applies the same validation to replacement uploads", async () => {
    const media = await Media.create({ publicId: "srilankatoursdriver/tours/rep", secureUrl: "https://res.cloudinary.com/x.png", resourceType: "image", folder: "srilankatoursdriver/tours" });
    const admin = await loginAs();
    const disguised = await admin.post(`/api/admin/media/${media._id}/replace`).attach("file", Buffer.from("<script>alert(1)</script>"), { filename: "x.png", contentType: "image/png" });
    expect(disguised.status).toBe(400);
    const svg = await admin.post(`/api/admin/media/${media._id}/replace`).attach("file", Buffer.from(SAFE_SVG), { filename: "x.svg", contentType: "image/svg+xml" });
    expect(svg.status).toBe(400); // SVG not allowed outside branding
    const video = await admin.post(`/api/admin/media/${media._id}/replace`).attach("file", MP4, { filename: "x.mp4", contentType: "video/mp4" });
    expect(video.status).toBe(400); // image → video not allowed
    expect(uploader.upload).not.toHaveBeenCalled();

    uploader.upload.mockResolvedValue(cloudResponse("srilankatoursdriver/tours/rep", { version: 2 }));
    const ok = await admin.post(`/api/admin/media/${media._id}/replace`).attach("file", PNG, { filename: "new.png", contentType: "image/png" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.version).toBe(2);
  });

  it("rejects SVG (and deletes it) when registered as a direct upload", async () => {
    cloudApi.resource.mockResolvedValue(cloudResponse("srilankatoursdriver/general/sneaky", { format: "svg" }));
    uploader.destroy.mockResolvedValue({ result: "ok" });
    const admin = await loginAs();
    const res = await admin.post("/api/admin/media").send({ publicId: "srilankatoursdriver/general/sneaky", resourceType: "image" });
    expect(res.status).toBe(400);
    expect(uploader.destroy).toHaveBeenCalled();
    expect(await Media.exists({ publicId: "srilankatoursdriver/general/sneaky" })).toBeNull();
  });

  it("refuses to delete media that content still uses unless forced", async () => {
    const media = await Media.create({ publicId: "srilankatoursdriver/tours/used", secureUrl: "https://res.cloudinary.com/u.png", resourceType: "image", folder: "srilankatoursdriver/tours" });
    await Tour.create({ title: "Uses media", slug: "uses-media", heroMedia: { publicId: "srilankatoursdriver/tours/used", url: "https://res.cloudinary.com/u.png" } });
    uploader.destroy.mockResolvedValue({ result: "ok" });
    const admin = await loginAs();
    const usage = await admin.get(`/api/admin/media/${media._id}/usage`);
    expect(usage.body.data).toEqual([expect.objectContaining({ model: "Tour", label: "Uses media" })]);
    const blocked = await admin.delete(`/api/admin/media/${media._id}`);
    expect(blocked.status).toBe(409);
    expect(uploader.destroy).not.toHaveBeenCalled();
    const forced = await admin.delete(`/api/admin/media/${media._id}?force=true`);
    expect(forced.status).toBe(200);
    expect(uploader.destroy).toHaveBeenCalledTimes(1);
  });

  it("cleans up temp files even when the request fails validation", async () => {
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("sltd-") && !f.startsWith("sltd-media-test")).length;
    const admin = await loginAs();
    const res = await admin.post("/api/admin/media/upload").field("folder", "not-a-folder").attach("files", PNG, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    await new Promise((r) => setTimeout(r, 100));
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("sltd-") && !f.startsWith("sltd-media-test")).length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("returns a clear error instead of crashing when Cloudinary is not configured", async () => {
    const { env } = await import("../src/config/env.js");
    const saved = env.CLOUDINARY_API_SECRET;
    (env as { CLOUDINARY_API_SECRET?: string }).CLOUDINARY_API_SECRET = undefined;
    try {
      const admin = await loginAs();
      const res = await admin.post("/api/admin/media/upload").field("folder", "tours").attach("files", PNG, { filename: "a.png", contentType: "image/png" });
      expect(res.status).toBe(503);
      expect(res.body.message).toMatch(/Cloudinary is not configured/);
      expect(JSON.stringify(res.body)).not.toContain("test-cloudinary-secret");
      expect((await admin.get("/api/admin/media/status")).body.data).toEqual({ configured: false });
    } finally {
      (env as { CLOUDINARY_API_SECRET?: string }).CLOUDINARY_API_SECRET = saved;
    }
  });
});
