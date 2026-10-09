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

export const CONTENT_MODULES: PermissionModule[] = [
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
  {
    name: "Super Admin",
    description: "Unrestricted access to everything, including roles, users and system security.",
    permissions: ["*"],
  },
  {
    name: "Admin",
    description: "Full website and CRM administration. Cannot change Super Admin security controls.",
    permissions: [
      ...ALL_PERMISSIONS.filter((p) => !p.startsWith("roles:") && p !== "system:update" && p !== "system:delete"),
      "roles:read",
    ],
  },
  {
    name: "Manager",
    description: "Manages bookings, enquiries, customers and day-to-day tour operations.",
    permissions: [
      "dashboard:read",
      ...crud("bookings", "enquiries", "contacts"),
      ...only(["read", "update"], "users"),
      ...only(["read"], "tours", "destinations", "excursions", "vehicles", "categories", "reviews"),
    ],
  },
  {
    name: "Staff",
    description: "Handles assigned operational work and customer enquiries with limited access.",
    permissions: [
      "dashboard:read",
      ...only(["read", "update"], "bookings", "enquiries"),
      ...only(["read"], "contacts", "users", "tours", "destinations", "excursions", "vehicles", "reviews"),
    ],
  },
];

export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;
  const [mod] = required.split(":");
  return granted.includes(`${mod}:*`);
}
