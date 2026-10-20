import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category, Page, PageSection, Tour } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

const groups = [
  { slug: "honeymoon-tours", title: "Honeymoon tours", subtitle: "Coastal sunsets, quiet hill-country stays and time together.", theme: "sand" },
  { slug: "family-tours", title: "Family adventures", subtitle: "Wildlife, beaches and new discoveries to share with your family.", theme: "light" },
  { slug: "adventure-tours", title: "Adventure tours", subtitle: "Head outdoors and explore a different side of Sri Lanka.", theme: "sand" },
];
try {
  await connectDatabase();
  const page = await Page.findOne({ slug: "home" }).lean();
  if (!page) throw new Error("Homepage missing");
  const existing = await PageSection.find({ page: page._id }).lean();
  const anchor = existing.find((s) => s.type === "popularTours" && !s.settings?.category)?.order ?? 3;
  const next = Math.min(...existing.filter((s) => s.order > anchor).map((s) => s.order), anchor + 1);
  const plans = [];
  for (const [index, group] of groups.entries()) {
    const category = await Category.findOne({ kind: "tour", slug: group.slug, enabled: true }).lean();
    if (!category || !await Tour.exists({ category: category._id, status: "published" })) throw new Error(`No published tours: ${group.slug}`);
    if (existing.some((s) => String(s.settings?.category) === String(category._id))) continue;
    plans.push({ page: page._id, type: "popularTours", name: `Home ${group.slug}`, title: group.title, subtitle: group.subtitle,
      order: anchor + (next - anchor) * (index + 1) / 4, enabled: true,
      settings: { category: category._id, limit: 3, source: "all", theme: group.theme, layout: "grid" },
      buttons: [{ label: `Explore ${group.title.toLowerCase()}`, url: `/tours?category=${group.slug}`, variant: "link" }],
    });
  }
  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), sections: plans.map((p) => p.title) }));
  for (const plan of plans) await new PageSection(plan).validate();
  if (process.argv.includes("--apply") && plans.length) {
    fs.mkdirSync("backups", { recursive: true });
    fs.writeFileSync(`backups/home-categories-${Date.now()}.json`, JSON.stringify(existing, null, 2));
    await PageSection.insertMany(plans);
    revalidateFrontend(CACHE_TAGS.pages, CACHE_TAGS.tours);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally { await disconnectDatabase(); }
