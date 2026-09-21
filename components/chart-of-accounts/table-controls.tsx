import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  accountStatusOptions,
  accountTypes,
  reportCategoryLabels,
  reportCategoryOptions,
  taxOptions,
} from "./constants";
import type {
  AccountReportCategory,
  AccountStatusFilter,
  AccountType,
  SortMode,
  TaxCode,
} from "./types";
import { titleCase } from "./utils";

type TableControlsProps = {
  activeReportCategory: "all" | AccountReportCategory;
  activeTaxCode: "all" | TaxCode;
  activeType: "all" | AccountType;
  hasActiveFilters: boolean;
  nonZeroOnly: boolean;
  query: string;
  sortMode: SortMode;
  statusFilter: AccountStatusFilter;
  onActiveReportCategoryChange: (
    category: "all" | AccountReportCategory
  ) => void;
  onActiveTaxCodeChange: (taxCode: "all" | TaxCode) => void;
  onActiveTypeChange: (type: "all" | AccountType) => void;
  onClearFilters: () => void;
  onNonZeroOnlyChange: (enabled: boolean) => void;
  onQueryChange: (query: string) => void;
  onSortModeChange: (sortMode: SortMode) => void;
  onStatusFilterChange: (status: AccountStatusFilter) => void;
};

export function TableControls({
  activeReportCategory,
  activeTaxCode,
  activeType,
  hasActiveFilters,
  nonZeroOnly,
  query,
  sortMode,
  statusFilter,
  onActiveReportCategoryChange,
  onActiveTaxCodeChange,
  onActiveTypeChange,
  onClearFilters,
  onNonZeroOnlyChange,
  onQueryChange,
  onSortModeChange,
  onStatusFilterChange,
}: TableControlsProps) {
  const reportOptions = Object.values(reportCategoryOptions).flat();
  const uniqueReportOptions = reportOptions.filter(
    (option, index, options) =>
      options.findIndex((item) => item.value === option.value) === index
  );

  return (
    <section className="rounded-t-xl border-x border-t border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Type pills — horizontally scrollable on mobile, wrapped on larger screens */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {accountTypes.map((type) => (
            <button
              key={type}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 sm:px-4",
                activeType === type
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              )}
              onClick={() => onActiveTypeChange(type)}
              type="button"
            >
              {type === "all" ? "All" : titleCase(type)}
            </button>
          ))}
        </div>

        {/* Filters toolbar — Fluid flex layout prevents overflow! */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <label className="relative w-full sm:w-auto sm:min-w-[220px] sm:flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search accounts</span>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-10 text-sm outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-100"
              placeholder="Search accounts..."
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </label>

          <div className="w-full sm:w-[calc(50%-6px)] lg:w-auto lg:flex-1">
            <Select
              value={activeReportCategory}
              onValueChange={(value) =>
                onActiveReportCategoryChange(value as "all" | AccountReportCategory)
              }
            >
              <SelectTrigger className="h-10 w-full bg-slate-50">
                <SelectValue placeholder="Report category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reports</SelectItem>
                {uniqueReportOptions.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {reportCategoryLabels[category.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[calc(50%-6px)] lg:w-auto lg:flex-1">
            <Select
              value={activeTaxCode}
              onValueChange={(value) => onActiveTaxCodeChange(value as "all" | TaxCode)}
            >
              <SelectTrigger className="h-10 w-full bg-slate-50">
                <SelectValue placeholder="Tax code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tax codes</SelectItem>
                {taxOptions.map((tax) => (
                  <SelectItem key={tax.code} value={tax.code}>
                    {tax.shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[calc(50%-6px)] lg:w-auto lg:flex-1">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                onStatusFilterChange(value as AccountStatusFilter)
              }
            >
              <SelectTrigger className="h-10 w-full bg-slate-50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {accountStatusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[calc(50%-6px)] lg:w-auto lg:flex-1">
            <Select
              value={sortMode}
              onValueChange={(value) => onSortModeChange(value as SortMode)}
            >
              <SelectTrigger className="h-10 w-full bg-slate-50">
                <SelectValue placeholder="Sort accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="code">Code</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="type">Type</SelectItem>
                <SelectItem value="recent">Recently added</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto shrink-0">
            <label className="flex h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                className="size-4 accent-blue-600"
                checked={nonZeroOnly}
                onChange={(event) => onNonZeroOnlyChange(event.target.checked)}
              />
              Non-zero
            </label>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full sm:w-auto bg-white"
                onClick={onClearFilters}
              >
                <RotateCcw className="size-4 mr-2" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
