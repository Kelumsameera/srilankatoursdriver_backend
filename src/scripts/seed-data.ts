/**
 * Initial CMS content. Everything here is inserted ONCE (upsert with $setOnInsert) and is
 * fully editable in the admin afterwards – re-running the seed never overwrites admin edits.
 * No guest reviews, testimonials or guest videos are seeded: those must be real.
 */

export const SITE_SETTINGS = {
  siteName: "srilankatoursdriver",
  businessName: "Sri Lanka Tours Driver",
  tagline: "Private chauffeur-guided tours across Sri Lanka",
  address: "No:96, Maddawaththa, Halthota, Bandaragama, Sri Lanka, 12530",
  googleMapsUrl: "https://goo.gl/maps/jyHJkiXsQ3Vz1JTQA",
  phone: "+94769300334",
  whatsapp: "+94769300334",
  whatsappMessage: "Hello! I'd like to plan a tour in Sri Lanka.",
  email: "info@srilankatoursdriver.com",
  businessHours: "Open 24 Hours | 7 Days",
  websiteUrl: "https://www.srilankatoursdriver.com",
  timezone: "Asia/Colombo",
  currency: "USD",
  defaultLanguage: "en",
  footer: {
    description:
      "Private, tailor-made journeys around Sri Lanka with your own driver – from ancient cities and tea country to wildlife safaris and golden beaches.",
    columns: [
      {
        title: "Explore",
        enabled: true,
        links: [
          { label: "Tours", url: "/tours" },
          { label: "Destinations", url: "/destinations" },
          { label: "Excursions", url: "/excursions" },
          { label: "Vehicles", url: "/vehicles" },
          { label: "Gallery", url: "/gallery" },
        ],
      },
      {
        title: "Plan your trip",
        enabled: true,
        links: [
          { label: "Tailor-Made Tours", url: "/tailor-made-tours" },
          { label: "Book Now", url: "/booking" },
          { label: "Reviews", url: "/reviews" },
          { label: "FAQs", url: "/faqs" },
          { label: "Blog", url: "/blog" },
          { label: "Contact", url: "/contact" },
        ],
      },
    ],
    showTourLinks: true,
    showDestinationLinks: true,
    showSocial: true,
    copyright: "© {year} Sri Lanka Tours Driver. All rights reserved.",
    privacyUrl: "/privacy-policy",
    termsUrl: "/terms-and-conditions",
    cookieUrl: "/cookie-policy",
  },
};

export const NAVIGATION = [
  { label: "Home", url: "/" },
  { label: "Tours", url: "/tours" },
  { label: "Destinations", url: "/destinations" },
  { label: "Excursions", url: "/excursions" },
  { label: "Vehicles", url: "/vehicles" },
  { label: "Tailor-Made Tours", url: "/tailor-made-tours" },
  { label: "Gallery", url: "/gallery" },
  { label: "Blog", url: "/blog" },
  { label: "Contact", url: "/contact" },
  { label: "Book Now", url: "/booking", isCta: true },
];

export const CATEGORIES: { kind: string; name: string; icon?: string }[] = [
  ...["Safari", "Wildlife", "Beach", "Hiking", "Surfing", "Culture", "Adventure", "Tea", "Food", "Whale Watching", "Water Sports"].map((name) => ({
    kind: "excursion",
    name,
  })),
  ...["Cultural & Heritage", "Hill Country", "Beach & Coast", "Wildlife & Nature", "Round Tours"].map((name) => ({ kind: "tour", name })),
  ...["Cultural Triangle", "Hill Country", "South Coast", "West Coast", "National Parks"].map((name) => ({ kind: "destination", name })),
  ...["Car", "Van", "Coach", "SUV"].map((name) => ({ kind: "vehicle", name })),
  ...["Travel Tips", "Destinations", "Culture & Food", "Itineraries"].map((name) => ({ kind: "blog", name })),
  ...["Landscapes", "Wildlife", "Culture", "Beaches", "Guests"].map((name) => ({ kind: "gallery", name })),
];

