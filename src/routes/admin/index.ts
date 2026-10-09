import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission as can } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { uploadLimiter } from "../../middleware/security.js";
import { cleanupTempFiles, mediaUpload } from "../../middleware/upload.js";
import { listQuery, noteBody, objectId, reorderSchema } from "../../validations/common.js";
import { pageCreate, pageUpdate, sectionCreate, sectionUpdate } from "../../validations/content.js";
import { brandingUpdate, languageUpdate, siteSettingsUpdate } from "../../validations/settings.js";
import { bookingAdminUpdate, contactAdminUpdate, tailorMadeAdminUpdate } from "../../validations/crm.js";
import { roleCreate, roleUpdate, userCreate, userUpdate } from "../../validations/auth.js";
import { RESOURCES } from "../../config/resources.js";
import { crudRouter } from "./crudRouter.js";
import * as settings from "../../controllers/settings.controller.js";
import * as pages from "../../controllers/pages.controller.js";
import * as media from "../../controllers/media.controller.js";
import * as users from "../../controllers/users.controller.js";
import * as system from "../../controllers/system.controller.js";
import * as translations from "../../controllers/translations.controller.js";
import { crmController } from "../../controllers/crm.controller.js";
import * as analytics from "../../controllers/analytics.controller.js";
import * as customers from "../../controllers/customers.controller.js";
import * as guests from "../../controllers/guests.controller.js";
import { analyticsQuery, customerAdminUpdate, guestParams, guestUpdate } from "../../validations/analytics.js";
import { MEDIA_FOLDERS } from "../../services/cloudinary/index.js";
import { SUPPORTED_LOCALES } from "../../config/locales.js";

const id = validate({ params: z.object({ id: objectId }) });

export const adminRouter = Router();

// Admin responses are per-user – never let browsers or shared caches (e.g. the frontend's CDN proxy) store them.
adminRouter.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

// Every admin route requires a valid session; each route then checks its own permission.
adminRouter.use(authenticate);

/* ───────────── Dashboard & system ───────────── */
adminRouter.get("/dashboard", can("dashboard:read"), system.dashboard);
adminRouter.get("/analytics", can("analytics:read"), validate({ query: analyticsQuery }), analytics.overview);
adminRouter.get("/activity-logs", can("activityLogs:read"), validate({ query: listQuery }), system.activityLogs);
adminRouter.get("/system/integrations", can("system:read"), system.integrations);
adminRouter.post(
  "/preview-token",
  can("pages:read"),
  validate({ body: z.object({ slug: z.string().trim().toLowerCase().min(1).max(160) }) }),
  system.previewToken,
);

/* ───────────── Settings & branding ───────────── */
adminRouter.get("/site-settings", can("settings:read"), settings.getSiteSettings);
adminRouter.put("/site-settings", can("settings:update"), validate({ body: siteSettingsUpdate }), settings.updateSiteSettings);
adminRouter.get("/branding", can("branding:read"), settings.getBranding);
adminRouter.put("/branding", can("branding:update"), validate({ body: brandingUpdate }), settings.updateBranding);
adminRouter.get("/languages", can("translations:read"), settings.listLanguages);
adminRouter.put("/languages", can("translations:update"), validate({ body: languageUpdate }), settings.updateLanguages);

/* ───────────── Generic CMS resources ───────────── */
adminRouter.use("/tours", crudRouter(RESOURCES.tours));
adminRouter.use("/destinations", crudRouter(RESOURCES.destinations));
adminRouter.use("/excursions", crudRouter(RESOURCES.excursions));
adminRouter.use("/vehicles", crudRouter(RESOURCES.vehicles));
adminRouter.use("/categories", crudRouter(RESOURCES.categories));
adminRouter.use("/gallery", crudRouter(RESOURCES.gallery));
adminRouter.use("/blog", crudRouter(RESOURCES.blog));
adminRouter.use("/guest-shorts", crudRouter(RESOURCES.guestShorts));
adminRouter.use("/reviews", crudRouter(RESOURCES.reviews));
adminRouter.use("/faqs", crudRouter(RESOURCES.faqs));
adminRouter.use("/hero", crudRouter(RESOURCES.hero));
adminRouter.use("/navigation", crudRouter(RESOURCES.navigation));
adminRouter.use("/seo", crudRouter(RESOURCES.seo));

