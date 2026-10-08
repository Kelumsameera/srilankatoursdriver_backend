# Old website discovery report

- **Website:** https://srilankatoursdriver.com
- **Run:** 2026-10-07T19:30:24.717Z → 2026-10-07T19:30:28.049Z (offline re-parse of the cache)
- **Requests:** 0 (retries 0, failures 0, blocked by robots 0); ≥1 s between requests

> **Read-only phase.** Nothing was written to MongoDB, nothing was uploaded to Cloudinary and no media files were downloaded. All output is local JSON under `backend/migration/`.

## Extraction method

Hybrid. Primary: sitemap_index.xml (Rank Math/Yoast-style) + polite HTML extraction of every public page (cheerio, no JS execution). Supplementary: the public WordPress REST API (/wp-json/wp/v2) for page/post metadata and media alt text/dimensions. The REST API was NOT used for content because the site's custom post types (to_book, destination, excursion, offers – BA Book Everything plugin) are not exposed there, and tour prices, durations, itineraries and inclusions are rendered by theme widgets rather than stored in post content.

## URLs

| Metric | Count |
| --- | --- |
| Discovered | 121 |
| Fetched | 101 |
| Fetched successfully | 93 |
| Failed (HTTP error / network) | 8 |
| Not fetched (skipped) | 20 |

### By category

| Category | URLs |
| --- | --- |
| about | 1 |
| contact | 1 |
| destination | 8 |
| destination (listing) | 1 |
| excursion | 17 |
| excursion (listing) | 1 |
| faq | 1 |
| gallery | 1 |
| homepage | 1 |
| other | 14 |
| page | 5 |
| system | 20 |
| tour-detail | 26 |
| tours (listing) | 17 |
| vehicle | 6 |
| vehicle (listing) | 1 |

### Skipped

| Reason | URLs |
| --- | --- |
| system/utility page – not fetched | 20 |

### Found only through internal links (not in any sitemap)

- https://srilankatoursdriver.com/tours-list-view/
- https://srilankatoursdriver.com/airport-transfers/
- https://srilankatoursdriver.com/to_book/5-days-tour-sri-lanka/
- https://srilankatoursdriver.com/to_book/5-days-east-coast-tour-sri-lanka/
- https://srilankatoursdriver.com/to_book/8-days-down-south-tour-sri-lanka/
- https://srilankatoursdriver.com/to_book/8-days-east-coast-tour/
- https://srilankatoursdriver.com/my-account/?action=lostpassword
- https://srilankatoursdriver.com/author/srilankatoursdriver/
- https://srilankatoursdriver.com/all-tours/?paged=2
- https://srilankatoursdriver.com/to_book/?paged=2
- https://srilankatoursdriver.com/ba_locations/kandy/
- https://srilankatoursdriver.com/ba_locations/habarana/
- https://srilankatoursdriver.com/ba_locations/negombo/
- https://srilankatoursdriver.com/ba_locations/nuwara-eliya/
- https://srilankatoursdriver.com/ba_locations/ella/
- https://srilankatoursdriver.com/ba_locations/mirissa/
- https://srilankatoursdriver.com/ba_locations/hikkaduwa/
- https://srilankatoursdriver.com/ba_locations/yala-national-park/
- https://srilankatoursdriver.com/ba_locations/colombo/
- https://srilankatoursdriver.com/ba_locations/negombo-fish-market/
- https://srilankatoursdriver.com/ba_locations/pidurangala-rock/
- https://srilankatoursdriver.com/ba_locations/anuradhapura/
- https://srilankatoursdriver.com/tours/?paged=2
- https://srilankatoursdriver.com/all-tours/page/2/
- https://srilankatoursdriver.com/all-tours/page/2/?paged=1
- https://srilankatoursdriver.com/to_book/page/2/
- https://srilankatoursdriver.com/to_book/page/2/?paged=1
- https://srilankatoursdriver.com/tours/page/2/
- https://srilankatoursdriver.com/tours/page/2/?paged=1

## Content found