export const DESTINATIONS = [
  {
    name: "Sigiriya",
    region: "Central Province",
    category: "Cultural Triangle",
    location: { lat: 7.957, lng: 80.7603 },
    shortDescription: "The 5th-century Lion Rock fortress rising 200 m above the jungle – a UNESCO World Heritage Site.",
    description:
      "Sigiriya is one of Sri Lanka's most iconic sights: a royal citadel built by King Kashyapa on top of a sheer granite rock. Climb past the famous frescoes, the Mirror Wall and the giant lion paws to reach the summit ruins and sweeping views across the Cultural Triangle. Early-morning or late-afternoon visits avoid the midday heat.",
    highlights: ["Lion Rock summit ruins", "Sigiriya frescoes", "Water gardens", "Pidurangala Rock sunrise"],
    bestTimeToVisit: "January to April (dry season); visit early morning",
    featured: true,
  },
  {
    name: "Ella",
    region: "Uva Province",
    category: "Hill Country",
    location: { lat: 6.8667, lng: 81.0466 },
    shortDescription: "A relaxed hill-country village of tea estates, waterfalls and the famous Nine Arches Bridge.",
    description:
      "Ella sits among misty mountains and tea plantations and is the end point of one of the world's most scenic train rides. Hike Little Adam's Peak or Ella Rock, watch the train cross the Nine Arches Bridge and enjoy the village's cafés.",
    highlights: ["Nine Arches Bridge", "Little Adam's Peak", "Ella Rock", "Ravana Falls", "Kandy–Ella train"],
    bestTimeToVisit: "January to March and July to September",
    featured: true,
  },
  {
    name: "Kandy",
    region: "Central Province",
    category: "Hill Country",
    location: { lat: 7.2906, lng: 80.6337 },
    shortDescription: "Sri Lanka's cultural capital and home of the Temple of the Sacred Tooth Relic.",
    description:
      "Set around a lake in the central hills, Kandy was the last royal capital of Sri Lanka. Visit the Temple of the Sacred Tooth Relic, the Royal Botanical Gardens in Peradeniya and enjoy a traditional Kandyan dance performance.",
    highlights: ["Temple of the Tooth", "Peradeniya Botanical Gardens", "Kandy Lake", "Kandyan dance show"],
    bestTimeToVisit: "January to April; the Esala Perahera festival takes place in July/August",
    featured: true,
  },
  {
    name: "Galle",
    region: "Southern Province",
    category: "South Coast",
    location: { lat: 6.0329, lng: 80.2168 },
    shortDescription: "A UNESCO-listed colonial fort town of ramparts, lighthouses and boutique streets.",
    description:
      "Galle Fort was built by the Portuguese and fortified by the Dutch. Walk the ramparts at sunset, explore the lighthouse, churches and museums, and browse cafés and boutiques in the narrow streets.",
    highlights: ["Galle Fort ramparts", "Lighthouse", "Dutch Reformed Church", "Sunset walk"],
    bestTimeToVisit: "November to April",
    featured: true,
  },
  {
    name: "Nuwara Eliya",
    region: "Central Province",
    category: "Hill Country",
    location: { lat: 6.9497, lng: 80.7891 },
    shortDescription: "\"Little England\" – cool climate, colonial bungalows and endless tea plantations.",
    description:
      "At around 1,900 m, Nuwara Eliya is the heart of tea country. Visit a working tea factory, stroll around Gregory Lake and explore Horton Plains National Park and World's End.",
    highlights: ["Tea factory visit", "Gregory Lake", "Horton Plains & World's End", "Victoria Park"],
    bestTimeToVisit: "February to April",
    featured: true,
  },
  {
    name: "Yala",
    region: "Southern & Uva Provinces",
    category: "National Parks",
    location: { lat: 6.3729, lng: 81.5167 },
    shortDescription: "Sri Lanka's most famous national park, known for leopards, elephants and sloth bears.",
    description:
      "Yala National Park has one of the highest leopard densities in the world. Jeep safaris also reveal elephants, sloth bears, crocodiles, water buffalo and many bird species.",
    highlights: ["Leopard spotting", "Elephants", "Sloth bears", "Birdlife"],
    bestTimeToVisit: "February to July (parts of the park close around September–October)",
    featured: true,
  },
  {
    name: "Mirissa",
    region: "Southern Province",
    category: "South Coast",
    location: { lat: 5.9483, lng: 80.4716 },
    shortDescription: "A palm-fringed beach town famous for whale watching and sunsets.",
    description:
      "Mirissa is a laid-back beach destination with a crescent bay, Coconut Tree Hill viewpoint and some of the best blue-whale watching in the world between November and April.",
    highlights: ["Whale watching", "Coconut Tree Hill", "Secret Beach", "Parrot Rock"],
    bestTimeToVisit: "November to April",
  },
  {
    name: "Bentota",
    region: "Southern Province",
    category: "West Coast",
    location: { lat: 6.4257, lng: 79.9958 },
    shortDescription: "Golden beaches, river safaris and water sports on the south-west coast.",
    description:
      "Bentota offers wide sandy beaches and calm waters, river boat safaris through mangroves, turtle hatcheries nearby and plenty of water sports.",
    highlights: ["Madu River safari", "Turtle hatchery", "Water sports", "Brief Garden & Lunuganga"],
    bestTimeToVisit: "November to April",
  },
  {
    name: "Anuradhapura",
    region: "North Central Province",
    category: "Cultural Triangle",
    location: { lat: 8.3114, lng: 80.4037 },
    shortDescription: "The first ancient capital, with giant stupas and the sacred Sri Maha Bodhi tree.",
    description:
      "Anuradhapura was the capital for over a thousand years. Its sacred city includes the Sri Maha Bodhi – grown from a cutting of the tree under which the Buddha attained enlightenment – and vast dagobas such as Ruwanwelisaya.",
    highlights: ["Sri Maha Bodhi", "Ruwanwelisaya", "Jetavanaramaya", "Isurumuniya"],
    bestTimeToVisit: "May to September",
  },
  {
    name: "Polonnaruwa",
    region: "North Central Province",
    category: "Cultural Triangle",
    location: { lat: 7.9403, lng: 81.0188 },
    shortDescription: "A medieval royal capital of palaces, temples and the Gal Vihara rock sculptures.",
    description:
      "Polonnaruwa's well-preserved ruins are easy to explore by bicycle or with your driver. Highlights include the Royal Palace, the Quadrangle and the Gal Vihara Buddha statues carved from granite.",
    highlights: ["Gal Vihara", "Royal Palace", "The Quadrangle", "Parakrama Samudra"],
    bestTimeToVisit: "May to September",
  },
  {
    name: "Dambulla",
    region: "Central Province",
    category: "Cultural Triangle",
    location: { lat: 7.8567, lng: 80.6492 },
    shortDescription: "The Golden Cave Temple – five caves filled with Buddha statues and murals.",
    description:
      "The Dambulla cave temple complex is a UNESCO World Heritage Site with over 150 Buddha statues and painted ceilings, and is a convenient base for exploring the Cultural Triangle.",
    highlights: ["Cave Temple", "Golden Buddha", "Minneriya elephant safari nearby"],
    bestTimeToVisit: "May to September",
  },
  {
    name: "Colombo",
    region: "Western Province",
    category: "West Coast",
    location: { lat: 6.9271, lng: 79.8612 },
    shortDescription: "Sri Lanka's vibrant commercial capital of markets, temples and seaside promenades.",
    description:
      "Colombo blends colonial buildings, modern towers, busy bazaars and a seaside promenade. Visit Gangaramaya Temple, Pettah Market, Galle Face Green and the National Museum.",
    highlights: ["Gangaramaya Temple", "Pettah Market", "Galle Face Green", "National Museum"],
    bestTimeToVisit: "December to March",
  },
];