/* ───────────── Pages & sections ───────────── */
const sectionParams = validate({ params: z.object({ id: objectId, sectionId: objectId }) });
adminRouter.get("/pages", can("pages:read"), pages.list);
adminRouter.post("/pages", can("pages:create"), validate({ body: pageCreate }), pages.create);
adminRouter.get("/pages/:id", can("pages:read"), id, pages.get);
adminRouter.put("/pages/:id", can("pages:update"), id, validate({ body: pageUpdate }), pages.update);
adminRouter.delete("/pages/:id", can("pages:delete"), id, pages.remove);
adminRouter.post("/pages/:id/sections", can("pages:update"), id, validate({ body: sectionCreate }), pages.createSection);
adminRouter.patch("/pages/:id/sections/reorder", can("pages:update"), id, validate({ body: reorderSchema }), pages.reorderSections);
adminRouter.put("/pages/:id/sections/:sectionId", can("pages:update"), sectionParams, validate({ body: sectionUpdate }), pages.updateSection);
adminRouter.delete("/pages/:id/sections/:sectionId", can("pages:update"), sectionParams, pages.deleteSection);
adminRouter.post("/pages/:id/sections/:sectionId/duplicate", can("pages:update"), sectionParams, pages.duplicateSection);

/* ───────────── Media library (Cloudinary) ───────────── */
const mediaMeta = {
  title: z.string().trim().max(200).optional(),
  altText: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional(),
};
const folderEnum = z.enum(MEDIA_FOLDERS);
adminRouter.get("/media", can("media:read"), validate({ query: listQuery }), media.list);
adminRouter.get("/media/status", can("media:read"), media.status);
adminRouter.post(
  "/media/signature",
  can("media:create"),
  uploadLimiter,
  validate({ body: z.object({ folder: folderEnum, resourceType: z.enum(["image", "video"]) }) }),
  media.signature,
);
adminRouter.post(
  "/media",
  can("media:create"),
  validate({ body: z.object({ publicId: z.string().trim().min(1).max(500), resourceType: z.enum(["image", "video"]), ...mediaMeta }) }),
  media.register,
);
adminRouter.post(
  "/media/upload",
  can("media:create"),
  uploadLimiter,
  cleanupTempFiles,
  mediaUpload.array("files", 10),
  validate({
    body: z.object({
      folder: folderEnum.default("general"),
      title: mediaMeta.title,
      altText: mediaMeta.altText,
      caption: mediaMeta.caption,
      tags: z
        .union([z.array(z.string()), z.string()])
        .optional()
        .transform((t) => (typeof t === "string" ? t.split(",").map((s) => s.trim()).filter(Boolean) : t)),
    }),
  }),
  media.upload,
);
adminRouter.get("/media/:id", can("media:read"), id, media.get);
adminRouter.get("/media/:id/usage", can("media:read"), id, media.usage);
adminRouter.patch("/media/:id", can("media:update"), id, validate({ body: z.object(mediaMeta) }), media.update);
adminRouter.post("/media/:id/replace", can("media:update"), uploadLimiter, id, cleanupTempFiles, mediaUpload.single("file"), media.replace);
adminRouter.delete(
  "/media/:id",
  can("media:delete"),
  validate({ params: z.object({ id: objectId }), query: z.object({ force: z.enum(["true", "false"]).optional() }) }),
  media.remove,
);

/* ───────────── CRM: bookings, tailor-made, contact ───────────── */
function mountCrm(path: string, kind: "bookings" | "enquiries" | "contacts", updateSchema: z.ZodType) {
  const c = crmController(kind);
  const perm = kind;
  adminRouter.get(`${path}`, can(`${perm}:read`), validate({ query: listQuery }), c.list);
  adminRouter.get(`${path}/export`, can(`${perm}:read`), validate({ query: listQuery }), c.exportCsv);
  adminRouter.get(`${path}/:id`, can(`${perm}:read`), id, c.get);
  adminRouter.patch(`${path}/:id`, can(`${perm}:update`), id, validate({ body: updateSchema }), c.update);
  adminRouter.post(`${path}/:id/notes`, can(`${perm}:update`), id, validate({ body: noteBody }), c.addNote);
  adminRouter.delete(
    `${path}/:id/notes/:noteId`,
    can(`${perm}:update`),
    validate({ params: z.object({ id: objectId, noteId: objectId }) }),
    c.deleteNote,
  );
  adminRouter.delete(`${path}/:id`, can(`${perm}:delete`), id, c.remove);
}
mountCrm("/bookings", "bookings", bookingAdminUpdate);
mountCrm("/tailor-made-enquiries", "enquiries", tailorMadeAdminUpdate);
mountCrm("/contact-messages", "contacts", contactAdminUpdate);