| Type | Count (excluding skipped) |
| --- | --- |
| Tours (incl. offers) | 21 |
| … of which /offers/ pages | 1 |
| Destinations | 8 |
| Excursions (transfer-rate pages) | 17 |
| Vehicles / drivers | 6 |
| Blog posts | 0 |
| Gallery items | 20 |
| Reviews | 6 |
| FAQ items | 14 |
| Pages | 12 |
| Page-section candidates | 21 |
| Tour categories | 4 |
| Header menu items | 12 |
| Media URLs (unique) | 257 |
| Media originals worth importing | 84 |

### Normalized datasets

| Dataset | Records | import | review | skip | quality ok | partial | failed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tours | 22 | 18 | 3 | 1 | 19 | 3 | 0 |
| vehicles | 6 | 0 | 6 | 0 | 6 | 0 | 0 |
| destinations | 8 | 0 | 8 | 0 | 0 | 8 | 0 |
| excursions | 17 | 0 | 17 | 0 | 0 | 17 | 0 |
| blog-posts | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| faqs | 14 | 0 | 14 | 0 | 14 | 0 | 0 |
| reviews | 6 | 6 | 0 | 0 | 6 | 0 | 0 |
| gallery | 20 | 0 | 20 | 0 | 20 | 0 | 0 |
| pages | 15 | 9 | 3 | 3 | 12 | 3 | 0 |
| page-sections | 21 | 0 | 21 | 0 | 16 | 5 | 0 |
| categories | 4 | 2 | 2 | 0 | 3 | 1 | 0 |
| navigation | 12 | 0 | 12 | 0 | 12 | 0 | 0 |
| site-settings | 1 | 0 | 1 | 0 | 1 | 0 | 0 |
| brand-settings | 1 | 1 | 0 | 0 | 1 | 0 | 0 |
| seo | 9 | 0 | 9 | 0 | 8 | 1 | 0 |

## Failed URLs / HTTP errors

| URL | Status | Error | Found via |
| --- | --- | --- | --- |
| https://srilankatoursdriver.com/tours-list-view/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/ |
| https://srilankatoursdriver.com/airport-transfers/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/, link:https://srilankatoursdriver.com/?page_id=964 |
| https://srilankatoursdriver.com/to_book/5-days-tour-sri-lanka/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/, link:https://srilankatoursdriver.com/?page_id=964 |
| https://srilankatoursdriver.com/to_book/5-days-east-coast-tour-sri-lanka/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/, link:https://srilankatoursdriver.com/?page_id=964 |
| https://srilankatoursdriver.com/to_book/8-days-down-south-tour-sri-lanka/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/, link:https://srilankatoursdriver.com/?page_id=964 |
| https://srilankatoursdriver.com/to_book/8-days-east-coast-tour/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/, link:https://srilankatoursdriver.com/?page_id=964 |
| https://srilankatoursdriver.com/ba_locations/habarana/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/to_book/05-days-east-coast-tour-sri-lanka/, link:https://srilankatoursdriver.com/to_book/05-days-east-coast-tour-with-hotels-sri-lanka/ |
| https://srilankatoursdriver.com/ba_locations/pidurangala-rock/ | 404 | HTTP 404 | link:https://srilankatoursdriver.com/to_book/10-days-down-south-tour/ |

## Parsing errors

_none_

## Missing important fields

**tours**

| Field | Records missing it | Examples |
| --- | --- | --- |
| price | 2 | /offers/10-days-east-coast-tour-offer/, /to_book/down-south-east-coast-10-days-offer/ |
| currency | 2 | /offers/10-days-east-coast-tour-offer/, /to_book/down-south-east-coast-10-days-offer/ |
| included | 1 | /offers/10-days-east-coast-tour-offer/ |
| itinerary | 1 | /offers/10-days-east-coast-tour-offer/ |
| durationDays | 1 | /to_book/down-south-east-coast-10-days-offer/ |

**destinations**

| Field | Records missing it | Examples |
| --- | --- | --- |
| region | 8 | /destination/colombo-city/, /destination/galle-face-green/, /destination/gangaramaya-temple/ |
| seo.metaDescription | 8 | /destination/colombo-city/, /destination/galle-face-green/, /destination/gangaramaya-temple/ |

**excursions**

| Field | Records missing it | Examples |
| --- | --- | --- |
| shortDescription | 11 | /excursion/anuradhapura/, /excursion/colombo/, /excursion/ella/ |
| price | 17 | /excursion/anuradhapura/, /excursion/arugam-bay/, /excursion/colombo-airport/ |
| duration | 17 | /excursion/anuradhapura/, /excursion/arugam-bay/, /excursion/colombo-airport/ |

