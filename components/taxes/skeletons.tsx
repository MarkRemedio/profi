import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonAction = {
  width: string;
  primary?: boolean;
};

function TaxSkeletonRoot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function PageHeaderSkeleton({
  titleWidth = "w-64",
  subtitleWidth = "w-96",
  actions = [],
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  actions?: SkeletonAction[];
}) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="w-full xl:w-auto">
        <Skeleton className={cn("h-9 max-w-full rounded-lg bg-slate-200", titleWidth)} />
        <Skeleton className={cn("mt-2 h-4 max-w-full bg-slate-100", subtitleWidth)} />
      </div>
      {actions.length > 0 && (
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap xl:w-auto xl:justify-end">
          {actions.map((action, index) => (
            <Skeleton
              key={`${action.width}-${index}`}
              className={cn(
                "h-9 w-full shrink-0 rounded-md sm:w-auto",
                action.width,
                action.primary ? "bg-blue-200" : "bg-slate-100",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardSkeleton({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

function CardHeaderSkeleton({
  actionWidth,
  titleWidth = "w-44",
  descriptionWidth = "w-72",
}: {
  actionWidth?: string;
  titleWidth?: string;
  descriptionWidth?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 shrink-0 rounded bg-blue-100" />
          <Skeleton className={cn("h-5 bg-slate-200", titleWidth)} />
        </div>
        <Skeleton className={cn("h-3.5 max-w-full bg-slate-100", descriptionWidth)} />
      </div>
      {actionWidth && (
        <Skeleton className={cn("h-9 w-full shrink-0 rounded-md sm:w-auto", actionWidth)} />
      )}
    </div>
  );
}

function SummaryCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-4", count === 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index}>
          <div className="flex items-center justify-between px-6 pb-2 pt-6">
            <Skeleton className="h-3.5 w-24 bg-slate-100" />
            <Skeleton className="size-4 rounded bg-slate-100" />
          </div>
          <div className="px-6 pb-6">
            <Skeleton className="h-7 w-28 bg-slate-200" />
            <Skeleton className="mt-2 h-3 w-24 bg-slate-100" />
          </div>
        </CardSkeleton>
      ))}
    </div>
  );
}

function TableSkeleton({
  columns,
  rows = 4,
  minWidth = "min-w-[720px]",
}: {
  columns: number;
  rows?: number;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", minWidth)}>
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            {Array.from({ length: columns }, (_, index) => (
              <th key={index} className="px-4 py-3">
                <Skeleton className={cn("h-3 bg-slate-100", index === 0 ? "w-24" : "w-16")} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_, column) => (
                <td key={column} className="px-4 py-4">
                  <Skeleton
                    className={cn(
                      "h-4 bg-slate-100",
                      column === 0 ? "w-32 bg-slate-200" : column % 3 === 0 ? "w-20" : "w-16",
                    )}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCardSkeleton({
  columns,
  rows,
  actionWidth,
  titleWidth,
  descriptionWidth,
  minWidth,
}: {
  columns: number;
  rows?: number;
  actionWidth?: string;
  titleWidth?: string;
  descriptionWidth?: string;
  minWidth?: string;
}) {
  return (
    <CardSkeleton className="overflow-hidden">
      <CardHeaderSkeleton
        actionWidth={actionWidth}
        titleWidth={titleWidth}
        descriptionWidth={descriptionWidth}
      />
      <TableSkeleton columns={columns} rows={rows} minWidth={minWidth} />
    </CardSkeleton>
  );
}

function BannerSkeleton({ tone = "blue" }: { tone?: "blue" | "amber" | "red" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    red: "border-red-200 bg-red-50/50",
  };

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", tones[tone])}>
      <Skeleton className="size-9 shrink-0 rounded-lg bg-slate-200/70" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <Skeleton className="h-4 w-56 max-w-full bg-slate-200" />
        <Skeleton className="h-3.5 w-[36rem] max-w-full bg-slate-100" />
      </div>
      <Skeleton className="hidden h-8 w-24 shrink-0 sm:block" />
    </div>
  );
}

function DetailCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <CardSkeleton>
      <CardHeaderSkeleton descriptionWidth="w-64" />
      <div className="space-y-3 p-6">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36 bg-slate-200" />
              <Skeleton className="h-3 w-28 bg-slate-100" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </CardSkeleton>
  );
}

function SettingsStripSkeleton({ controls = 2 }: { controls?: number }) {
  return (
    <CardSkeleton>
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg bg-blue-100" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-36 bg-slate-200" />
            <Skeleton className="h-3 w-56 max-w-full bg-slate-100" />
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          {Array.from({ length: controls }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-md sm:w-32" />
          ))}
        </div>
      </div>
    </CardSkeleton>
  );
}

export function TaxesDashboardSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading taxes and compliance">
      <PageHeaderSkeleton
        titleWidth="w-72"
        subtitleWidth="w-[32rem]"
        actions={[
          { width: "sm:w-24" },
          { width: "sm:w-40" },
          { width: "sm:w-44" },
          { width: "sm:w-40" },
          { width: "sm:w-20" },
          { width: "sm:w-24" },
          { width: "sm:w-32" },
          { width: "sm:w-28" },
        ]}
      />
      <BannerSkeleton tone="amber" />
      <SummaryCardsSkeleton />
      <CardSkeleton>
        <CardHeaderSkeleton titleWidth="w-52" descriptionWidth="w-80" actionWidth="sm:w-44" />
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-lg bg-slate-100" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44 bg-slate-200" />
                  <Skeleton className="h-3 w-28 bg-slate-100" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      </CardSkeleton>
    </TaxSkeletonRoot>
  );
}

export function VatSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading VAT details">
      <PageHeaderSkeleton
        titleWidth="w-44"
        subtitleWidth="w-72"
        actions={[{ width: "sm:w-64" }]}
      />
      <SettingsStripSkeleton controls={4} />
      <TableCardSkeleton columns={6} rows={4} actionWidth="sm:w-36" titleWidth="w-36" />
      <CardSkeleton>
        <CardHeaderSkeleton titleWidth="w-60" descriptionWidth="w-80" actionWidth="sm:w-36" />
        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[3, 2, 4].map((count, column) => (
            <div key={column} className="space-y-3">
              <Skeleton className="h-3.5 w-28 bg-slate-200" />
              {Array.from({ length: count }, (_, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-6 w-24 bg-slate-200" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardSkeleton>
      <TableCardSkeleton columns={3} rows={3} actionWidth="sm:w-32" titleWidth="w-40" />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCardSkeleton rows={2} />
        <DetailCardSkeleton rows={2} />
      </div>
    </TaxSkeletonRoot>
  );
}

export function SelfEmployedSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading self-employed taxes">
      <PageHeaderSkeleton
        titleWidth="w-80"
        subtitleWidth="w-96"
        actions={[{ width: "sm:w-44" }]}
      />
      <SummaryCardsSkeleton />
      <BannerSkeleton tone="amber" />
      <TableCardSkeleton
        columns={7}
        rows={5}
        titleWidth="w-40"
        descriptionWidth="w-[30rem]"
        minWidth="min-w-[820px]"
      />
      <TableCardSkeleton columns={3} rows={4} titleWidth="w-48" descriptionWidth="w-80" />
      <DetailCardSkeleton rows={3} />
    </TaxSkeletonRoot>
  );
}

export function ForexSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading foreign exchange taxes">
      <PageHeaderSkeleton titleWidth="w-60" subtitleWidth="w-96" />
      <SummaryCardsSkeleton />
      <TableCardSkeleton columns={4} rows={4} titleWidth="w-48" descriptionWidth="w-[32rem]" />
      <TableCardSkeleton
        columns={7}
        rows={3}
        titleWidth="w-64"
        descriptionWidth="w-[30rem]"
        minWidth="min-w-[860px]"
      />
      <CardSkeleton>
        <CardHeaderSkeleton titleWidth="w-28" descriptionWidth="w-64" />
        <div className="flex flex-wrap gap-3 p-6">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-2"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-16 bg-slate-200" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          ))}
        </div>
      </CardSkeleton>
    </TaxSkeletonRoot>
  );
}

