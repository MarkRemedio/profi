import { useCurrency } from "@/components/currency-provider";
import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { reportCategoryLabels, taxOptions, typeMeta } from "./constants";
import type { ChartAccount } from "./types";

type AccountsTableProps = {
  accounts: ChartAccount[];
  canManage: boolean;
  totalCount: number;
  /**
   * Every filter and sort value, joined. Changing it sends the table back to
   * page one — see the note in the body.
   */
  filterKey: string;
  emptyState: React.ReactNode;
  onEditAccount: (account: ChartAccount) => void;
  onViewAccount: (account: ChartAccount) => void;
};

export function AccountsTable({
  accounts,
  canManage,
  totalCount,
  filterKey,
  emptyState,
  onEditAccount,
  onViewAccount,
}: AccountsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  const ITEMS_PER_PAGE = 20;

  // Filtering from page two used to leave the page index where it was, so the
  // slice started past the end of a shorter result set: an empty table under a
  // footer confidently reporting "Showing all 7 accounts". You had to page back
  // to see anything.
  //
  // Adjusted during render rather than in an effect — React re-runs this
  // component immediately without committing the empty frame, so the correct
  // page is what paints. An effect would show the blank table first.
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(accounts.length / ITEMS_PER_PAGE));
  // Belt and braces: whatever shrinks the list — a filter, a deletion, another
  // tab — the page can never point past the last one.
  const page = Math.min(currentPage, totalPages);
  const paginatedAccounts = accounts.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  return (
    <Card className="gap-0 overflow-hidden rounded-b-xl rounded-t-none border-slate-200 py-0 shadow-[0_4px_20px_rgba(37,99,235,0.04)]">
      {/* Desktop table — hidden on small screens */}
      <CardContent className="hidden md:block px-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">MTD</TableHead>
                <TableHead className="text-right">YTD</TableHead>
                <TableHead className="text-right">Current balance</TableHead>
                <TableHead className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  canManage={canManage}
                  onEditAccount={onEditAccount}
                  onViewAccount={onViewAccount}
                />
              ))}
            </tbody>
          </table>
        </div>

        {accounts.length === 0 ? emptyState : null}
      </CardContent>

      {/* Mobile card list — hidden on md+ screens */}
      <CardContent className="md:hidden px-0">
        {accounts.length === 0 ? (
          emptyState
        ) : (
          <ul className="divide-y divide-slate-100">
            {paginatedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                canManage={canManage}
                onEditAccount={onEditAccount}
                onViewAccount={onViewAccount}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {accounts.length > 0 && totalPages > 1 ? (
        <CardFooter className="flex flex-col gap-4 rounded-none border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-500">
            Showing <span className="font-semibold text-slate-900">{((page - 1) * ITEMS_PER_PAGE) + 1}</span> to{" "}
            <span className="font-semibold text-slate-900">{Math.min(page * ITEMS_PER_PAGE, accounts.length)}</span> of{" "}
            <span className="font-semibold text-slate-900">{accounts.length}</span> accounts
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setCurrentPage(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" className="bg-white text-blue-700 pointer-events-none font-bold">
              {page} / {totalPages}
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardFooter>
      ) : accounts.length > 0 ? (
        <CardFooter className="flex flex-col gap-4 rounded-none border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-500">
            Showing all <span className="font-semibold text-slate-900">{accounts.length}</span> accounts
          </p>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function TableHead({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-500",
        className
      )}
    >
      {children}
    </th>
  );
}

function AccountRow({
  account,
  canManage,
  onEditAccount,
  onViewAccount,
}: {
  account: ChartAccount;
  canManage: boolean;
  onEditAccount: (account: ChartAccount) => void;
  onViewAccount: (account: ChartAccount) => void;
}) {
  const { format: formatMinor } = useCurrency();
  const meta = typeMeta[account.account_type];
  const Icon = meta.icon;
  const tax = taxOptions.find((option) => option.code === account.tax_code);

  return (
    <tr className="group transition-colors hover:bg-slate-50">
      <td className="px-6 py-4 font-mono text-sm font-semibold text-blue-700">
        {account.code}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded",
              meta.iconClass
            )}
          >
            <Icon className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-slate-950">{account.name}</span>
            {account.is_system ? (
              <p className="text-xs font-medium text-slate-400">
                System account
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="max-w-xs px-6 py-4 text-sm font-medium text-slate-500">
        {account.description || "No description"}
      </td>
      <td className="px-6 py-4">
        <Badge
          variant="outline"
          className={cn("border-transparent font-bold uppercase", meta.badgeClass)}
        >
          {meta.label}
        </Badge>
      </td>
      <td className="px-6 py-4 text-sm font-semibold text-slate-600">
        {reportCategoryLabels[account.report_category]}
      </td>
      <td className="px-6 py-4 text-sm font-medium text-slate-500">
        {tax?.shortLabel ?? meta.taxLabel}
      </td>
      <td className="px-6 py-4 text-right font-mono text-sm font-semibold text-slate-700">
        {formatMinor(account.mtd_movement_minor)}
      </td>
      <td className="px-6 py-4 text-right font-mono text-sm font-semibold text-slate-700">
        {formatMinor(account.ytd_movement_minor)}
      </td>
      <td className="px-6 py-4 text-right font-mono text-sm font-semibold text-slate-950">
        {formatMinor(account.balance_minor)}
      </td>
      <td className="px-6 py-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${account.name}`}
            >
              <MoreVertical className="size-4 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onViewAccount(account)}>
              View details
            </DropdownMenuItem>
            {canManage ? (
              <DropdownMenuItem onClick={() => onEditAccount(account)}>
                Edit account
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function AccountCard({
  account,
  canManage,
  onEditAccount,
  onViewAccount,
}: {
  account: ChartAccount;
  canManage: boolean;
  onEditAccount: (account: ChartAccount) => void;
  onViewAccount: (account: ChartAccount) => void;
}) {
  const { format: formatMinor } = useCurrency();
  const meta = typeMeta[account.account_type];
  const Icon = meta.icon;
  const tax = taxOptions.find((option) => option.code === account.tax_code);

  return (
    <li className="px-4 py-3 transition-colors hover:bg-slate-50 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + name/code */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded",
              meta.iconClass
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-blue-700">
                {account.code}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "border-transparent text-[10px] font-bold uppercase leading-none",
                  meta.badgeClass
                )}
              >
                {meta.label}
              </Badge>
            </div>
            <p className="truncate font-semibold text-slate-950">
              {account.name}
            </p>
            {account.is_system ? (
              <p className="text-xs font-medium text-slate-400">
                System account
              </p>
            ) : null}
          </div>
        </div>

        {/* Right: actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={`Actions for ${account.name}`}
            >
              <MoreVertical className="size-4 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onViewAccount(account)}>
              View details
            </DropdownMenuItem>
            {canManage ? (
              <DropdownMenuItem onClick={() => onEditAccount(account)}>
                Edit account
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Details row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-xs text-slate-500 sm:pl-11">
        {account.description ? (
          <span className="truncate max-w-[200px]">{account.description}</span>
        ) : null}
        <span>{reportCategoryLabels[account.report_category]}</span>
        <span>{tax?.shortLabel ?? meta.taxLabel}</span>
      </div>

      {/* Financials */}
      <div className="mt-2 grid grid-cols-3 gap-2 pl-11 text-sm sm:pl-11">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            MTD
          </p>
          <p className="font-mono text-sm font-semibold text-slate-700">
            {formatMinor(account.mtd_movement_minor)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            YTD
          </p>
          <p className="font-mono text-sm font-semibold text-slate-700">
            {formatMinor(account.ytd_movement_minor)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Balance
          </p>
          <p className="font-mono text-sm font-semibold text-slate-950">
            {formatMinor(account.balance_minor)}
          </p>
        </div>
      </div>
    </li>
  );
}