**pages**

| Field | Records missing it | Examples |
| --- | --- | --- |
| content | 1 | /tailor-made-tours/ |
| seo.metaDescription | 1 | /tours/ |

**page-sections**

| Field | Records missing it | Examples |
| --- | --- | --- |
| title | 5 | /about-us/#section-1, /drivers-guides/#section-1, /excursions/#section-1 |

**categories**

| Field | Records missing it | Examples |
| --- | --- | --- |
| members | 1 | /sri-lanka-tour-offers/ |

**seo**

| Field | Records missing it | Examples |
| --- | --- | --- |
| metaDescription | 1 | /tours/ |

## Duplicates & conflicts

### Duplicate slugs

_none_

### Duplicate titles

| Model | Title | Sources |
| --- | --- | --- |
| GalleryItem | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lanka Negombo / Pinnawala / Sigiriya / Ella / Kirinda /… | https://www.instagram.com/p/CjKKUr6qjN6/, https://www.instagram.com/p/CjKKS4wqsz6/, https://www.instagram.com/p/CjKKQ8TKTWc/, https://www.instagram.com/p/CjKKO9IKFAg/, https://www.instagram.com/p/CjKKNMGqAJ5/, https://www.instagram.com/p/CjKKLF3qfGE/, https://www.instagram.com/p/CjKKI_lqWXp/, https://www.instagram.com/p/CjKKHDBKEpj/, https://www.instagram.com/p/CjKKE1Fq8vt/, https://www.instagram.com/p/CjKJ-B4qxL6/, https://www.instagram.com/p/CjKJ6oDK4X9/, https://www.instagram.com/p/CjKJ44GKhTI/, https://www.instagram.com/p/CjKJ27HqCc3/, https://www.instagram.com/p/CjKJ0xiqzFl/, https://www.instagram.com/p/CjKJy3lqvb2/, https://www.instagram.com/p/CjKJxJBKzDc/, https://www.instagram.com/p/CjKJu0BqC8j/ |

### Identical content

| Model | Field | Sources |
| --- | --- | --- |
| Tour | description | https://srilankatoursdriver.com/to_book/12-days-east-coast-tour-sri-lanka/, https://srilankatoursdriver.com/to_book/12-days-east-coast-tour-with-hotels-sri-lanka/ |

### Shared boilerplate text

| Model | Field | Records | Sample |
| --- | --- | --- | --- |
| Tour | shortDescription | 16 | Visit Sri Lanka and book an amazing tour package with us. Sri Lanka is amazing tropical country in the world. Our drivers are well-knowledge English speaking pr |
| Tour | seo.metaDescription | 16 | Visit Sri Lanka and book an amazing tour package with us. Sri Lanka is amazing tropical country in the world. Our drivers are well-knowledge English speaking |

### Invalid CMS slugs

_none_

### Collisions with the seeded CMS content (`src/scripts/seed-data.ts`, not the live database)