export const EXCURSIONS = [
  {
    title: "Yala National Park Jeep Safari",
    category: "Safari",
    destination: "Yala",
    location: "Yala",
    duration: "Half day",
    shortDescription: "Track leopards, elephants and sloth bears on a guided jeep safari.",
    description: "Early-morning or afternoon jeep safari in Yala National Park with a park tracker. Your driver collects you from your hotel.",
    highlights: ["Leopards", "Elephants", "Sloth bears", "Birdlife"],
    featured: true,
  },
  {
    title: "Mirissa Whale Watching",
    category: "Whale Watching",
    destination: "Mirissa",
    location: "Mirissa harbour",
    duration: "4–5 hours",
    shortDescription: "Head out at sunrise to look for blue whales, sperm whales and dolphins.",
    description: "A morning boat trip from Mirissa harbour during the whale season (November–April).",
    highlights: ["Blue whales", "Dolphins", "Sunrise at sea"],
    featured: true,
  },
  {
    title: "Sigiriya Rock & Dambulla Cave Temple",
    category: "Culture",
    destination: "Sigiriya",
    location: "Sigiriya & Dambulla",
    duration: "Full day",
    shortDescription: "Climb the Lion Rock fortress and visit the Golden Cave Temple.",
    description: "A full-day cultural excursion combining two UNESCO World Heritage Sites in the Cultural Triangle.",
    highlights: ["Lion Rock summit", "Frescoes", "Cave Temple"],
    featured: true,
  },
  {
    title: "Ella Hiking: Little Adam's Peak & Nine Arches",
    category: "Hiking",
    destination: "Ella",
    location: "Ella",
    duration: "Half day",
    shortDescription: "An easy, scenic hike with panoramic views, followed by the iconic Nine Arches Bridge.",
    description: "Suitable for most fitness levels. Best started early in the morning.",
    highlights: ["Little Adam's Peak", "Nine Arches Bridge", "Tea plantations"],
  },
  {
    title: "Tea Factory & Plantation Visit",
    category: "Tea",
    destination: "Nuwara Eliya",
    location: "Nuwara Eliya",
    duration: "2–3 hours",
    shortDescription: "See how Ceylon tea is plucked, withered, rolled and fermented – then taste it.",
    description: "Visit a working tea estate and factory in the hill country, ending with a tasting.",
    highlights: ["Factory tour", "Tea tasting", "Plantation views"],
  },
  {
    title: "Galle Fort Walking Tour",
    category: "Culture",
    destination: "Galle",
    location: "Galle",
    duration: "2–3 hours",
    shortDescription: "Explore ramparts, lighthouses and colonial streets inside the UNESCO-listed fort.",
    description: "A relaxed walk around Galle Fort, ideally timed to finish at sunset on the ramparts.",
    highlights: ["Ramparts", "Lighthouse", "Sunset"],
  },
];

