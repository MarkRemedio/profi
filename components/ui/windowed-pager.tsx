"use client";

import type { ReactNode } from "react";

type PageItem = number | "ellipsis";

/** Build a bounded page list: first, last, current ± siblings, with ellipses for gaps. */
export function getPaginationRange(
  current: number,
  total: number,
  siblingCount = 1,
): PageItem[] {
  if (total <= 1) return total === 1 ? [1] : [];

  const maxVisible = siblingCount * 2 + 5;
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftRange = Array.from(
      { length: 3 + siblingCount * 2 },
      (_, i) => i + 1,
    );
    return [...leftRange, "ellipsis", total];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightRange = Array.from(
      { length: 3 + siblingCount * 2 },
      (_, i) => total - (3 + siblingCount * 2) + i + 1,
    );
    return [1, "ellipsis", ...rightRange];
  }

  if (showLeftEllipsis && showRightEllipsis) {
    const middleRange = Array.from(
      { length: rightSibling - leftSibling + 1 },
      (_, i) => leftSibling + i,
    );
    return [1, "ellipsis", ...middleRange, "ellipsis", total];
  }

  return Array.from({ length: total }, (_, i) => i + 1);
}

type WindowedPagerProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
};

export function WindowedPager({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  siblingCount = 1,
}: WindowedPagerProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const range = getPaginationRange(page, totalPages, siblingCount);

  return (
    <div className="flex min-w-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
      <p className="shrink-0 text-xs text-slate-400">
        Showing {from}–{to} of {totalItems}
      </p>

      <nav
        aria-label="Pagination"
        className="flex min-w-0 shrink items-center gap-1"
      >
        <PagerNavButton
          label="Previous page"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon />
        </PagerNavButton>

        {range.map((item, i) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${i}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-xs text-slate-400"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? "page" : undefined}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                item === page
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-white"
              }`}
            >
              {item}
            </button>
          ),
        )}

        <PagerNavButton
          label="Next page"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRightIcon />
        </PagerNavButton>
      </nav>
    </div>
  );
}

function PagerNavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