| Model | Kind | Migrated | Seeded | Source |
| --- | --- | --- | --- | --- |
| Destination | similar-name | colombo-city | Colombo (colombo) | https://srilankatoursdriver.com/destination/colombo-city/ |
| Destination | similar-name | galle-face-green | Galle (galle) | https://srilankatoursdriver.com/destination/galle-face-green/ |
| Destination | similar-name | yala-national-park | Yala (yala) | https://srilankatoursdriver.com/destination/yala-national-park/ |
| Excursion | similar-name | ella | Ella Hiking: Little Adam's Peak & Nine Arches (ella-hiking-little-adams-peak-and-nine-arches) | https://srilankatoursdriver.com/excursion/ella/ |
| Excursion | similar-name | galle | Galle Fort Walking Tour (galle-fort-walking-tour) | https://srilankatoursdriver.com/excursion/galle/ |
| Excursion | similar-name | mirissa | Mirissa Whale Watching (mirissa-whale-watching) | https://srilankatoursdriver.com/excursion/mirissa/ |
| Page | same-slug | home | Sri Lanka Tours Driver (home) | https://srilankatoursdriver.com/ |
| Page | same-slug | contact | Contact Us (contact) | https://srilankatoursdriver.com/contact/ |
| Page | same-slug | destinations | Destinations (destinations) | https://srilankatoursdriver.com/destination-list/ |
| Page | same-slug | vehicles | Our Vehicles (vehicles) | https://srilankatoursdriver.com/drivers-guides/ |
| Page | same-slug | excursions | Excursions (excursions) | https://srilankatoursdriver.com/excursions/ |
| Page | same-slug | faqs | Frequently Asked Questions (faqs) | https://srilankatoursdriver.com/faq/ |
| Page | same-slug | gallery | Gallery (gallery) | https://srilankatoursdriver.com/gallery/ |
| Page | same-slug | privacy-policy | Privacy Policy (privacy-policy) | https://srilankatoursdriver.com/privacy-policy/ |
| Page | same-slug | tailor-made-tours | Tailor-Made Tours (tailor-made-tours) | https://srilankatoursdriver.com/tailor-made-tours/ |
| Page | same-slug | tours | Sri Lanka Tours (tours) | https://srilankatoursdriver.com/tours/ |
| Category | same-slug | tour:round-tours | Round Tours (tour) (tour:round-tours) | https://srilankatoursdriver.com/sri-lanka-round-tours/ |

### URL aliases (redirects / canonicals)

| URL | Resolves to | Reason |
| --- | --- | --- |
| https://srilankatoursdriver.com/all-tours/?paged=2 | https://srilankatoursdriver.com/all-tours/page/2/ | HTTP redirect |
| https://srilankatoursdriver.com/to_book/?paged=2 | https://srilankatoursdriver.com/to_book/page/2/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/kandy/ | https://srilankatoursdriver.com/excursion/kandy/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/negombo/ | https://srilankatoursdriver.com/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/nuwara-eliya/ | https://srilankatoursdriver.com/excursion/nuwara-eliya/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/ella/ | https://srilankatoursdriver.com/excursion/ella/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/mirissa/ | https://srilankatoursdriver.com/excursion/mirissa/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/hikkaduwa/ | https://srilankatoursdriver.com/excursion/hikkaduwa/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/yala-national-park/ | https://srilankatoursdriver.com/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/colombo/ | https://srilankatoursdriver.com/excursion/colombo/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/negombo-fish-market/ | https://srilankatoursdriver.com/ | HTTP redirect |
| https://srilankatoursdriver.com/ba_locations/anuradhapura/ | https://srilankatoursdriver.com/excursion/anuradhapura/ | HTTP redirect |
| https://srilankatoursdriver.com/tours/?paged=2 | https://srilankatoursdriver.com/tours/page/2/ | HTTP redirect |
| https://srilankatoursdriver.com/all-tours/page/2/?paged=1 | https://srilankatoursdriver.com/all-tours/ | HTTP redirect |
| https://srilankatoursdriver.com/to_book/page/2/?paged=1 | https://srilankatoursdriver.com/to_book/ | HTTP redirect |
| https://srilankatoursdriver.com/tours/page/2/?paged=1 | https://srilankatoursdriver.com/tours/ | HTTP redirect |
| https://srilankatoursdriver.com/all-tours/page/2/ | https://srilankatoursdriver.com/all-tours/ | rel=canonical points elsewhere |
| https://srilankatoursdriver.com/tours/page/2/ | https://srilankatoursdriver.com/tours/ | rel=canonical points elsewhere |

### Broken internal links

