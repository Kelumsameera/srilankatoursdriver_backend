# Tour reference import

Source: user-supplied `srilanka_tours_import_adapter.zip`, imported on 2026-10-19.
`content/tours-import.json` retains source URLs and reference flags for editorial review.

- Preview: `npx tsx src/scripts/import-tours.ts`
- Add missing drafts: `npx tsx src/scripts/import-tours.ts --apply`

Uses the configured backend database. Backs up tours and tour categories to ignored
`backups/` before applying changes. Existing slugs or matching titles are skipped;
existing content is never updated. Repeated application does not duplicate tours.
The archive has 27 entries but 26 unique slugs; `family-escapade-in-sri-lanka`
appears twice. Its first category is retained. The initial archive supplied only three itineraries. The 2026-10-19 enrichment adds original summaries and concise factual itinerary steps researched from the linked tour pages for all 26 tours.
Multi-day itinerary ranges retain their range in the step title.

No images, pricing, inclusions, hotels or missing itineraries are invented.
All imported tours remain drafts for completion and review in Admin > Tours.


## Fill missing details in existing imports

- Preview: `npx tsx src/scripts/enrich-imported-tours.ts`
- Apply: `npx tsx src/scripts/enrich-imported-tours.ts --apply`

Only empty descriptions, highlights, itineraries and locations are filled. Empty
destination references are matched to existing published destinations by exact
normalized name or slug. Existing editor content and publication state are kept.
A backup is created before updates; an updatedAt guard prevents overwriting a
concurrent editor change. Run again to preview any remaining changes.

Source URLs and research date are stored per tour. Descriptions are original
concise summaries; third-party images, hotel guarantees, prices, inclusion lists
and payment policies are not imported. The two golf source pages conflict with
their advertised durations (6 vs 5 days, 11 vs 9 days). Only unambiguous daily
steps are supplied; descriptions explicitly request schedule confirmation.
The archive's family tour appears in two categories; its first import category
is retained to avoid changing an existing category assignment.


2026-10-20 Honeymoon correction: `honeymoon-reference.json` preserves the original
comparison grid columns. The three populated columns determine their exact
activity lists. Family Escapade is listed as 19 days/18 nights but its entire
comparison column is blank and the linked Honeymoon page does not provide its
programme. Its previously imported Family-category itinerary is retained only as
`previousItineraryReference` in the source file, and its public programme is now
marked awaiting confirmation. Do not infer a route from empty comparison cells.
Run `npx tsx src/scripts/correct-honeymoon-tours.ts` to preview this correction,
or add `--apply` to apply it with a backup. Covers and publication state are kept.

2026-10-20 category correction: Family Escapade belongs to Family Tours, not Honeymoon Tours. Both archive entries now use family-tours; the Honeymoon correction script targets only its three actual packages. The original four-column comparison is retained solely as source evidence.
