# `quotes/` vs `qoutes/` typo duplicate

**Status:** Bug — cleanup needed
**Category:** UI hygiene

## What this is

Two sibling folders under [app/sales/](../../../app/sales/):

- `app/sales/quotes/`
- `app/sales/qoutes/` ← typo

Only one of these should exist.

## Current state

- Both directories are present in [app/sales/](../../../app/sales/).
- A user visiting `/sales/qoutes` and `/sales/quotes` may hit different code paths depending on which is wired.
- Components: [components/sales/quotes.tsx](../../../components/sales/quotes.tsx) presumably feeds one of the routes.

## Why this matters

- Routing ambiguity is a future bug factory — links from elsewhere in the app could point to the typo path.
- SEO / bookmarks could end up split.

## What to do

- Identify which folder actually contains the canonical implementation (`git log -- app/sales/quotes` vs `app/sales/qoutes`).
- Keep `quotes/`, delete `qoutes/`.
- Update any internal links and any sidebar/nav config that may reference the typo.
- Add a redirect (`next.config.ts` rewrites) from `/sales/qoutes` → `/sales/quotes` for any external bookmarks that were created during the typo window.

## Implementation notes

- Pure rename + redirect. No data model implications.
- Verify there are no React Server Component caching artefacts referencing the old path.

## Related

- (no upstream dependencies — safe standalone cleanup)