| URL | Status | Linked from |
| --- | --- | --- |
| https://srilankatoursdriver.com/tours-list-view/ | 404 | https://srilankatoursdriver.com/ |
| https://srilankatoursdriver.com/airport-transfers/ | 404 | https://srilankatoursdriver.com/, https://srilankatoursdriver.com/?page_id=964, https://srilankatoursdriver.com/about-us/ |
| https://srilankatoursdriver.com/to_book/5-days-tour-sri-lanka/ | 404 | https://srilankatoursdriver.com/, https://srilankatoursdriver.com/?page_id=964, https://srilankatoursdriver.com/about-us/ |
| https://srilankatoursdriver.com/to_book/5-days-east-coast-tour-sri-lanka/ | 404 | https://srilankatoursdriver.com/, https://srilankatoursdriver.com/?page_id=964, https://srilankatoursdriver.com/about-us/ |
| https://srilankatoursdriver.com/to_book/8-days-down-south-tour-sri-lanka/ | 404 | https://srilankatoursdriver.com/, https://srilankatoursdriver.com/?page_id=964, https://srilankatoursdriver.com/about-us/ |
| https://srilankatoursdriver.com/to_book/8-days-east-coast-tour/ | 404 | https://srilankatoursdriver.com/, https://srilankatoursdriver.com/?page_id=964, https://srilankatoursdriver.com/about-us/ |
| https://srilankatoursdriver.com/ba_locations/habarana/ | 404 | https://srilankatoursdriver.com/to_book/05-days-east-coast-tour-sri-lanka/, https://srilankatoursdriver.com/to_book/05-days-east-coast-tour-with-hotels-sri-lanka/, https://srilankatoursdriver.com/to_book/05-days-tour-sri-lanka/ |
| https://srilankatoursdriver.com/ba_locations/pidurangala-rock/ | 404 | https://srilankatoursdriver.com/to_book/10-days-down-south-tour/ |

### Duplicate media

- 54 images appear in several WordPress sizes (grouped under their original in `normalized/media.json`)
- 2 media URL spellings collapsed by normalization (e.g. `?ver=` parameters)
- 0 file names uploaded to more than one folder

## Media

```json
{
  "total": 257,
  "byType": {
    "image": 257
  },
  "byRole": {
    "avatar": 6,
    "background": 27,
    "content": 169,
    "favicon": 3,
    "gallery": 92,
    "hero": 31,
    "instagram": 20,
    "logo": 1,
    "og-image": 28,
    "ui-asset": 2
  },
  "sizeVariants": 147,
  "excludedFromImport": 26,
  "hostedExternally": 28,
  "withAltText": 124,
  "withDimensions": 158
}
```

## Per-record review list

### tours

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /offers/10-days-east-coast-tour-offer/ | 10 Days East Coast Tour Package – Offer | review | partial | price, currency, included, itinerary |  |
| /offers/5-days-test-offer/ | 5 Days test offer | skip | partial | price, currency, included, itinerary |  |
| /to_book/05-days-east-coast-tour-sri-lanka/ | 05 Days East Coast Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/05-days-east-coast-tour-with-hotels-sri-lanka/ | 05 Days East Coast Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/05-days-tour-sri-lanka/ | 05 Days Down South Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/05-days-tour-with-hotels-sri-lanka/ | 05 Days Down South Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/08-days-down-south-tour-sri-lanka/ | 08 Days Down South Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/08-days-down-south-tour-with-hotels-sri-lanka/ | 08 Days Down South Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/08-days-east-coast-tour-with-hotels-sri-lanka/ | 08 Days East Coast Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/08-days-east-coast-tour/ | 08 Days East Coast Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/10-days-down-south-tour-with-hotels/ | 10 Days Down South Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/10-days-down-south-tour/ | 10 Days Down South Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/10-days-east-coast-tour-sri-lanka/ | 10 Days East Coast Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/10-days-east-coast-tour-with-hotels-sri-lanka/ | 10 Days East Coast Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/12-days-down-south-tour/ | 12 Days Down South Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/12-days-east-coast-tour-sri-lanka/ | 12 Days East Coast Tour | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; identical description to https://srilankatoursdriver.com/to_book/12-days-east-coast-tour-with-hotels-sri-lanka/ |
| /to_book/12-days-east-coast-tour-with-hotels-sri-lanka/ | 12 Days East Coast Tour with Hotels | import | ok |  | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; identical description to https://srilankatoursdriver.com/to_book/12-days-east-coast-tour-sri-lanka/ |
| /to_book/down-south-east-coast-10-days-offer/ | Down South – Offer | review | partial | price, currency, durationDays | shortDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO; seo.metaDescription: same boilerplate text as 15 other Tour record(s) – rewrite for SEO |
| /to_book/galle-one-day-tour/ | Galle One Day Tour | import | ok |  |  |
| /to_book/kandy-one-day-tour/ | Kandy One Day Tour | import | ok |  |  |
| /to_book/sigiriya-one-day-tour/ | Sigiriya One Day Tour | import | ok |  |  |
| /to_book/udawalawa-safari-one-day-tour/ | Udawalawa Safari One Day Tour | review | ok |  | seo.metaDescription: appears cut off mid-sentence (auto-generated by the old SEO plugin) |

