/** Reviewed copy for the 2026-10-16 audit. Existing custom CMS copy takes precedence. */
export const SEO_AUDIT_CONTENT: Record<string, { seoTitle: string; metaDescription: string; legacyDescriptions: string[]; content?: string }> = {
  home: {
    seoTitle: "Sri Lanka Tours Driver | Private Tours & Chauffeur",
    metaDescription: "Explore Sri Lanka with Sri Lanka Tours Driver. Plan private tours, day trips and airport transfers with a chauffeur and an itinerary built around you.",
    legacyDescriptions: ["Private chauffeur guided tours across Sri Lanka", "Private chauffeur-guided tours across Sri Lanka"],
  },
  destinations: {
    seoTitle: "Best Places to Visit in Sri Lanka | Sri Lanka Tours",
    metaDescription: "Discover places to visit in Sri Lanka, from Sigiriya and Kandy to beaches and wildlife parks. Find destinations for your private tour with a driver.",
    legacyDescriptions: ["Discover the best places to visit in Sri Lanka. Explore top tourist attractions, ancient heritage sites, beautiful beaches, and wild safaris with a private driver."],
  },
  excursions: {
    seoTitle: "Sri Lanka Day Trips & Excursions | Private Driver",
    metaDescription: "Explore Sri Lanka on private day trips and excursions. Browse cultural sights, wildlife experiences and coastal stops, then plan a trip with your driver.",
    legacyDescriptions: ["Day trips and experiences across the island."],
  },
  gallery: {
    seoTitle: "Sri Lanka Travel Gallery | Sri Lanka Tours Driver",
    metaDescription: "Browse photos and videos of Sri Lanka's landscapes, heritage sites and travel experiences. Find inspiration for a private tour with Sri Lanka Tours Driver.",
    legacyDescriptions: ["Photos and videos from around Sri Lanka."],
    content: `## Find inspiration for your Sri Lanka trip
Explore the gallery for a closer look at the places and experiences you can include in a private tour. Look for the landscapes, activities and moments that appeal to you. A photograph is a starting point for planning, rather than a promise of the exact conditions on your travel dates.

### Turn an idea into a route
Make a shortlist of the places you would like to see. Then browse our [destinations](/destinations) to learn more about each stop. Our [tour itineraries](/tours) can help you compare routes and see how different areas fit into one trip.

### Plan around your interests
Tell us which images inspired you, along with your dates and group size. We can discuss how those ideas fit your available time. Wildlife sightings, weather and seasonal conditions vary. Use the [tailor-made tour form](/tailor-made-tours) to share your plans and ask about a route that suits you.`,
  },
  blog: {
    seoTitle: "Sri Lanka Travel Blog | Guides & Trip Planning",
    metaDescription: "Read Sri Lanka travel guides and trip-planning ideas. Explore destinations, private tours and practical questions before planning your journey with a driver.",
    legacyDescriptions: ["Tips, guides and inspiration for your Sri Lanka journey."],
    content: `## Plan your Sri Lanka journey
Use our travel articles to explore ideas for your visit and decide what matters most to you. Start with the places you want to see, the activities you enjoy and the time you have available. A focused route usually gives you more time at each stop and less time on the road.

### From reading to planning
Compare ideas from the blog with our [destinations](/destinations) and [private tours](/tours). Think about how you want to divide your trip between sightseeing and rest. Share your priorities with us so we can discuss a route, rather than trying to fit every attraction into one visit.

### Check details before you travel
Transport times, opening hours, entry requirements and local conditions can change. Confirm important details with the relevant operator or official source before making a booking. If you have a question about a private tour, [contact our team](/contact) or send your dates through the [tailor-made enquiry form](/tailor-made-tours).`,
  },
  about: {
    seoTitle: "About Sri Lanka Tours Driver | Private Tour Planning",
    metaDescription: "Meet Sri Lanka Tours Driver and learn about private travel with a chauffeur. Explore our approach to tailored routes, sightseeing and planning your trip.",
    legacyDescriptions: ["A smiling sun all year round, golden beaches, ancient cities, safaris, lovely people in a tropical paradise — Sri Lanka offers an unforgettable travelling experience you can ever imagine."],
  },
  contact: {
    seoTitle: "Contact Sri Lanka Tours Driver | Plan Your Private Tour",
    metaDescription: "Contact Sri Lanka Tours Driver to discuss private tours, day trips and transfers. Share your dates, group size and interests to start planning your journey.",
    legacyDescriptions: ["We're available 24 hours a day, 7 days a week."],
    content: `## Tell us about your travel plans
Use the contact form to ask a question about a private Sri Lanka tour, day trip or transfer. You can also use the phone, email or WhatsApp details shown on this page. Sharing a few details at the start helps us understand what you need.

### What to include in your enquiry
Tell us your intended travel dates, the number of travellers and your arrival or pickup location. Mention any places you already have in mind. Let us know about luggage, child seats or other needs that may affect the vehicle or route. If your dates are flexible, say so in your message.

### Planning your next step
For a detailed route request, use our [tailor-made tour form](/tailor-made-tours). You can also browse [private tour itineraries](/tours) for ideas. An enquiry starts a conversation; it does not confirm availability or a booking. Review the itinerary, price and included services with us before confirming your arrangements.`,
  },
  "tailor-made-tours": {
    seoTitle: "Tailor-Made Sri Lanka Tours | Your Private Itinerary",
    metaDescription: "Create a tailor-made Sri Lanka tour around your dates, interests and group. Share your plans and discuss a private itinerary with Sri Lanka Tours Driver.",
    legacyDescriptions: ["Tell us about your dream trip and we'll design a private itinerary just for you."],
    content: `## Build a Sri Lanka trip around you
A tailor-made tour starts with your interests and the time you have available. Share your preferred dates, group size and arrival point in the form below. Tell us whether you prefer cultural sights, wildlife, hill-country scenery, beach time or a mix of experiences.

### Choose a comfortable pace
You do not need a complete itinerary before contacting us. A shortlist of places is enough to begin. Let us know if you prefer longer stays in fewer locations or a route with more stops. Travel time between destinations is an important part of planning a comfortable journey.

### Review your proposed arrangements
Your enquiry helps us discuss a route and suitable vehicle options. Availability, prices and included services need to be confirmed for your dates. Check the itinerary and quote before making a booking. For ideas, browse our [destinations](/destinations) and [private tour itineraries](/tours), then use the form to explain what you would like to change.`,
  },
};

interface PageCopy { slug: string; content?: string | null; seo?: { seoTitle?: string | null; metaDescription?: string | null } | null }

/** Only fill missing fields or replace descriptions reproduced in the audit. Never replace custom body text. */
export function planSeoAuditUpdate(page: PageCopy): Record<string, string> {
  const proposed = SEO_AUDIT_CONTENT[page.slug];
  if (!proposed) return {};
  const changes: Record<string, string> = {};
  if (!page.seo?.seoTitle?.trim()) changes["seo.seoTitle"] = proposed.seoTitle;
  const description = page.seo?.metaDescription?.trim();
  if (!description || proposed.legacyDescriptions.includes(description)) changes["seo.metaDescription"] = proposed.metaDescription;
  if (!page.content?.trim() && proposed.content) changes.content = proposed.content;
  return changes;
}
