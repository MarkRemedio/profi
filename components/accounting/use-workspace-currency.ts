"use client";

import { useSyncExternalStore } from "react";

/**
 * The base currency and multicurrency switch currently in force, as distinct
 * from the ones the page was loaded with.
 *
 * Every amount on screen is formatted through CurrencyProvider, which is fed
 * from useChartOfAccounts inside WorkspaceShell. That hook fetches the
 * organisation once in an effect and holds it in React state, and WorkspaceShell
 * sits in the dashboard layout — so it never remounts while you navigate. A
 * server action cannot reach that state and router.refresh() re-renders the
 * server tree without touching it, which is why saving a new base currency
 * changed the settings card and nothing else until a hard reload.
 *
 * Module scope rather than component state, for the same reason as
 * [[use-org-logo]]: component state resets on remount, and the stale value it
 * was correcting would come straight back. A module variable lasts exactly as
 * long as the cache it is standing in front of.
 *
 * Not persisted. The next full load reads the real values from the database,
 * which is the authority; this only bridges the gap until then.
 */

const EVENT = "wawprofi-workspace-currency";

type Override = {
  currency?: string;
  multicurrencyEnabled?: boolean;
};

/* An empty object rather than undefined, so the two fields can be overridden
   independently — saving multicurrency alone must not pin the currency to
   whatever it happened to be. */
let override: Override = {};

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function getSnapshot(): Override {
  return override;
}

/* A stable object, because useSyncExternalStore compares snapshots by identity
   and a fresh {} every call would loop. */
const EMPTY: Override = {};

function getServerSnapshot(): Override {
  return EMPTY;
}

/** What to use, given whatever the caller was handed as a fallback. */
export function useWorkspaceCurrency(fallback: {
  currency: string | null | undefined;
  multicurrencyEnabled: boolean | null | undefined;
}): { currency: string | null | undefined; multicurrencyEnabled: boolean } {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    currency: live.currency ?? fallback.currency,
    multicurrencyEnabled: live.multicurrencyEnabled ?? fallback.multicurrencyEnabled ?? false,
  };
}

/** Called after the change has been saved, never before. */
export function setWorkspaceCurrency(next: Override) {
  override = { ...override, ...next };
  window.dispatchEvent(new Event(EVENT));
}