### vehicles

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /to_book/kumara-podi-car/ | Kumara (Podi) – Car | review | ok |  | dailyRate: old site shows this as 'Price From' – confirm it is a per-day rate before importing |
| /to_book/mahesh-car/ | Mahesh – Car | review | ok |  | seo.metaDescription: appears cut off mid-sentence (auto-generated by the old SEO plugin); dailyRate: old site shows this as 'Price From' – confirm it is a per-day rate before importing |
| /to_book/nilanka-french-speaking-car/ | Nilanka (French Speaking) – Car | review | ok |  | dailyRate: old site shows this as 'Price From' – confirm it is a per-day rate before importing |
| /to_book/saman-kdh-highroof-van/ | Saman – KDH Highroof Van | review | ok |  | dailyRate: old site shows this as 'Price From' – confirm it is a per-day rate before importing |
| /to_book/sanka-suv/ | Sanka – SUV | review | ok |  | dailyRate: old site shows this as 'Price From' – confirm it is a per-day rate before importing |
| /to_book/udesh-bus/ | Udesh – Bus | review | ok |  | dailyRate: old site shows this as 'Price From' – confirm it is a per-day rate before importing |

### destinations

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /destination/colombo-city/ | Colombo City | review | partial | region, seo.metaDescription |  |
| /destination/galle-face-green/ | Galle Face Green | review | partial | region, seo.metaDescription |  |
| /destination/gangaramaya-temple/ | Gangaramaya Temple | review | partial | region, seo.metaDescription |  |
| /destination/jami-ul-alfar-mosque/ | Jami Ul-Alfar Mosque | review | partial | region, seo.metaDescription |  |
| /destination/kelaniya-raja-maha-viharaya/ | Kelaniya Raja Maha Viharaya | review | partial | region, seo.metaDescription |  |
| /destination/old-parliament-building/ | Old Parliament Building | review | partial | region, seo.metaDescription |  |
| /destination/st-marys-church-negambo/ | St. Mary’s Church – Negambo | review | partial | region, seo.metaDescription |  |
| /destination/yala-national-park/ | Yala National Park | review | partial | region, seo.metaDescription |  |

