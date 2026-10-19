import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { BlogPost, Category } from "../models/index.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";

// Four starter blog posts (one per blog category), published.
// Dry run by default; add --apply to write. Posts whose slug already exists are skipped, so it is safe to re-run.

const CLOUDINARY = "https://res.cloudinary.com/m3vlxnsr/image/upload";

const posts = [
  {
    category: "travel-tips",
    slug: "best-time-to-visit-sri-lanka",
    title: "The Best Time to Visit Sri Lanka, Coast by Coast",
    excerpt: "Two monsoons, one small island: how to pick the right months for the beaches, the hill country and the wildlife parks.",
    cover: { url: `${CLOUDINARY}/v1791403426/srilankatoursdriver/excursions/zip-toursmirissa.webp`, alt: "Palm-lined beach at Mirissa on the south coast" },
    tags: ["weather", "planning", "beaches"],
    content: `Sri Lanka is a year-round destination because it has two monsoons that arrive at different times on different coasts. When it rains on one side of the island, the other side is usually dry and sunny.

## December to April: the south and west coasts

This is the classic beach season for Mirissa, Unawatuna, Galle, Bentota and Hikkaduwa. The sea is calm, whale watching from Mirissa is at its best and the hill country is cool and clear in the mornings.

## May to September: the east coast

When the south-west monsoon reaches the west coast, head east. Trincomalee, Nilaveli, Pasikuda and Arugam Bay have their best weather now, and Arugam Bay is famous for surfing in these months.

## The Cultural Triangle and the hill country

Sigiriya, Dambulla, Polonnaruwa and Anuradhapura can be visited all year. Mornings are best for climbing Sigiriya before the heat. In the hill country around Kandy, Nuwara Eliya and Ella, expect cool evenings and occasional showers in any month.

## Good to know

- October and November are the inter-monsoon months, with afternoon showers across the island.
- Wildlife parks such as Yala close for part of the dry season (usually September and October), so check before you plan.
- Pack a light rain jacket whatever the month.

Not sure which route fits your dates? Tell us when you are travelling and we will suggest a route that follows the sunshine.`,
  },
  {
    category: "destinations",
    slug: "kandy-travel-guide",
    title: "Kandy Travel Guide: Temples, Lakes and Hill-Country Views",
    excerpt: "Sri Lanka's last royal capital is a calm lakeside city in the hills. Here is what to see in a day or two.",
    cover: { url: `${CLOUDINARY}/v1791403473/srilankatoursdriver/tours/zip-tourskandy-one-day-tour.jpg`, alt: "The Temple of the Sacred Tooth Relic in Kandy" },
    tags: ["kandy", "hill country", "temples"],
    content: `Kandy sits in the central hills, about three to four hours by road from Colombo or the airport. It was the last capital of the Sri Lankan kings and is now a UNESCO World Heritage city.

## Temple of the Sacred Tooth Relic

The Sri Dalada Maligawa houses Sri Lanka's most important Buddhist relic. Visit during an evening puja, when drums play and pilgrims bring flowers. Cover your shoulders and knees, and leave your shoes at the entrance.

## Kandy Lake

A gentle walk around the lake takes about an hour and gives lovely views of the temple and the hills, especially late in the afternoon.

## Royal Botanical Gardens, Peradeniya

Just outside the city, the gardens are famous for their orchid house, giant bamboo and an avenue of royal palms.

## A cultural dance show

Short evening shows of Kandyan dancing and fire-walking are held close to the lake and make a good end to the day.

## Where next?

Kandy is the gateway to the hill country. The scenic train to Nanu Oya or Ella starts here, and your driver can meet you at the other end with your luggage.`,
  },
  {
    category: "culture-and-food",
    slug: "sri-lankan-food-to-try",
    title: "Sri Lankan Food: 8 Dishes to Try on Your Trip",
    excerpt: "From rice and curry to hoppers and kottu, a short guide to the flavours you will meet on the road.",
    cover: { url: `${CLOUDINARY}/v1791403481/srilankatoursdriver/tours/zip-tourshabarana.jpg`, alt: "Elephant in the grasslands near Sigiriya" },
    tags: ["food", "culture"],
    content: `Sri Lankan food is generous, colourful and often spicy. Your driver will happily point you to the local places where they eat themselves.

## 1. Rice and curry

The everyday lunch: a plate of rice with several small curries, such as dhal, vegetables, fish or chicken, plus sambol and papadam.

## 2. Hoppers (appa)

Bowl-shaped pancakes made from fermented rice flour and coconut milk, crispy at the edge and soft in the middle. Try an egg hopper for breakfast or dinner.

## 3. String hoppers

Little nests of steamed rice noodles, usually eaten with a mild coconut curry and pol sambol.

## 4. Kottu roti

Chopped flatbread stir-fried on a hot griddle with vegetables, egg or meat. You will hear the rhythmic clatter of the blades before you see the stall.

## 5. Pol sambol

Fresh grated coconut with chilli, onion and lime. It goes with almost everything.

## 6. Lamprais

A Dutch-Burgher dish: rice and curries baked in a banana leaf.

## 7. Fish ambul thiyal

A sour, dry fish curry from the south coast, made with goraka (a tamarind-like fruit).

## 8. Curd and treacle

Buffalo curd with kithul palm syrup. A simple, much-loved dessert, especially on the road between the hills and the south coast.

## Tips

- Ask for "less spicy" if you prefer milder food; most cooks are happy to adjust.
- Many villages near Habarana and Sigiriya offer cooking classes, a great way to learn how the curries are made.`,
  },
  {
    category: "itineraries",
    slug: "7-day-sri-lanka-itinerary",
    title: "7 Days in Sri Lanka: A Classic Route with Your Own Driver",
    excerpt: "Ancient cities, the hill country and the south coast in one week: a balanced route with time to enjoy each stop.",
    cover: { url: `${CLOUDINARY}/v1791403420/srilankatoursdriver/excursions/zip-toursella.jpg`, alt: "The blue train crossing the hill country near Ella" },
    tags: ["itinerary", "one week", "first visit"],
    content: `One week is enough to see the highlights of Sri Lanka if you keep the driving days short. This route is a starting point; every stop can be changed.

## Day 1: Airport to Habarana or Sigiriya

Your driver meets you at the airport. Drive north to the Cultural Triangle and relax at your hotel.

## Day 2: Sigiriya and Dambulla

Climb Sigiriya Rock early in the morning, then visit the painted cave temples of Dambulla. In the afternoon, take a jeep safari in Minneriya or Kaudulla to see elephants.

## Day 3: Polonnaruwa, then Kandy

Cycle or walk around the ruins of the medieval capital, then continue to Kandy. Visit the Temple of the Tooth in the evening.

## Day 4: Train to the hill country

Take the scenic train from Kandy or Nanu Oya through the tea estates to Ella. Your driver brings your luggage by road.

## Day 5: Ella

Walk to Little Adam's Peak, see the Nine Arches Bridge and visit a tea factory.

## Day 6: The south coast

Drive down to the coast, with an optional safari in Udawalawe or Yala on the way. Overnight in Mirissa or Unawatuna.

## Day 7: Galle and back to the airport

Walk the ramparts of Galle Fort, then take the expressway back to Colombo or the airport.

## Make it yours

Prefer more beach time, a slower pace or a wildlife focus? Send us your dates and interests and we will tailor the route for you.`,
  },
];

try {
  await connectDatabase();
  const categories = await Category.find({ kind: "blog" }).lean();
  const plans = [];
  for (const post of posts) {
    const category = categories.find((c) => c.slug === post.category);
    if (!category) throw new Error(`Blog category missing: ${post.category}`);
    if (await BlogPost.exists({ slug: post.slug })) continue;
    plans.push(new BlogPost({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: { url: post.cover.url, alt: post.cover.alt, resourceType: "image" },
      author: "Sri Lanka Tours Driver",
      category: category._id,
      tags: post.tags,
      status: "published",
      seo: { seoTitle: post.title, metaDescription: post.excerpt },
    }));
  }
  for (const plan of plans) await plan.validate();
  console.log(JSON.stringify({ apply: process.argv.includes("--apply"), posts: plans.map((p) => p.slug) }));

  if (process.argv.includes("--apply") && plans.length) {
    // save() (not insertMany) so the reading time is worked out by the model
    for (const plan of plans) await plan.save();
    revalidateFrontend(CACHE_TAGS.blog);
    // Give the cache refresh request time to finish before the process exits
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
} finally {
  await disconnectDatabase();
}