/* ───────────── Website customers ───────────── */
adminRouter.get("/customers", can("customers:read"), validate({ query: listQuery }), customers.list);
adminRouter.get("/customers/export", can("customers:read"), validate({ query: listQuery }), customers.exportCsv);
adminRouter.get("/customers/:id", can("customers:read"), id, customers.get);
adminRouter.patch("/customers/:id", can("customers:update"), id, validate({ body: customerAdminUpdate }), customers.update);
adminRouter.post("/customers/:id/revoke-sessions", can("customers:update"), id, customers.revokeSessions);
adminRouter.delete("/customers/:id", can("customers:delete"), id, customers.remove);

/* Guests: people who booked or enquired without an account (grouped by email; no record of their own). */
const guest = validate({ params: guestParams });
adminRouter.get("/guests", can("customers:read"), validate({ query: listQuery }), guests.list);
adminRouter.get("/guests/export", can("customers:read"), validate({ query: listQuery }), guests.exportCsv);
adminRouter.get("/guests/:email", can("customers:read"), guest, guests.get);
adminRouter.patch("/guests/:email", can("customers:update"), guest, validate({ body: guestUpdate }), guests.update);
adminRouter.post("/guests/:email/erase", can("customers:delete"), guest, guests.erase);

/* ───────────── Translations ───────────── */
const entityParams = z.object({ entityType: z.string().regex(/^[a-zA-Z]{2,40}$/), entityId: objectId });
adminRouter.get("/translations", can("translations:read"), validate({ query: z.object({ type: z.string().max(40).optional() }) }), translations.overview);
adminRouter.get("/translations/jobs/:id", can("translations:read"), id, translations.job);
adminRouter.get("/translations/:entityType/:entityId", can("translations:read"), validate({ params: entityParams }), translations.getEntity);
adminRouter.post(
  "/translations/generate",
  can("translations:update"),
  validate({
    body: z.object({
      entityType: z.string().regex(/^[a-zA-Z]{2,40}$/),
      entityId: objectId.optional(),
      locales: z.array(z.enum(SUPPORTED_LOCALES)).max(20).optional(),
      force: z.boolean().optional(),
    }),
  }),
  translations.generate,
);
adminRouter.put(
  "/translations/:entityType/:entityId/:locale",
  can("translations:update"),
  validate({
    params: entityParams.extend({ locale: z.enum(SUPPORTED_LOCALES) }),
    body: z.object({
      fields: z.record(z.string().max(300), z.string().max(200_000)).optional(),
      locked: z.boolean().optional(),
      published: z.boolean().optional(),
    }),
  }),
  translations.save,
);

/* ───────────── Users, roles & permissions ───────────── */
adminRouter.get("/users", can("users:read"), validate({ query: listQuery }), users.listUsers);
adminRouter.post("/users", can("users:create"), validate({ body: userCreate }), users.createUser);
adminRouter.get("/users/:id", can("users:read"), id, users.getUser);
adminRouter.put("/users/:id", can("users:update"), id, validate({ body: userUpdate }), users.updateUser);
adminRouter.delete("/users/:id", can("users:delete"), id, users.deleteUser);
adminRouter.get("/roles", can("roles:read"), users.listRoles);
adminRouter.get("/permissions", can("roles:read"), users.listPermissions);
adminRouter.post("/roles", can("roles:create"), validate({ body: roleCreate }), users.createRole);
adminRouter.put("/roles/:id", can("roles:update"), id, validate({ body: roleUpdate }), users.updateRole);
adminRouter.delete("/roles/:id", can("roles:delete"), id, users.deleteRole);