export const VEHICLES = [
  {
    name: "Comfort Car",
    type: "Sedan",
    category: "Car",
    seats: 3,
    luggageCapacity: 2,
    description: "An air-conditioned sedan for couples and small families travelling light.",
    features: ["Air conditioning", "Bottled water", "Phone charging"],
  },
  {
    name: "Family Van",
    type: "Van",
    category: "Van",
    seats: 7,
    luggageCapacity: 6,
    description: "A spacious air-conditioned van – ideal for families and groups with more luggage.",
    features: ["Air conditioning", "Reclining seats", "Large luggage space"],
    featured: true,
  },
  {
    name: "Mini Coach",
    type: "Coach",
    category: "Coach",
    seats: 20,
    luggageCapacity: 15,
    description: "An air-conditioned mini coach for larger groups and events.",
    features: ["Air conditioning", "Microphone", "Large luggage hold"],
  },
];

const day = (dayNo: number, title: string, description: string, location: string, overnight: string, activities: string[] = []) => ({
  day: dayNo,
  title,
  description,
  location,
  overnight,
  activities,
  meals: [],
});

export const TOURS = [
  {
    title: "Classic Sri Lanka: Culture, Tea Country & Coast",
    category: "Round Tours",
    durationDays: 8,
    durationNights: 7,
    startLocation: "Bandaranaike International Airport (CMB)",
    endLocation: "Bandaranaike International Airport (CMB)",
    destinations: ["Sigiriya", "Dambulla", "Polonnaruwa", "Kandy", "Nuwara Eliya", "Ella", "Yala", "Galle"],
    shortDescription:
      "Ancient cities, the Kandy–Ella hill-country train, a Yala safari and the colonial charm of Galle – Sri Lanka's highlights with your private driver.",
    description:
      "This private round tour covers the classic highlights of Sri Lanka at a comfortable pace. Your driver meets you at the airport and stays with you throughout, so you can adjust timings, add stops and travel at your own rhythm.",
    highlights: ["Sigiriya Lion Rock", "Temple of the Tooth, Kandy", "Scenic hill-country train", "Yala jeep safari", "Galle Fort"],
    included: ["Private air-conditioned vehicle", "Chauffeur-guide for the whole tour", "Fuel, parking and highway tolls", "Airport pickup and drop-off"],
    excluded: ["International flights", "Entrance fees", "Meals unless stated", "Personal expenses and tips"],
    featured: true,
    itinerary: [
      day(1, "Arrival – Sigiriya", "Meet your driver at the airport and transfer to the Sigiriya area to rest.", "Sigiriya", "Sigiriya"),
      day(2, "Sigiriya & Polonnaruwa", "Early climb of Sigiriya Rock, then explore the ancient city of Polonnaruwa.", "Sigiriya", "Sigiriya", ["Sigiriya Rock", "Polonnaruwa"]),
      day(3, "Dambulla – Kandy", "Visit the Dambulla Cave Temple and a spice garden on the way to Kandy. Evening cultural show.", "Kandy", "Kandy", ["Dambulla Cave Temple", "Spice garden", "Kandyan dance"]),
      day(4, "Kandy – Nuwara Eliya", "Temple of the Tooth in the morning, then drive into tea country with a tea factory stop.", "Nuwara Eliya", "Nuwara Eliya", ["Temple of the Tooth", "Tea factory"]),
      day(5, "Train to Ella", "Ride the famous hill-country train to Ella while your driver brings the luggage.", "Ella", "Ella", ["Scenic train ride", "Nine Arches Bridge"]),
      day(6, "Ella – Yala", "Morning hike to Little Adam's Peak, then continue to Yala for an afternoon jeep safari.", "Yala", "Yala", ["Little Adam's Peak", "Jeep safari"]),
      day(7, "Yala – Galle", "Drive along the south coast to Galle and walk the fort ramparts at sunset.", "Galle", "Galle", ["Galle Fort"]),
      day(8, "Departure", "Transfer to the airport for your departure flight.", "Colombo", ""),
    ],
  },
  {
    title: "South Coast Beaches & Wildlife",
    category: "Beach & Coast",
    durationDays: 5,
    durationNights: 4,
    startLocation: "Colombo",
    endLocation: "Colombo",
    destinations: ["Bentota", "Galle", "Mirissa", "Yala"],
    shortDescription: "Golden beaches, whale watching, a leopard safari and Galle Fort on a relaxed coastal trip.",
    description: "A relaxed private tour of Sri Lanka's south coast, combining beach time with wildlife and heritage.",
    highlights: ["Madu River safari", "Galle Fort", "Whale watching (seasonal)", "Yala safari"],
    included: ["Private air-conditioned vehicle", "Chauffeur-guide", "Fuel, parking and tolls"],
    excluded: ["Accommodation unless arranged", "Entrance fees", "Boat and safari tickets"],
    featured: true,
    itinerary: [
      day(1, "Colombo – Bentota", "Coastal drive to Bentota with a Madu River boat safari.", "Bentota", "Bentota", ["Madu River safari"]),
      day(2, "Bentota – Galle – Mirissa", "Turtle hatchery stop, Galle Fort walk, then on to Mirissa.", "Mirissa", "Mirissa", ["Turtle hatchery", "Galle Fort"]),
      day(3, "Mirissa", "Optional early whale-watching trip (Nov–Apr) and a free afternoon on the beach.", "Mirissa", "Mirissa", ["Whale watching"]),
      day(4, "Mirissa – Yala", "Drive east to Yala for an afternoon jeep safari.", "Yala", "Yala", ["Jeep safari"]),
      day(5, "Yala – Colombo", "Return to Colombo via the Southern Expressway.", "Colombo", ""),
    ],
  },
  {
    title: "Kandy & Hill Country Tea Trails",
    category: "Hill Country",
    durationDays: 4,
    durationNights: 3,
    startLocation: "Colombo",
    endLocation: "Ella",
    destinations: ["Kandy", "Nuwara Eliya", "Ella"],
    shortDescription: "Temples, tea estates, waterfalls and the world-famous train ride through the mountains.",
    description: "A short private journey into Sri Lanka's cool, green highlands.",
    highlights: ["Temple of the Tooth", "Tea factory", "Horton Plains (optional)", "Nine Arches Bridge"],
    included: ["Private air-conditioned vehicle", "Chauffeur-guide", "Fuel, parking and tolls"],
    excluded: ["Accommodation unless arranged", "Entrance fees", "Train tickets"],
    itinerary: [
      day(1, "Colombo – Kandy", "Drive to Kandy via the Pinnawala area; evening at the Temple of the Tooth.", "Kandy", "Kandy"),
      day(2, "Kandy – Nuwara Eliya", "Royal Botanical Gardens, then tea country with a factory visit.", "Nuwara Eliya", "Nuwara Eliya"),
      day(3, "Nuwara Eliya – Ella", "Optional Horton Plains at dawn, then the scenic train to Ella.", "Ella", "Ella"),
      day(4, "Ella", "Little Adam's Peak and Nine Arches Bridge before onward travel.", "Ella", ""),
    ],
  },
];

