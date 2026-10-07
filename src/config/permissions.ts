/**
 * Permission catalogue. Permissions are `<module>:<action>` strings.
 * Roles store a list of permission keys; the special key "*" grants everything.
 */
export const PERMISSION_MODULES = [
  "dashboard",
  "settings",
  "branding",
  "navigation",
  "pages",
  "hero",
  "seo",
  "media",
  "gallery",
  "tours",
  "destinations",
  "excursions",
  "vehicles",
  "categories",
  "bookings",
  "enquiries",
  "contacts",
  "blog",
  "guestShorts",
  "reviews",
  "faqs",
  "translations",
  "users",
  "roles",
  "activityLogs",
  "system",
] as const;

export const PERMISSION_ACTIONS = ["create", "read", "update", "delete"] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionKey = `${PermissionModule}:${PermissionAction}` | "*";

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_MODULES.flatMap((m) =>
  PERMISSION_ACTIONS.map((a) => `${m}:${a}` as PermissionKey),
);

const crud = (...modules: PermissionModule[]): PermissionKey[] =>
  modules.flatMap((m) => PERMISSION_ACTIONS.map((a) => `${m}:${a}` as PermissionKey));
const only = (actions: PermissionAction[], ...modules: PermissionModule[]): PermissionKey[] =>
  modules.flatMap((m) => actions.map((a) => `${m}:${a}` as PermissionKey));

const CONTENT_MODULES: PermissionModule[] = [
  "navigation",
  "pages",
  "hero",
  "seo",
  "media",
  "gallery",
  "tours",
  "destinations",
  "excursions",
  "vehicles",
  "categories",
  "blog",
  "guestShorts",
  "reviews",
  "faqs",
  "translations",
];

export const DEFAULT_ROLES: { name: string; description: string; permissions: PermissionKey[] }[] = [
  { name: "Super Admin", description: "Unrestricted access to everything, including roles and security.", permissions: ["*"] },
  {
    name: "Admin",
    description: "Manages the whole website and CRM. Cannot change roles or system security settings.",
    permissions: [
      ...ALL_PERMISSIONS.filter((p) => !p.startsWith("roles:") && p !== "system:update" && p !== "system:delete"),
      "roles:read",
    ],
  },
  {
    name: "Content Manager",
    description: "Full control of website content, media and translations.",
    permissions: [
      "dashboard:read",
      ...crud(...CONTENT_MODULES),
      ...only(["read", "update"], "settings", "branding"),
    ],
  },
  {
    name: "Booking Manager",
    description: "Handles bookings, tailor-made enquiries and contact messages.",
    permissions: [
      "dashboard:read",
      ...crud("bookings", "enquiries", "contacts"),
      ...only(["read"], "tours", "excursions", "vehicles", "destinations", "users"),
    ],
  },
  {
    name: "Editor",
    description: "Creates and edits content but cannot delete or publish settings.",
    permissions: [
      "dashboard:read",
      ...only(["create", "read", "update"], ...CONTENT_MODULES.filter((m) => m !== "navigation" && m !== "seo")),
      ...only(["read"], "navigation", "seo"),
    ],
  },
];

export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;
  const [mod] = required.split(":");
  return granted.includes(`${mod}:*`);
}