export function EcSalesSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading EC sales taxes">
      <PageHeaderSkeleton titleWidth="w-40" subtitleWidth="w-[30rem]" />
      <BannerSkeleton tone="blue" />
      <TableCardSkeleton columns={5} rows={3} titleWidth="w-36" descriptionWidth="w-[30rem]" />
      <RequirementsCardSkeleton items={3} />
    </TaxSkeletonRoot>
  );
}

/**
 * The "what this needs to work" card, used by the modules that cannot produce
 * a return from the books alone.
 */
function RequirementsCardSkeleton({ items }: { items: number }) {
  return (
    <CardSkeleton>
      <CardHeaderSkeleton titleWidth="w-52" descriptionWidth="w-[28rem]" />
      <div className="space-y-4 p-6">
        {Array.from({ length: items }, (_, index) => (
          <div key={index} className="flex items-start gap-3">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40 bg-slate-200" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </CardSkeleton>
  );
}

export function CorporationTaxSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading corporation tax">
      <PageHeaderSkeleton
        titleWidth="w-56"
        subtitleWidth="w-80"
        actions={[{ width: "sm:w-56" }]}
      />
      <SettingsStripSkeleton controls={3} />
      <CardSkeleton>
        <CardHeaderSkeleton titleWidth="w-64" descriptionWidth="w-80" />
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-24 bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-4"
              >
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-7 w-28 bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      </CardSkeleton>
      <CardSkeleton>
        <CardHeaderSkeleton titleWidth="w-52" descriptionWidth="w-[28rem]" />
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-start gap-3">
              <Skeleton className="size-5 shrink-0 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44 bg-slate-200" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </CardSkeleton>
      <TableCardSkeleton columns={5} rows={4} titleWidth="w-40" />
      <DetailCardSkeleton rows={3} />
    </TaxSkeletonRoot>
  );
}

export function CisSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading Construction Industry Scheme taxes">
      <PageHeaderSkeleton
        titleWidth="w-[22rem]"
        subtitleWidth="w-96"
        actions={[{ width: "sm:w-36" }]}
      />
      <DetailCardSkeleton rows={3} />
      <CardSkeleton>
        <CardHeaderSkeleton titleWidth="w-40" descriptionWidth="w-[26rem]" />
        <div className="space-y-2 p-6">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-20 bg-slate-200" />
            </div>
          ))}
        </div>
      </CardSkeleton>
      <RequirementsCardSkeleton items={4} />
    </TaxSkeletonRoot>
  );
}

export function CapitalGainsSkeleton() {
  return (
    <TaxSkeletonRoot label="Loading capital gains and losses">
      <PageHeaderSkeleton titleWidth="w-56" subtitleWidth="w-[30rem]" />
      <BannerSkeleton tone="blue" />
      <TableCardSkeleton columns={2} rows={3} titleWidth="w-32" descriptionWidth="w-[26rem]" />
      <TableCardSkeleton columns={4} rows={3} titleWidth="w-52" descriptionWidth="w-[32rem]" />
      <RequirementsCardSkeleton items={3} />
    </TaxSkeletonRoot>
  );
}