export const FAQS = [
  {
    question: "How do I book a tour?",
    answer: "Send a booking request through the website, use the tailor-made planner, or message us on WhatsApp. We reply with a confirmed itinerary and quote.",
    category: "Booking",
  },
  {
    question: "Can I change the itinerary?",
    answer: "Yes. All tours are private, so routes, timings and stops can be adjusted to suit you – before and during the trip.",
    category: "Tours",
  },
  {
    question: "Can you pick me up from the airport?",
    answer: "Yes, airport pickups and drop-offs at Bandaranaike International Airport (CMB) can be arranged at any time of day or night.",
    category: "Transport",
  },
  {
    question: "What vehicles do you use?",
    answer: "Air-conditioned cars, vans and mini coaches depending on your group size and luggage. See the Vehicles page for details.",
    category: "Transport",
  },
  {
    question: "When is the best time to visit Sri Lanka?",
    answer:
      "Sri Lanka is a year-round destination. The west and south coasts and hill country are best from December to April, while the east coast is best from May to September.",
    category: "Travel",
  },
  {
    question: "How can I contact you?",
    answer: "We are available 24 hours a day, 7 days a week by phone, WhatsApp and email – see the Contact page.",
    category: "General",
  },
];

type SectionSeed = {
  type: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  items?: { title: string; description: string; icon?: string }[];
  buttons?: { label: string; url: string; variant?: string }[];
  settings?: { limit?: number; source?: string; theme?: string; layout?: string };
};

