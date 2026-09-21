"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompanySearchResponse } from "@/app/(dashboard)/companies-house-actions";
import type { CompanyMatch } from "@/lib/companies-house/client";

/**
 * The shape both surfaces share.
 *
 * Onboarding and workspace settings fill different fields from the same record
 * — the wizard needs its own vocabulary for structure and industry — so the
 * company is passed straight through to whichever caller asked for it, and only
 * the two properties this component itself reads are pinned down here.
 */
type FilledCompany = { name: string; status: string | null };

type FillResponse<T> =
  | { status: "ok"; company: T }
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "unavailable" };

/** Long enough that somebody has stopped typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 350;

/**
 * Find the business on the register and fill the profile from it.
 *
 * Everything below this is a number somebody has to go and look up, and three
 * of them are already public record. Typing a name is the one thing they can do
 * from memory.
 *
 * Nothing is written straight to the database. The fields are filled in the
 * form and still have to be saved, so a wrong company picked by accident is
 * undone by closing the dialog rather than by correcting four fields.
 */
export function CompaniesHouseLookup<T extends FilledCompany>({
  search,
  load,
  onFill,
  disabled,
  inputClassName = "h-10",
}: {
  /** The server action for this surface: they are guarded differently. */
  search: (query: string) => Promise<CompanySearchResponse>;
  load: (companyNumber: string) => Promise<FillResponse<T>>;
  onFill: (company: T) => void;
  disabled?: boolean;
  /**
   * The search box has to match the fields it fills, and the two screens size
   * them differently — the settings dialog runs at h-10, the signup wizard at
   * h-14. Defaults to the dialog's size.
   */
  inputClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [filling, setFilling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  /*
   * Results can arrive out of order.
   * A search for "wa" started before "wawgroup" may well answer after it, and
   * without this the older, broader list wins and overwrites the one actually
   * being waited for. Only the most recent request is allowed to set state.
   */
  const latestRequest = useRef(0);

  /*
   * Choosing a company writes its name into the box, which would otherwise look
   * like typing and start a fresh search for the thing just chosen — reopening
   * the list under a form that has already been filled in.
   */
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    // Clearing on a short query belongs to the change handler, not here: it is
    // derived from what was typed, and setting it in an effect body renders
    // twice for every keystroke.
    if (query.trim().length < 3) return;

    const requestId = ++latestRequest.current;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await search(query.trim());
        if (requestId !== latestRequest.current) return;

        if (result.status === "not_configured") {
          setMessage("Company search is not set up on this deployment.");
          setMatches([]);
        } else if (result.status === "unavailable") {
          setMessage("Companies House is not responding. You can still type the details in.");
          setMatches([]);
        } else {
          // An empty sandbox result is the normal case, not a failure — the
          // sandbox register holds test companies only, so a real business
          // genuinely is not in it. Saying "no companies match" there sends
          // somebody hunting for a bug that is not one.
          setMessage(
            result.matches.length > 0
              ? null
              : result.sandbox
                ? "Nothing found. This deployment is pointed at the Companies House sandbox — real companies are not in it, and its search index does not cover generated test companies either. Paste a test company number to look one up directly."
                : "No companies match that name. If you have the company number, paste that instead.",
          );
          setMatches(result.matches);
          setOpen(true);
        }
      } finally {
        if (requestId === latestRequest.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `search` is a server action imported at module scope by whichever screen
    // mounted this, so its identity is stable and listing it costs nothing.
  }, [query, search]);

  const choose = async (match: CompanyMatch) => {
    setFilling(match.companyNumber);
    setMessage(null);
    try {
      const result = await load(match.companyNumber);
      if (result.status !== "ok") {
        setMessage(
          result.status === "not_found"
            ? "That company is no longer on the register."
            : "Could not read that record. You can still type the details in.",
        );
        return;
      }

      onFill(result.company);
      setOpen(false);
      skipNextSearch.current = true;
      setQuery(result.company.name);

      // Worth saying out loud. Books are still kept for a dissolved company —
      // final accounts, a closing VAT return — but picking one by accident when
      // the trading company has a near-identical name is an easy mistake, and
      // nothing else on the screen would show it.
      const status = result.company.status;
      setMessage(
        status && status !== "active"
          ? `Filled in. Note this company is ${status.replace(/-/g, " ")} on the register.`
          : "Filled in below. Check it, then save.",
      );
    } finally {
      setFilling(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Building2 className="size-4 text-blue-600" />
        <span className="text-xs font-semibold text-slate-700">Find on Companies House</span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          className={`${inputClassName} pl-9`}
          placeholder="Search by company name or number"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (next.trim().length < 3) {
              setMatches([]);
              setOpen(false);
              setMessage(null);
            }
          }}
          onFocus={() => matches.length > 0 && setOpen(true)}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>

      {open && matches.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {matches.map((match) => (
            <Button
              key={match.companyNumber}
              type="button"
              variant="ghost"
              disabled={filling !== null}
              onClick={() => choose(match)}
              className="flex h-auto w-full flex-col items-start gap-0.5 rounded-none border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-50"
            >
              <span className="flex w-full items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-800">{match.name}</span>
                {filling === match.companyNumber && (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-slate-400" />
                )}
                {match.status && match.status !== "active" && (
                  <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                    {match.status.replace(/-/g, " ")}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-xs font-normal text-slate-500">
                {match.companyNumber}
                {match.address ? ` · ${match.address}` : ""}
              </span>
            </Button>
          ))}
        </div>
      )}

      {message && <p className="m-0 mt-2 text-xs text-slate-600">{message}</p>}

      {/* Said up front, because somebody who has just watched three fields fill
          themselves will reasonably expect the fourth to follow. It cannot:
          the register does not hold it. */}
      <p className="m-0 mt-2 text-xs text-slate-500">
        Fills in the company number, structure, year end and nature of business. The UTR is not on
        the public register — it only comes from HMRC&apos;s letter.
      </p>
    </div>
  );
}