### excursions

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /excursion/anuradhapura/ | Anuradhapura | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/arugam-bay/ | Arugambay | review | partial | price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/colombo-airport/ | Airport (CMB) | review | partial | price, duration | price: old excursion pages are transfer-rate tables (22 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/colombo/ | Colombo | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (21 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/ella/ | Ella | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/galle/ | Galle | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (21 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/hikkaduwa/ | Hikkaduwa | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/kalutara/ | Kalutara | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/kandy/ | Kandy | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (22 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/mirissa/ | Mirissa | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/negombo/ | Negombo | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (22 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/nuwara-eliya/ | Nuwara Eliya | review | partial | price, duration | price: old excursion pages are transfer-rate tables (22 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/pasikuda/ | Pasikuda | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (22 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/sigiriya/ | Habarana (Sigiriya) | review | partial | price, duration | price: old excursion pages are transfer-rate tables (20 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/trincomalee/ | Trincomalee | review | partial | price, duration | price: old excursion pages are transfer-rate tables (19 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/udawalawa/ | Udawalawa | review | partial | shortDescription, price, duration | price: old excursion pages are transfer-rate tables (19 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |
| /excursion/yala/ | Thissamaharama (Yala) | review | partial | price, duration | price: old excursion pages are transfer-rate tables (19 routes, LKR, per vehicle) – the Excursion model has a single price, so price is left empty and the rates are kept in the description table + unmapped.transferRates |

### faqs

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /faq/#faq-1 | WHAT ARE THE VISA REQUIREMENTS NEEDED ? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-2 | WHAT IS ELECTRONIC TRAVEL AUTHORIZATION (ETA)? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-3 | HOW MUCH DOES THE ETA COST? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-4 | ONCE THE 30 DAYS ARE OVER, HOW CAN I GET AN EXTENSION ON MY  | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-5 | WHAT IS THE BEST TIME TO VISIT SRI LANKA? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-6 | WHAT IS THE TIME DIFFERENCE IN SRI LANKA? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-7 | WHAT ABOUT ELECTRICITY? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-8 | WHAT ARE THE HEALTH PRECAUTIONS THAT I MUST TAKE BEFORE VISI | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-9 | WHAT ARE THE PAYMENT MODES IN SRI LANKA? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-10 | WHAT LANGUAGE WILL PEOPLE UNDERSTAND? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-11 | WHAT IS THE COUNTRY CODE AND HOW DO I DIAL AREA CODES? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-12 | WILL I BE ABLE TO USE MY DEBIT AND CREDIT CARD, IN CASE OF C | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-13 | WHAT ARE THE GENERAL WORKING HOURS AND DAYS? | review | ok |  | question: written in ALL CAPS on the old site |
| /faq/#faq-14 | WHAT ARE THE EMERGENCY CONTACT POINTS? | review | ok |  | question: written in ALL CAPS on the old site |

### reviews

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| / | Colombo Trip | import | ok |  |  |
| / | Highly recommended!! | import | ok |  |  |
| / | Sri Lanka tour | import | ok |  |  |
| / | Highly Recommend! | import | ok |  |  |
| / | Amazing Family Tour | import | ok |  |  |
| / | Excellent tour driver in Sri Lanka | import | ok |  |  |

### gallery

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| https://www.instagram.com/p/Cm16mGjNdkE/ | Wish you all a very Happy New Year 2023! | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time |
| https://www.instagram.com/p/CjNAGSwqCii/ | 🚨30% OFF \| 10 DAYS TOUR IN SRI LANKA (with Accommodation) L | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time |
| https://www.instagram.com/p/CjKKUr6qjN6/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as https://www.instagram.com/p/CjKKO9IKFAg/; same title as http |
| https://www.instagram.com/p/CjKKS4wqsz6/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as https://www.instagram.com/p/CjKKO9IKFAg/; same title as http |
| https://www.instagram.com/p/CjKKQ8TKTWc/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKO9IKFAg/; same title as http |
| https://www.instagram.com/p/CjKKO9IKFAg/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKKNMGqAJ5/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKKLF3qfGE/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKKI_lqWXp/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKKHDBKEpj/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKKE1Fq8vt/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJ-B4qxL6/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJ6oDK4X9/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJ44GKhTI/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJ27HqCc3/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJ0xiqzFl/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJy3lqvb2/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJxJBKzDc/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CjKJu0BqC8j/ | 11 Days All Inclusive Family Tour - United Kingdom ❤ Sri Lan | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time; same title as https://www.instagram.com/p/CjKKUr6qjN6/; same title as https://www.instagram.com/p/CjKKS4wqsz6/; same title as https://www.instagram.com/p/CjKKQ8TKTWc/; same title as http |
| https://www.instagram.com/p/CeA_V96pn-D/ | Happy Customers of Sri Lanka Tours Driver \| Aditya from Indi | review | ok |  | media.url: Instagram CDN URL is signed and expires – download from the Instagram post (permalink) at import time |

### pages

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| / | Home | import | ok |  |  |
| /about-us/ | About Sri Lanka Tours Driver | import | ok |  |  |
| /contact/ | Contact | review | ok |  | content: page contains a placeholder e-mail (contact@example.com) |
| /destination-list/ | Sri Lanka Destinations | import | ok |  |  |
| /drivers-guides/ | Drivers & Guides | import | ok |  |  |
| /excursions/ | Excursions | import | ok |  |  |
| /faq/ | Faq | import | ok |  |  |
| /gallery/ | Gallery | import | ok |  |  |
| /privacy-policy/ | Privacy Policy | import | ok |  |  |
| /tailor-made-tours/ | Tailor Made Tours | review | partial | content |  |
| /terms-conditions/ | Terms & Conditions | import | ok |  |  |
| /tours/ | Tours | review | partial | seo.metaDescription |  |
| /all-tours/page/2/ | All Tours | skip | ok |  |  |
| /to_book/page/2/ | Booking Objects - Page 2 of 2 | skip | ok |  |  |
| /tours/page/2/ | Tours | skip | partial | seo.metaDescription |  |

### page-sections

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /#section-1 | We are Sri Lanka Tours Driver | review | ok |  |  |
| /#section-2 | Featured Tour Packages | review | ok |  |  |
| /#section-3 | Seasonal Packages | review | ok |  |  |
| /#section-4 | Recommended Drivers & Guides | review | ok |  |  |
| /#section-5 | We Make All The Process Easy | review | ok |  |  |
| /#section-6 | One Day Tour Packages | review | ok |  |  |
| /#section-7 | Customer Reviews | review | ok |  |  |
| /#section-8 | Destinations | review | ok |  |  |
| /#section-9 | We Help You Planning Your Journey | review | ok |  |  |
| /#section-10 | Our Gallery | review | ok |  |  |
| /about-us/#section-1 |  | review | partial | title |  |
| /about-us/#section-2 | We Help You Planning Your Journey | review | ok |  |  |
| /contact/#section-1 | Address | review | ok |  |  |
| /contact/#section-2 | Send us a message | review | ok |  |  |
| /destination-list/#section-1 | Gangaramaya Temple | review | ok |  |  |
| /drivers-guides/#section-1 |  | review | partial | title |  |
| /excursions/#section-1 |  | review | partial | title |  |
| /faq/#section-1 | Find Answers | review | ok |  |  |
| /privacy-policy/#section-1 | Who we are | review | ok |  |  |
| /tailor-made-tours/#section-1 |  | review | partial | title |  |
| /tours/#section-1 |  | review | partial | title |  |

### categories

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| /per-day-basis-tours-sri-lanka/ | Per Day Basis | review | ok |  | kind: every item on this old listing is a driver/vehicle page – map to the Vehicles page instead of a tour category? |
| /sri-lanka-one-day-tours/ | One Day Tours | import | ok |  |  |
| /sri-lanka-round-tours/ | Round Tours | import | ok |  |  |
| /sri-lanka-tour-offers/ | Offers | review | partial | members |  |

### navigation

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| / | Home | review | ok |  |  |
| / | Tours | review | ok |  |  |
| / | Round Tours | review | ok |  |  |
| / | One Day Tours | review | ok |  |  |
| / | Per Day Basis | review | ok |  |  |
| / | Destinations | review | ok |  |  |
| / | Excursions | review | ok |  |  |
| / | Offers | review | ok |  |  |
| / | Tailor Made Tours | review | ok |  |  |
| / | Contact | review | ok |  |  |
| / | About Us | review | ok |  |  |
| / | Contact Us | review | ok |  |  |

### site-settings

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| / |  | review | ok |  | address: 2 different values on the old site – pick one manually (see business-data report); email: a placeholder address (example.com) appears on the old site – ignored; googleMapsUrl: 3 different business map links/embeds on the old site – confirm which one is current; siteName: WordPress name "Sri |

### brand-settings

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| / |  | import | ok |  |  |

### seo

| Source | Title | Rec. | Quality | Missing | Suspicious / duplicates |
| --- | --- | --- | --- | --- | --- |
| / |  | review | ok |  |  |
| /contact/ |  | review | ok |  |  |
| /destination-list/ |  | review | ok |  |  |
| /drivers-guides/ |  | review | ok |  |  |
| /excursions/ |  | review | ok |  |  |
| /faq/ |  | review | ok |  |  |
| /gallery/ |  | review | ok |  |  |
| /tailor-made-tours/ |  | review | ok |  |  |
| /tours/ |  | review | partial | metaDescription |  |

## Translations

None extracted. The old site is English-only (`<html lang="en-US">`, no hreflang alternates); the GTranslate plugin translates in the browser and stores nothing. English is the master content.

## Not migratable from the public site

- Bookings and tailor-made enquiries (private customer data) – intentionally not scraped.
- Contact-form submissions – not public.

## Output files

- `raw/` – fetched HTML (`raw/html/`), sitemaps, WordPress API responses, per-type raw extraction JSON, `urls.json`, `media.json`
- `normalized/` – one JSON file per CMS model; `data` holds only existing model fields, plus `references`, `unmapped`, `quality`, `recommendation`
- `reports/` – this report, `discovery-report.json`, `conflicts.json`, `quality.json`, `url-map.json`, `business-data.md`

**Next phase (not started):** review this report and the normalized datasets, decide the open questions, then import. Nothing has been imported.