export const HOME_SECTIONS: SectionSeed[] = [
  { type: "hero" },
  {
    type: "whyChooseUs",
    eyebrow: "Why travel with us",
    title: "Your island, your pace, your driver",
    subtitle: "Private journeys planned around you by people who know Sri Lanka.",
    items: [
      { title: "Private chauffeur-guide", description: "One dedicated driver for your whole trip – no shared buses, no rushing.", icon: "car" },
      { title: "Tailor-made itineraries", description: "Every route is built around your interests, dates and budget.", icon: "map" },
      { title: "Available 24/7", description: "Reachable day and night by phone and WhatsApp before and during your trip.", icon: "clock" },
      { title: "Local knowledge", description: "Hidden viewpoints, honest restaurant tips and the best time to visit each sight.", icon: "compass" },
    ],
    settings: { theme: "sand" },
  },
  {
    type: "popularTours",
    eyebrow: "Signature journeys",
    title: "Popular tours",
    subtitle: "Hand-picked routes you can take as they are or adapt to your style.",
    buttons: [{ label: "View all tours", url: "/tours", variant: "outline" }],
    settings: { limit: 6, source: "featured" },
  },
  {
    type: "destinations",
    eyebrow: "Where to go",
    title: "Discover Sri Lanka",
    subtitle: "From ancient kingdoms to misty tea hills and palm-fringed beaches.",
    buttons: [{ label: "All destinations", url: "/destinations", variant: "outline" }],
    settings: { limit: 8, source: "featured" },
  },
  {
    type: "excursions",
    eyebrow: "Day experiences",
    title: "Excursions & activities",
    subtitle: "Safaris, whale watching, hikes, tea estates and cultural treasures.",
    buttons: [{ label: "All excursions", url: "/excursions", variant: "outline" }],
    settings: { limit: 6, source: "featured" },
  },
  {
    type: "vehicles",
    eyebrow: "Travel in comfort",
    title: "Our vehicles",
    subtitle: "Clean, air-conditioned vehicles sized for couples, families and groups.",
    buttons: [{ label: "See all vehicles", url: "/vehicles", variant: "outline" }],
    settings: { limit: 3, source: "all", theme: "sand" },
  },
  {
    type: "tailorMade",
    eyebrow: "Tailor-made",
    title: "Design your perfect Sri Lanka journey",
    subtitle: "Tell us your dates, interests and budget – we'll craft a private itinerary just for you, free of charge.",
    buttons: [
      { label: "Plan my trip", url: "/tailor-made-tours", variant: "primary" },
      { label: "Chat on WhatsApp", url: "whatsapp", variant: "whatsapp" },
    ],
    settings: { theme: "forest" },
  },
  {
    type: "gallery",
    eyebrow: "Moments",
    title: "Gallery",
    subtitle: "Scenes from the road.",
    buttons: [{ label: "Open gallery", url: "/gallery", variant: "outline" }],
    settings: { limit: 8, source: "latest" },
  },
  {
    type: "guestShorts",
    eyebrow: "On the road",
    title: "Guest shorts",
    subtitle: "Short clips shared by our travellers.",
    settings: { limit: 6, source: "latest" },
  },
  {
    type: "reviews",
    eyebrow: "Guest stories",
    title: "What our guests say",
    buttons: [{ label: "Read all reviews", url: "/reviews", variant: "outline" }],
    settings: { limit: 6, source: "featured", theme: "sand" },
  },
  {
    type: "tripadvisor",
    eyebrow: "TripAdvisor",
    title: "Find us on TripAdvisor",
    subtitle: "Read independent reviews from travellers.",
  },
  {
    type: "blog",
    eyebrow: "Travel journal",
    title: "Tips & inspiration",
    buttons: [{ label: "Visit the blog", url: "/blog", variant: "outline" }],
    settings: { limit: 3, source: "latest" },
  },
  {
    type: "cta",
    title: "Ready to explore Sri Lanka?",
    subtitle: "Message us any time – we're available 24 hours a day, 7 days a week.",
    buttons: [
      { label: "Book now", url: "/booking", variant: "primary" },
      { label: "WhatsApp us", url: "whatsapp", variant: "whatsapp" },
    ],
    settings: { theme: "dark" },
  },
];

