/**
 * End-to-end Cloudinary check against your real account:
 *   npm run verify:cloudinary
 *
 * Uploads an image and a video, reads their metadata back from Cloudinary, replaces the image,
 * generates an upload signature, then deletes both test assets. Nothing is written to MongoDB.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteMedia,
  generateUploadSignature,
  getResource,
  isCloudinaryConfigured,
  replaceMedia,
  uploadImage,
  uploadVideo,
} from "../services/cloudinary/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (name: string) => path.resolve(here, "../../seed-assets", name);

function step(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${detail ? ` – ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  if (!isCloudinaryConfigured()) {
    step("Cloudinary configured", false, "set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in backend/.env");
    return;
  }
  step("Cloudinary configured", true);

  const image = await uploadImage(asset("logo.png"), "general", { originalName: "verify-logo.png" });
  step("Upload image", Boolean(image.secureUrl), `${image.secureUrl} (${image.width}×${image.height}, ${image.bytes} bytes)`);

  const meta = await getResource(image.publicId, "image");
  step("Read image metadata", meta.width === image.width, `format=${meta.format}`);

  const replaced = await replaceMedia(image.publicId, asset("logo.png"), "image");
  step("Replace image (same public id)", replaced.publicId === image.publicId, `version ${image.version} → ${replaced.version}`);

  const video = await uploadVideo(asset("test-video.mp4"), "general", { originalName: "verify-video.mp4" });
  step("Upload video", Boolean(video.secureUrl), `${video.secureUrl} (${video.duration ?? "?"} s)`);

  const sig = generateUploadSignature("general", "image");
  step("Signed browser upload signature", sig.signature.length > 10 && !JSON.stringify(sig).includes(process.env.CLOUDINARY_API_SECRET ?? "§"), "secret not exposed");

  step("Delete image", await deleteMedia(image.publicId, "image"));
  step("Delete video", await deleteMedia(video.publicId, "video"));
  console.log(process.exitCode ? "\nCloudinary check FAILED" : "\nCloudinary check PASSED");
}

main().catch((err: unknown) => {
  console.error("✘ Cloudinary check failed:", (err as Error).message ?? err);
  process.exit(1);
});
