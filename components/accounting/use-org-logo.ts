"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The workspace logo currently on screen, as distinct from the one the page was
 * loaded with.
 *
 * Both menus draw this, and both read their organisation from a client-side
 * hook that caches it in React state. A server action cannot reach that cache,
 * and router.refresh() re-renders the server tree without touching it — so
 * uploading or removing a logo left the menu showing the old one until a hard
 * reload.
 *
 * The override lives at module scope rather than in a component, and that is
 * the whole point. It was component state first, which looked right and failed
 * quietly: navigating to another page remounted the menu, the override reset to
 * "no override", and the stale cached URL came back. A module variable survives
 * remounts for the life of the page, which is exactly as long as the stale
 * cache it is correcting.
 *
 * Not persisted anywhere. The next full load reads the real value from the
 * database, which is the authority; this only bridges the gap until then.
 */

const EVENT = "wawprofi-org-logo";

/** undefined means "no override yet" — null is a real value meaning "removed". */
let override: string | null | undefined = undefined;

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function getSnapshot() {
  return override;
}

function getServerSnapshot(): string | null | undefined {
  return undefined;
}

/**
 * The logo to draw, given whatever the caller was handed as a fallback.
 *
 * The fallback is only consulted while nothing has been changed this session,
 * so a menu rendered before any edit behaves exactly as it did before.
 */
export function useOrgLogo(fallback: string | null | undefined): string | null | undefined {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return live !== undefined ? live : fallback;
}

/** Called after the change has been saved, never before. */
export function setOrgLogo(next: string | null) {
  override = next;
  window.dispatchEvent(new Event(EVENT));
}