export const SYSTEM_PAGES: { slug: string; title: string; subtitle: string; sections?: SectionSeed[] }[] = [
  { slug: "home", title: "Sri Lanka Tours Driver", subtitle: "Private chauffeur-guided tours across Sri Lanka", sections: HOME_SECTIONS },
  {
    slug: "tours",
    title: "Sri Lanka Tours",
    subtitle: "Private round tours with your own chauffeur-guide – every itinerary can be tailored.",
    sections: [
      {
        type: "cta",
        title: "Can't find the perfect tour?",
        subtitle: "We'll design one around your dates and interests.",
        buttons: [{ label: "Plan a tailor-made tour", url: "/tailor-made-tours", variant: "primary" }],
        settings: { theme: "forest" },
      },
    ],
  },
  { slug: "destinations", title: "Destinations", subtitle: "Explore Sri Lanka's most beautiful places." },
  { slug: "excursions", title: "Excursions", subtitle: "Day trips and experiences across the island." },
  { slug: "vehicles", title: "Our Vehicles", subtitle: "Comfortable, air-conditioned vehicles for every group size." },
  {
    slug: "tailor-made-tours",
    title: "Tailor-Made Tours",
    subtitle: "Tell us about your dream trip and we'll design a private itinerary just for you.",
  },
  { slug: "gallery", title: "Gallery", subtitle: "Photos and videos from around Sri Lanka." },
  { slug: "blog", title: "Travel Blog", subtitle: "Tips, guides and inspiration for your Sri Lanka journey." },
  { slug: "reviews", title: "Guest Reviews", subtitle: "Honest feedback from travellers who explored Sri Lanka with us." },
  { slug: "contact", title: "Contact Us", subtitle: "We're available 24 hours a day, 7 days a week." },
  { slug: "booking", title: "Book Your Trip", subtitle: "Send a booking request – we'll confirm availability and reply quickly." },
  { slug: "faqs", title: "Frequently Asked Questions", subtitle: "Everything you need to know before you travel." },
];

