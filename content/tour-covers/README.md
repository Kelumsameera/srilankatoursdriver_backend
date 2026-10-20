# Imported tour cover images

`../tour-image-mapping.json` assigns a distinct, visually reviewed Media Library
asset to each of the 26 imported tours. Existing uploads are selected for the
actual route or activity theme. Metadata labels in the older media library were
not treated as proof of the image subject; thumbnails were inspected first.

The three WebP files in this folder were generated for this project on 2026-10-19:

- `illustrative-golf-hills.webp`: hill-country golf setting; no specific course.
- `illustrative-golf-coast.webp`: oceanfront golf setting; no specific course.
- `illustrative-wellness-coast.webp`: coastal spa setting; no specific property.

These are AI-generated illustrations, not documentary photos. Copies are
registered in Cloudinary and the Media Library. Their alt text starts with
`AI-generated illustrative` so CmsImage displays the existing illustration badge
and the metadata builder excludes them from the ordinary hero photo fallback.
The original PNGs remain in the Codex generated-images folder.

Run from backend:

- Preview and verify source URLs: `npx tsx src/scripts/apply-tour-images.ts`
- Fill empty covers: `npx tsx src/scripts/apply-tour-images.ts --apply`

The script backs up tours before writing, preserves existing covers and publication
state, and uses updatedAt to avoid overwriting concurrent editor changes.

## Distinct covers and homepage categories (2026-10-20)

`generated-tour-covers.json` records the individual built-in imagegen prompts and
filenames for twelve replacement covers. These replace reused or poorly matched
covers for the three honeymoon packages, both family packages, Southern Explorer,
Eastern Blue Bliss, Wild Trails Glimpse, Deep Dive into the Wild, Ramayana Tour 02,
Wander & Awaken, and Hill Country Retreat. Each is a separate generated scene.

- Preview: `npx tsx src/scripts/replace-reused-tour-covers.ts`
- Apply with a tour backup: `npx tsx src/scripts/replace-reused-tour-covers.ts --apply`
- Add the three editable homepage CMS sections: `npx tsx src/scripts/add-home-tour-categories.ts --apply`

The homepage sections use published tours in the Honeymoon, Family and Adventure
categories and link to the matching filtered listings. Existing sections remain
editable in Admin. Cover replacement preserves all itinerary, pricing and status
fields. Originals remain available in the Media Library and tour backups.
