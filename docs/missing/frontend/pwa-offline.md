# PWA / offline mode

**Status:** Stub
**Category:** Frontend

## What this is

Progressive Web App support: installable, with a service worker that lets POS keep selling when the network drops, then syncs when back online.

## Current state

- POS has an "offline" tab ([components/pos/offline.tsx](../../../components/pos/offline.tsx)) but it's mock UI only.
- No service worker, no Workbox, no IndexedDB persistence, no `manifest.json`.
- No background-sync registration.

## Why it's needed

- POS dies without offline tolerance — networks fail in shops.
- Mobile receipt-capture (snap a photo, sync later) needs the same plumbing.

## Recommended approach

- Next.js + `next-pwa` (or `@serwist/next`) for service worker tooling.
- Local sale queue in IndexedDB (Dexie); replay to server on reconnect.
- Conflict resolution on sync (e.g. same SKU sold while offline at two tills).

## Implementation notes

- Offline is only viable once POS has a real backend — see [POS models](../data-models/pos-models.md).
- Be careful: caching the accounting screens offline is dangerous (stale ledger figures). Limit offline scope to POS terminal.

## Related

- [POS models](../data-models/pos-models.md), [Inventory](../data-models/inventory.md), [POS UI stub](../ui-stubs/pos.md)