const legal = (title: string, body: string) => ({ title, content: body });

/** Starter legal pages – review with your legal adviser before launch. */
export const CUSTOM_PAGES = [
  {
    slug: "privacy-policy",
    ...legal(
      "Privacy Policy",
      `## Who we are\nSri Lanka Tours Driver ("we", "us") operates www.srilankatoursdriver.com.\n\n## What we collect\nWhen you send a booking request, tailor-made enquiry, review or contact message we collect the details you provide, such as your name, email, phone/WhatsApp number, country, travel dates and preferences.\n\n## How we use it\nWe use your information only to respond to your enquiry, plan and operate your trip, and communicate with you about it. We do not sell your personal data.\n\n## Storage and retention\nYour data is stored securely and kept only as long as needed for these purposes or as required by law.\n\n## Your rights\nYou may ask us to access, correct or delete your personal data at any time by emailing us.\n\n## Contact\nFor privacy questions, contact us using the details on our Contact page.`,
    ),
  },
  {
    slug: "terms-and-conditions",
    ...legal(
      "Terms & Conditions",
      `## Bookings\nA booking request is not confirmed until we confirm it in writing with an itinerary and price.\n\n## Prices\nPrices are quoted per trip or per person as stated in your quote. Entrance fees, meals and personal expenses are excluded unless stated.\n\n## Changes and cancellations\nPlease contact us as early as possible about changes or cancellations. Any applicable fees will be stated in your quote.\n\n## Responsibility\nWe take every care to provide a safe and enjoyable journey. Travellers are responsible for valid travel documents and appropriate travel insurance.\n\n## Contact\nQuestions about these terms? Contact us using the details on our Contact page.`,
    ),
  },
  {
    slug: "cookie-policy",
    ...legal(
      "Cookie Policy",
      `## Cookies we use\nThis website uses only essential cookies needed for it to function (for example remembering your language). We do not use advertising cookies.\n\n## Managing cookies\nYou can delete or block cookies in your browser settings; some features may not work without them.`,
    ),
  },
];

export const SEO_GLOBAL = {
  key: "global",
  titleTemplate: "%s | {siteName}",
  seoTitle: "Sri Lanka Tours Driver – Private Chauffeur-Guided Tours in Sri Lanka",
  metaDescription:
    "Private, tailor-made Sri Lanka tours with your own chauffeur-guide. Cultural Triangle, tea country, safaris and beaches. Available 24/7.",
  keywords: ["Sri Lanka tours", "Sri Lanka driver", "Sri Lanka chauffeur", "Sri Lanka private tour", "tailor-made Sri Lanka"],
  robots: "index,follow",
};
