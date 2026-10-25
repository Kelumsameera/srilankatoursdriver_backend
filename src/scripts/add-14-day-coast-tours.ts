/**
 * Adds the two 14-day coast packages, each with its own itinerary:
 *  - 14-days-east-coast (East Coast Tours): hill country, cultural triangle, Pasikuda, Trincomalee, Kalpitiya.
 *  - 14-days-down-south (Down South Tours): cultural triangle, hill country, Yala, Mirissa, Galle, Hikkaduwa.
 * Creates a missing tour, or refreshes the itinerary and copy of an existing one (backing it up first).
 * Prices: see content/tour-group-prices.json (apply-tour-group-prices.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Category } from "../models/Category.js";
import { Media } from "../models/Media.js";
import { Tour } from "../models/Tour.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

interface Day {
  title: string;
  overnight: string;
  note?: string;
  image: string;
  activities: string[];
}

const EAST_COAST_DAYS: Day[] = [
  {
    title: "Negombo",
    overnight: "Negombo",
    note: "First day activities depend on your arrival time. Pickup from the airport and transfer to Negombo.",
    image: "zip-toursnegombo",
    activities: ["Relax at Negombo hotel", "St. Mary's Church Negombo", "Negombo Dutch Fort", "Evening Negombo Lagoon Tour", "Dinner at Negombo Beach"],
  },
  {
    title: "Ella",
    overnight: "Ella",
    note: "Drive to Ella.",
    image: "zip-toursella",
    activities: ["Kithulgala White Water Rafting", "Ravana Waterfall", "Little Adam's Peak (sunset)"],
  },
  {
    title: "Ella Exploration",
    overnight: "Ella",
    image: "little-adams-peak_jfuo3p",
    activities: ["Nine Arch Bridge", "Ravana Zipline", "Swimming at Secret Waterfall", "Walking city tour in Ella"],
  },
  {
    title: "Nuwara Eliya",
    overnight: "Nuwara Eliya",
    note: "Drive to Nuwara Eliya.",
    image: "zip-toursnuwaraeliya",
    activities: [
      'Train journey Ella to Nanu Oya – one of the most beautiful train rides in the world, known as the "Blue Train Journey"',
      "Pedro Tea Estate",
      "Seetha Amman Kovil",
      "Victoria Park",
      "Gregory Lake",
      "Walking city tour in Nuwara Eliya",
    ],
  },
  {
    title: "Kandy",
    overnight: "Kandy",
    note: "Drive to Kandy.",
    image: "zip-tourskandy",
    activities: [
      "Horton Plains National Park (5.00 am)",
      "Baker's Falls",
      "Ramboda Waterfall",
      "Glenloch Tea Factory & Tea Plantation",
      "Kandy Lake",
      "Kandy Cultural Show (5.00 pm – 6.00 pm)",
      "Temple of the Tooth Kandy (ceremony starts at 7.00 pm)",
    ],
  },
  {
    title: "Habarana",
    overnight: "Habarana",
    note: "Drive to Habarana.",
    image: "zip-tourshabarana",
    activities: ["Matale Hindu Temple", "Ranweli Spice Garden", "Dambulla Cave Temple", "Dambulla Vegetable Market", "Pidurangala sunset"],
  },
  {
    title: "Sigiriya",
    overnight: "Habarana",
    image: "zip-tourssigiriya",
    activities: [
      "Sigiriya Rock Fortress",
      "Hiriwadunna Village Tour with Sri Lankan cooking class and Sri Lankan lunch",
      "Minneriya / Kaudulla / Eco Park wild safari (we choose the best park on the day, as the elephants move between them)",
    ],
  },
  {
    title: "Pasikuda",
    overnight: "Pasikuda",
    note: "Drive to Pasikuda.",
    image: "zip-tourspasikuda",
    activities: ["Polonnaruwa Ancient Kingdom", "Pasikuda Beach (Kalkudah Beach)"],
  },
  {
    title: "Batticaloa",
    overnight: "Pasikuda",
    image: "zip-toursbatticaloa",
    activities: ["Water sports at Pasikuda Beach", "Beach leisure", "Batticaloa Dutch Fort", "New Kallady Bridge", "Batticaloa Lighthouse"],
  },
  {
    title: "Trincomalee",
    overnight: "Trincomalee (Nilaveli)",
    note: "Drive to Trincomalee (Nilaveli).",
    image: "zip-tourstrincomalee",
    activities: ["Marble Beach", "British War Cemetery", "Fort Frederick", "Koneswaram Temple", "Lovers Leap", "Uppuveli Beach"],
  },
  {
    title: "Nilaveli",
    overnight: "Trincomalee (Nilaveli)",
    image: "pigeon-island_lqgl1f",
    activities: ["Pigeon Island National Park", "Snorkelling, diving and water sports at Nilaveli Beach", "Leisure at Nilaveli Beach"],
  },
  {
    title: "Anuradhapura",
    overnight: "Anuradhapura",
    note: "Drive to Anuradhapura.",
    image: "zip-toursanuradhapura",
    activities: ["Kanniya Hot Water Springs", "Mihintale", "Anuradhapura Ancient Kingdom"],
  },
  {
    title: "Kalpitiya",
    overnight: "Kalpitiya",
    note: "Drive to Kalpitiya.",
    image: "zip-tourskalpitiya",
    activities: ["Wilpattu National Park morning safari", "Kalpitiya Dutch Fort", "Kalpitiya Lagoon Tour", "Kite surfing at Kalpitiya Lagoon"],
  },
  {
    title: "Colombo & Departure",
    overnight: "",
    note: "Last day activities depend on your departure time. Drive to the airport.",
    image: "zip-tourscolombo-airport",
    activities: ["Munneswaram Hindu Temple", "Colombo City Tour – Gangaramaya Temple, Independence Square, Galle Face Green", "Drop at the airport"],
  },
];

const DOWN_SOUTH_DAYS: Day[] = [
  {
    title: "Negombo",
    overnight: "Negombo",
    note: "First day activities depend on your arrival time. Pickup from the airport and transfer to Negombo.",
    image: "zip-toursnegombo",
    activities: ["Relax at Negombo hotel", "St. Mary's Church Negombo", "St. Sebastian's Church", "Evening Negombo Lagoon Tour", "Dinner at Negombo Beach"],
  },
  {
    title: "Anuradhapura",
    overnight: "Anuradhapura",
    note: "Drive to Anuradhapura.",
    image: "zip-toursanuradhapura",
    activities: ["Negombo Fish Market (6.00 am)", "Negombo Dutch Fort", "Munneswaram Hindu Temple", "Anuradhapura Ancient Kingdom city tour"],
  },
  {
    title: "Habarana",
    overnight: "Habarana",
    note: "Drive to Habarana.",
    image: "zip-tourshabarana",
    activities: [
      "Mihintale",
      "Minneriya / Kaudulla / Eco Park wild safari (we choose the best park on the day, as the elephants move between them)",
      "Pidurangala sunset",
    ],
  },
  {
    title: "Sigiriya & Polonnaruwa",
    overnight: "Habarana",
    image: "zip-tourssigiriya",
    activities: ["Sigiriya Rock Fortress (7.00 am)", "Hiriwadunna Village Tour with Sri Lankan cooking class and Sri Lankan lunch", "Polonnaruwa Ancient Kingdom"],
  },
  {
    title: "Kandy",
    overnight: "Kandy",
    note: "Drive to Kandy.",
    image: "zip-tourskandy",
    activities: [
      "Dambulla Cave Temple",
      "Dambulla Vegetable Market",
      "Matale Hindu Temple",
      "Ranweli Spice Garden",
      "Kandy Cultural Show (5.00 pm – 6.00 pm)",
      "Temple of the Tooth Kandy (ceremony starts at 7.00 pm)",
    ],
  },
  {
    title: "Nuwara Eliya",
    overnight: "Nuwara Eliya",
    note: "Drive to Nuwara Eliya.",
    image: "zip-toursnuwaraeliya",
    activities: ["Peradeniya Botanical Garden", "Ambuluwawa Tower", "Ramboda Waterfall", "Hanuman Temple", "Glenloch Tea Factory & Tea Plantation"],
  },
  {
    title: "Nuwara Eliya Exploration",
    overnight: "Nuwara Eliya",
    image: "gregory-lake_nk3ybm",
    activities: ["Moon Plains (Sandathenna)", "Hakgala Botanical Garden", "Seetha Amman Kovil", "Gregory Lake", "Walking city tour in Nuwara Eliya"],
  },
  {
    title: "Ella",
    overnight: "Ella",
    note: "Drive to Ella.",
    image: "zip-toursella",
    activities: [
      "Horton Plains National Park (5.00 am)",
      'Train journey Nanu Oya to Ella – one of the most beautiful train rides in the world, known as the "Blue Train Journey"',
      "Walking city tour in Ella",
    ],
  },
  {
    title: "Ella Exploration",
    overnight: "Ella",
    image: "little-adams-peak_jfuo3p",
    activities: ["Nine Arch Bridge", "Little Adam's Peak", "Ravana Zipline", "Ravana Waterfall", "Swimming at Secret Waterfall"],
  },
  {
    title: "Yala",
    overnight: "Yala",
    note: "Drive to Yala.",
    image: "zip-toursyala",
    activities: ["Buduruwagala Rock Temple", "Tissamaharama Ancient City", "Tissamaharama Lake", "Yala National Park afternoon safari"],
  },
  {
    title: "Mirissa",
    overnight: "Mirissa",
    note: "Drive to Mirissa.",
    image: "zip-toursmirissa",
    activities: ["Goyambokka Beach", "Coconut Tree Hill", "Weligama Beach (surfing lesson)", "Mirissa Beach sunset"],
  },
  {
    title: "Galle & Hikkaduwa",
    overnight: "Hikkaduwa",
    note: "Drive to Hikkaduwa.",
    image: "zip-tourshikkaduwa",
    activities: ["Whale and dolphin watching at Mirissa (morning)", "Unawatuna Beach", "Jungle Beach", "Rumassala Japanese Peace Pagoda", "Galle Dutch Fort"],
  },
  {
    title: "Bentota & Colombo",
    overnight: "Colombo",
    note: "Drive to Colombo.",
    image: "bentota-water-sports_mljjjk",
    activities: [
      "Swimming with sea turtles and snorkelling at Hikkaduwa Beach",
      "Turtle Conservation Project",
      "Madu River Boat Safari with Cinnamon Tour",
      "Bentota water sports",
    ],
  },
  {
    title: "Colombo & Departure",
    overnight: "",
    note: "Last day activities depend on your departure time. Drive to the airport.",
    image: "zip-tourscolombo-airport",
    activities: [
      "Colombo City Tour – Gangaramaya Temple, Old Parliament, Independence Square, Colombo National Museum",
      "Lotus Tower",
      "Jami Ul Alfar Mosque",
      "Galle Face Green",
      "Drop at the airport",
    ],
  },
];

const VARIANTS = [
  {
    slug: "14-days-east-coast",
    category: "east-coast-tours",
    title: "14 Days East Coast & Down South Tour",
    hero: "nilaveli_ngdhkj",
    order: 22,
    price: 1040,
    days: EAST_COAST_DAYS,
    shortDescription:
      "A 14-day private round tour for the east coast season – Ella, the Blue Train, Kandy, Sigiriya, then Pasikuda, Batticaloa, Trincomalee and Kalpitiya – with your own driver.",
    description: `Made for the east coast season (July to October). Start in Negombo and head into the hills for Ella, the famous Blue Train ride to Nanu Oya, Nuwara Eliya's tea country and Horton Plains on the way to Kandy.

From the cultural triangle – Dambulla, Sigiriya and an elephant safari – the route continues to the calm east coast beaches of Pasikuda and Batticaloa, then Trincomalee and Nilaveli with snorkelling at Pigeon Island. It finishes with Anuradhapura, a Wilpattu safari and the Kalpitiya lagoon before your flight home.

Every day can be adjusted to your arrival and departure times and your interests.`,
    highlights: ["Ella to Nanu Oya Blue Train ride", "Sigiriya Rock Fortress", "Elephant safari at Minneriya / Kaudulla", "Pasikuda & Nilaveli beaches", "Snorkelling at Pigeon Island", "Wilpattu safari & Kalpitiya lagoon"],
    gallery: [
      ["destination-ella-nine-arch-bridge_n9qwvb", "Nine Arch Bridge, Ella"],
      ["destination-sigiriya_yxx9wh", "Sigiriya Rock Fortress"],
      ["destination-passikudah_cwuogo", "Pasikuda Beach"],
      ["pigeon-island_lqgl1f", "Pigeon Island, Trincomalee"],
    ],
  },
  {
    slug: "14-days-down-south",
    category: "down-south-tours",
    title: "14 Days Down South & East Coast Tour",
    hero: "destination-mirissa_fb20g7",
    order: 21,
    price: 1000,
    days: DOWN_SOUTH_DAYS,
    shortDescription:
      "A 14-day private round tour for the south coast season – Anuradhapura, Sigiriya, Kandy, Nuwara Eliya, Ella, Yala, Mirissa, Galle and Hikkaduwa – with your own driver.",
    description: `Made for the south coast season (November to June). Start in Negombo and explore the ancient cities of Anuradhapura, Sigiriya and Polonnaruwa, with an elephant safari, before Kandy's Temple of the Tooth.

Two days in Nuwara Eliya's tea country and Horton Plains lead to the Blue Train ride and two days in Ella. Then drive down to a Yala safari and the south coast: Mirissa's beaches and whale watching, Galle Dutch Fort, Hikkaduwa's sea turtles and Bentota, finishing with a Colombo city tour.

Every day can be adjusted to your arrival and departure times and your interests.`,
    highlights: ["Sigiriya & Polonnaruwa", "Temple of the Tooth, Kandy", "Nanu Oya to Ella Blue Train ride", "Yala National Park safari", "Whale watching at Mirissa", "Galle Dutch Fort"],
    gallery: [
      ["destination-sigiriya_yxx9wh", "Sigiriya Rock Fortress"],
      ["destination-ella-nine-arch-bridge_n9qwvb", "Nine Arch Bridge, Ella"],
      ["yala-leopard_w5ml5x", "Leopard in Yala National Park"],
      ["destination-galle_nibajz", "Galle Dutch Fort"],
    ],
  },
];

await connectDatabase();

const publicIds = [...new Set(VARIANTS.flatMap((v) => [v.hero, ...v.days.map((d) => d.image), ...v.gallery.map(([id]) => id)]))];
const media = await Media.find({ publicId: { $in: publicIds.map((id) => new RegExp(`/${id}$`)) } }).lean();
const asset = (id: string, alt: string) => {
  const m = media.find((x) => x.publicId.endsWith(`/${id}`));
  if (!m) throw new Error(`Media not found: ${id}`);
  return { mediaId: m._id, publicId: m.publicId, url: m.secureUrl, resourceType: m.resourceType, format: m.format, width: m.width, height: m.height, alt };
};

// Same inclusions as the existing coast packages
const template = await Tour.findOne({ slug: "12-days-east-coast" }).lean();

const existing = await Tour.find({ slug: { $in: VARIANTS.map((v) => v.slug) } }).lean();
if (existing.length) {
  mkdirSync("backups", { recursive: true });
  writeFileSync(`backups/14-day-coast-tours-${Date.now()}.json`, JSON.stringify(existing, null, 2));
}

for (const v of VARIANTS) {
  const category = await Category.findOne({ kind: "tour", slug: v.category }).select("_id").lean();
  if (!category) throw new Error(`Category not found: ${v.category}`);
  // Content owned by this script; price, status, order and SEO edits made in Admin are kept on re-runs
  const content = {
    title: v.title,
    shortDescription: v.shortDescription,
    description: v.description,
    highlights: v.highlights,
    gallery: v.gallery.map(([id, alt]) => asset(id, alt)),
    category: category._id,
    durationDays: v.days.length,
    durationNights: v.days.length - 1,
    itinerary: v.days.map((d, i) => ({
      day: i + 1,
      title: d.title,
      description: d.note ?? "",
      location: d.title,
      overnight: d.overnight ? `Overnight stay at ${d.overnight}` : "",
      activities: d.activities,
      image: asset(d.image, d.title),
    })),
  };

  if (existing.some((t) => t.slug === v.slug)) {
    await Tour.updateOne({ slug: v.slug }, { $set: { ...content, "seo.metaDescription": v.shortDescription } });
    console.log(`Updated ${v.slug}`);
    continue;
  }
  await Tour.create({
    ...content,
    slug: v.slug,
    heroMedia: asset(v.hero, v.title),
    price: v.price,
    currency: "USD",
    startLocation: "Bandaranaike International Airport",
    endLocation: "Bandaranaike International Airport",
    tourType: template?.tourType ?? "Private round tour",
    difficulty: "easy",
    groupSize: template?.groupSize ?? "1 – 10",
    included: template?.included ?? [],
    excluded: template?.excluded ?? [],
    driver: template?.driver,
    seo: { seoTitle: v.title, metaDescription: v.shortDescription, robots: "index,follow" },
    status: "published",
    featured: false,
    order: v.order,
  });
  console.log(`Created ${v.slug}`);
}

// Let the live site show the changes now instead of after its cache expires
revalidateFrontend(CACHE_TAGS.tours);
await new Promise((resolve) => setTimeout(resolve, 2000));
await disconnectDatabase();
