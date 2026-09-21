"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_MODULE_GROUPS } from "@/lib/admin/permissions";

type SearchEntry = {
  key: string;
  label: string;
  href: string;
  group: string;
};

/**
 * Header search, mirroring the customer workspace search in
 * components/accounting/top-nav.tsx: pill input, results only once the user
 * types, a "Jump to page" panel with a flat list of matches.
 *
 * Entries come from the shared module registry filtered by the signed-in
 * admin's grants, so this can never navigate somewhere the page guard would
 * immediately bounce them from. Account settings is appended manually — it is
 * ungated by design and therefore absent from the registry.
 */
export function AdminSearch({ permissions }: { permissions: string[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const entries = useMemo<SearchEntry[]>(() => {
    const granted = new Set(permissions);

    const fromRegistry = ADMIN_MODULE_GROUPS.flatMap((group) =>
      group.items
        .filter((item) => granted.has(item.key))
        .map((item) => ({
          key: item.key,
          label: item.label,
          href: item.href,
          group: group.group,
        }))
    );

    return [
      ...fromRegistry,
      { key: "settings", label: "Settings", href: "/admin/settings", group: "Account" },
    ];
  }, [permissions]);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmed) return [];
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(trimmed) ||
        e.href.toLowerCase().includes(trimmed) ||
        e.group.toLowerCase().includes(trimmed)
    );
  }, [entries, trimmed]);

  // Matches the customer search: the panel only appears once something is typed.
  const showResults = focused && trimmed.length > 0;

  // ⌘K / Ctrl+K focuses the search rather than opening a separate dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close when a click lands outside the control.
  useEffect(() => {
    if (!focused) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setFocused(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [focused]);

  // Touches no ref: this runs from JSX event props, where reading inputRef
  // trips react-hooks/refs.
  const go = useCallback(
    (href: string) => {
      setQuery("");
      setFocused(false);
      router.push(href);
    },
    [router]
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
      return;
    }

    if (!showResults || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.href);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-80">
      <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <span className="sr-only">Search admin pages</span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="admin-search-results"
        aria-autocomplete="list"
        aria-activedescendant={showResults ? `admin-search-option-${activeIndex}` : undefined}
        placeholder="Search..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Reset the highlight here rather than in an effect keyed on query —
          // this is the only place the query changes.
          setActiveIndex(0);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={onInputKeyDown}
        className="h-10 w-full rounded-full border border-slate-200/60 bg-white shadow-sm pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
      />

      {showResults && (
        <div
          id="admin-search-results"
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:w-80"
        >
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 m-0">
            Jump to page
          </p>

          {results.length > 0 ? (
            results.map((entry, index) => (
              <button
                key={entry.key}
                id={`admin-search-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                type="button"
                // mousedown fires before blur, so the click is not lost to the
                // outside-click handler closing the panel first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(entry.href);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium transition border-none bg-transparent cursor-pointer",
                  index === activeIndex
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                )}
              >
                <Search className="size-3.5 shrink-0 text-slate-400" />
                {entry.label}
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-sm text-slate-500 m-0">No pages found.</p>
          )}
        </div>
      )}
    </div>
  );
}
