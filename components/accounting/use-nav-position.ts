"use client";

import { useCallback, useSyncExternalStore } from "react";

import { saveNavPreferences } from "@/app/(dashboard)/nav-preference-actions";

/**
 * Whether the menu runs down the side or floats along the bottom.
 *
 * Not on the organisation: it is a personal display preference and not a
 * property of the business — two people sharing a workspace should not be able
 * to move each other's menu.
 *
 * localStorage and the database, deliberately both. localStorage is what makes
 * the first paint right: the shell renders before any request could answer, and
 * reading the choice locally is what stops the menu appearing on one side and
 * jumping to the other. The row on UserPreference is what makes it follow you
 * to another device, which localStorage alone never could.
 *
 * Local is therefore the cache and the server is the record. Writes go to both,
 * and the server write is deliberately not awaited — the menu has already
 * moved by then, and a slow round trip must not hold the interface still.
 *
 * Read through useSyncExternalStore rather than an effect. It is the API for
 * exactly this — state that lives outside React — and it earns its keep here:
 * the shell and the settings card both read it, and the store notifies both, so
 * changing the setting moves the menu immediately instead of on the next
 * reload. Reading it in an effect would also mean a setState during an effect,
 * which this codebase lints against.
 */

export type NavPosition = "side" | "bottom";

const KEY = "wawprofi-nav-position";
const EVENT = "wawprofi-nav-position-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // Also the native storage event, so the menu moves in this tab's siblings
  // too — somebody with the app open twice should not see two different menus.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): NavPosition {
  try {
    return window.localStorage.getItem(KEY) === "bottom" ? "bottom" : "side";
  } catch {
    // Private browsing, or storage disabled. The sidebar is the safe answer:
    // it is what every existing customer already has.
    return "side";
  }
}

/** The server has no localStorage, so it renders the default and hydrates. */
function getServerSnapshot(): NavPosition {
  return "side";
}

export function useNavPosition(): [NavPosition, (next: NavPosition) => void] {
  const position = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPosition = useCallback((next: NavPosition) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Not fatal: the menu still moves for this session, it just will not be
      // remembered. Better than refusing to switch at all.
    }
    window.dispatchEvent(new Event(EVENT));
    // Not awaited, and it swallows its own failures — see the note above.
    void saveNavPreferences({ navPosition: next });
  }, []);

  return [position, setPosition];
}

/**
 * Whether the bottom menu is showing labels or icons alone.
 *
 * Remembered, rather than reset on every page load. Somebody who minimised the
 * menu did so because they wanted the screen space; handing the labels back on
 * the next navigation would make them do it again on every page.
 */
const COMPACT_KEY = "wawprofi-nav-compact";
const COMPACT_EVENT = "wawprofi-nav-compact-change";

function subscribeCompact(onChange: () => void) {
  window.addEventListener(COMPACT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COMPACT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getCompactSnapshot(): boolean {
  try {
    return window.localStorage.getItem(COMPACT_KEY) === "true";
  } catch {
    return false;
  }
}

function getCompactServerSnapshot(): boolean {
  return false;
}

export function useNavCompact(): [boolean, (next: boolean) => void] {
  const compact = useSyncExternalStore(
    subscribeCompact,
    getCompactSnapshot,
    getCompactServerSnapshot
  );

  const setCompact = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(COMPACT_KEY, String(next));
    } catch {
      // Not fatal — see the note on setPosition above.
    }
    window.dispatchEvent(new Event(COMPACT_EVENT));
    void saveNavPreferences({ navCompact: next });
  }, []);

  return [compact, setCompact];
}

/**
 * Adopt what the account holds, called once by the shell with the value the
 * server rendered.
 *
 * Only when it differs, so signing in on the device the choice was made on
 * writes nothing and notifies nobody. The local copy is updated too: it is the
 * cache that answers the next first paint, and leaving it stale would put the
 * menu back on the old side for one frame on every load.
 */
export function adoptSavedNavPreferences(saved: {
  navPosition: NavPosition;
  navCompact: boolean;
}) {
  if (typeof window === "undefined") return;

  if (getSnapshot() !== saved.navPosition) {
    try {
      window.localStorage.setItem(KEY, saved.navPosition);
    } catch {
      /* Private browsing. The menu still moves for this session. */
    }
    window.dispatchEvent(new Event(EVENT));
  }

  if (getCompactSnapshot() !== saved.navCompact) {
    try {
      window.localStorage.setItem(COMPACT_KEY, String(saved.navCompact));
    } catch {
      /* As above. */
    }
    window.dispatchEvent(new Event(COMPACT_EVENT));
  }
}
