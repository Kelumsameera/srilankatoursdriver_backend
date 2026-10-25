/**
 * Replaces the "Vehicles" link in the header nav and footer with "Offers" and creates the /offers page
 * (a copy of the existing special-offer section). Backs up the touched documents first. Safe to re-run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { NavigationItem } from "../models/NavigationItem.js";
import { SiteSetting } from "../models/SiteSetting.js";
import { Page } from "../models/Page.js";
import { PageSection } from "../models/PageSection.js";

await connectDatabase();

const nav = await NavigationItem.findOne({ url: "/vehicles", parent: null }).lean();
const settings = await SiteSetting.findOne({ key: "default" }).lean();
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/vehicles-to-offers-${Date.now()}.json`, JSON.stringify({ nav, footer: settings?.footer }, null, 2));

if (nav) {
  await NavigationItem.updateOne({ _id: nav._id }, { label: "Offers", url: "/offers" });
  console.log("Header nav: Vehicles → Offers");
}

const columns = (settings?.footer?.columns ?? []).map((col) => ({
  ...col,
  links: col.links.map((l) => (l.url === "/vehicles" ? { ...l, label: "Offers", url: "/offers" } : l)),
}));
await SiteSetting.updateOne({ key: "default" }, { $set: { "footer.columns": columns } });
console.log("Footer: Vehicles → Offers");

let page = await Page.findOne({ slug: "offers" });
if (!page) {
  page = await Page.create({
    slug: "offers",
    title: "Special Offers",
    subtitle: "Limited-time deals on private Sri Lanka tours with your own chauffeur-guide.",
    status: "published",
    seo: {
      metaTitle: "Sri Lanka Tour Offers & Deals | Sri Lanka Tours Driver",
      metaDescription: "Save on private Sri Lanka tours – current special offers with chauffeur, hotels and bonuses included.",
    },
  });
  console.log("Created page /offers");
}

if ((await PageSection.countDocuments({ page: page._id })) === 0) {
  const source = await PageSection.findOne({ type: "offer" }).lean();
  if (source) {
    const { _id, createdAt, updatedAt, __v, ...rest } = source as typeof source & { __v?: number };
    void _id; void createdAt; void updatedAt; void __v;
    await PageSection.create({ ...rest, page: page._id, name: "Special offer", enabled: true, order: 1 });
  }
  await PageSection.create({
    page: page._id,
    type: "cta",
    name: "Tailor-made CTA",
    title: "Want a different deal?",
    subtitle: "Tell us your dates and group size – we'll put together the best price for your trip.",
    buttons: [{ label: "Plan a tailor-made tour", url: "/tailor-made-tours", variant: "primary" }],
    settings: { theme: "forest" },
    order: 2,
  });
  console.log("Added offer + CTA sections to /offers");
}

await disconnectDatabase();
