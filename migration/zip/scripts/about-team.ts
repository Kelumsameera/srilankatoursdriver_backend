/**
 * Step 5: creates the CMS "about" page (if missing) with an empty "Our team" section, so the owner,
 * managers and staff can be added with photos in Admin → Pages → About → Team.
 *
 *   npx tsx migration/zip/scripts/about-team.ts            # dry run
 *   npx tsx migration/zip/scripts/about-team.ts --apply    # writes MongoDB
 *
 * Re-runnable: the page is matched by slug, the section by its internal name; existing people are kept.
 */
import { connectDatabase, disconnectDatabase } from "../../../src/config/db.js";
import { Page, PageSection } from "../../../src/models/index.js";
import { saveManualTranslation } from "../../../src/services/translation/translation.service.js";

const APPLY = process.argv.includes("--apply");
const log = (...a: unknown[]) => console.log(APPLY ? "•" : "(dry-run)", ...a);
const SECTION_NAME = "Our team";

/** [eyebrow, title] per language. */
const HEADINGS: Record<string, [string, string]> = {
  en: ["Our team", "Meet the people behind your journey"],
  si: ["අපගේ කණ්ඩායම", "ඔබේ ගමන පිටුපස සිටින අය හමුවන්න"],
  ta: ["எங்கள் குழு", "உங்கள் பயணத்தின் பின்னால் உள்ளவர்களை சந்தியுங்கள்"],
  de: ["Unser Team", "Lernen Sie die Menschen hinter Ihrer Reise kennen"],
  fr: ["Notre équipe", "Rencontrez les personnes derrière votre voyage"],
  es: ["Nuestro equipo", "Conoce a las personas detrás de tu viaje"],
  it: ["Il nostro team", "Conosci le persone dietro il tuo viaggio"],
  zh: ["我们的团队", "认识为您打造旅程的人"],
  ja: ["私たちのチーム", "あなたの旅を支えるメンバーをご紹介します"],
  ko: ["우리 팀", "여러분의 여행을 함께 만드는 사람들을 소개합니다"],
  ru: ["Наша команда", "Познакомьтесь с людьми, которые стоят за вашим путешествием"],
  ar: ["فريقنا", "تعرّف على الأشخاص وراء رحلتك"],
  hi: ["हमारी टीम", "आपकी यात्रा के पीछे के लोगों से मिलिए"],
  pt: ["A nossa equipa", "Conheça as pessoas por trás da sua viagem"],
};

await connectDatabase();
try {
  let page = await Page.findOne({ slug: "about" }).lean();
  if (page) log(`page "about" exists (${page.title})`);
  else {
    log('create page "about" (published) – title "About Sri Lanka Tours Driver"');
    if (APPLY) page = (await Page.create({ slug: "about", title: "About Sri Lanka Tours Driver", status: "published", isSystem: false })).toObject();
  }

  if (page) {
    const existing = await PageSection.findOne({ page: page._id, type: "team" }).lean();
    if (existing) log(`team section exists (${existing.items?.length ?? 0} people) – left unchanged`);
    else {
      log(`add "${SECTION_NAME}" team section (add people & photos in Admin → Pages → About)`);
      if (APPLY) {
        const count = await PageSection.countDocuments({ page: page._id });
        const section = await PageSection.create({
          page: page._id,
          type: "team",
          name: SECTION_NAME,
          eyebrow: HEADINGS.en[0],
          title: HEADINGS.en[1],
          items: [],
          enabled: true,
          order: count + 1,
          settings: { theme: "sand" },
        });
        for (const [locale, [eyebrow, title]] of Object.entries(HEADINGS)) {
          if (locale !== "en") await saveManualTranslation("pageSection", String(section._id), locale, { fields: { eyebrow, title } });
        }
      }
    }
  } else log('team section will be added to the new "about" page');
  console.log(APPLY ? "\nDone." : "\nDry run only – re-run with --apply to write these changes.");
} finally {
  await disconnectDatabase();
}
