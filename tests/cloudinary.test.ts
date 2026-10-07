import { beforeEach, describe, expect, it, vi } from "vitest";

const uploader = {
  upload: vi.fn(),
  upload_stream: vi.fn(),
  upload_large: vi.fn(),
  destroy: vi.fn(),
};
const api = { resource: vi.fn() };
const config = vi.fn();
const apiSign = vi.fn((params: Record<string, unknown>, secret: string) => `signed(${Object.keys(params).sort().join(",")}|${secret.length})`);

vi.mock("cloudinary", () => ({
  v2: { config, uploader, api, utils: { api_sign_request: apiSign } },
}));

const svc = await import("../src/services/cloudinary/cloudinary.service.js");

const fakeResponse = {
  public_id: "srilankatoursdriver/tours/abc",
  secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/srilankatoursdriver/tours/abc.jpg",
  resource_type: "image",
  format: "jpg",
  width: 1600,
  height: 900,
  bytes: 120_000,
  folder: "srilankatoursdriver/tours",
  original_filename: "abc",
  version: 1,
};

describe("cloudinary service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is configured from backend-only environment variables", () => {
    expect(svc.isCloudinaryConfigured()).toBe(true);
  });

  it("generates a signature without exposing the secret", () => {
    const sig = svc.generateUploadSignature("tours", "image");
    expect(sig.folder).toBe("srilankatoursdriver/tours");
    expect(sig.signature).toContain("allowed_formats,folder,timestamp");
    expect(JSON.stringify(sig)).not.toContain("test-cloudinary-secret");
    expect(sig.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
  });

  it("uploads images into the site folder and maps metadata", async () => {
    uploader.upload.mockResolvedValue(fakeResponse);
    const asset = await svc.uploadImage("/tmp/x.jpg", "tours");
    expect(uploader.upload).toHaveBeenCalledWith("/tmp/x.jpg", expect.objectContaining({ folder: "srilankatoursdriver/tours", resource_type: "image" }));
    expect(asset).toMatchObject({ publicId: fakeResponse.public_id, width: 1600, height: 900, resourceType: "image" });
  });

  it("uploads videos with resource_type video", async () => {
    uploader.upload.mockResolvedValue({ ...fakeResponse, resource_type: "video", duration: 12.5 });
    const asset = await svc.uploadVideo("/tmp/x.mp4", "hero");
    expect(uploader.upload).toHaveBeenCalledWith("/tmp/x.mp4", expect.objectContaining({ resource_type: "video" }));
    expect(asset.duration).toBe(12.5);
  });

  it("deletes only assets inside the site folder", async () => {
    uploader.destroy.mockResolvedValue({ result: "ok" });
    await expect(svc.deleteMedia("srilankatoursdriver/tours/abc", "image")).resolves.toBe(true);
    await expect(svc.deleteMedia("someone-else/file", "image")).rejects.toThrow(/does not belong/);
    await expect(svc.deleteMedia("srilankatoursdriver/../x", "image")).rejects.toThrow();
  });

  it("replaces media keeping the same public id", async () => {
    uploader.upload.mockResolvedValue(fakeResponse);
    await svc.replaceMedia("srilankatoursdriver/tours/abc", "/tmp/new.jpg", "image");
    expect(uploader.upload).toHaveBeenCalledWith(
      "/tmp/new.jpg",
      expect.objectContaining({ public_id: "srilankatoursdriver/tours/abc", overwrite: true, invalidate: true }),
    );
  });
});
