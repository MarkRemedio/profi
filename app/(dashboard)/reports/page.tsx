import { Suspense } from "react";
import Link from "next/link";
import { 
  Scale, 
  TrendingUp, 
  Landmark, 
  BookOpen, 
  Clock, 
  ShieldCheck, 
  ArrowRight, 
  FileText 
} from "lucide-react";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { ReportCenterMenuSkeleton, ReportsWorkspaceSkeleton } from "@/components/reports/skeletons";
import { getAccountOptions, requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getCoreReports } from "@/lib/accounting/reports";
import { currentFinancialYear } from "@/lib/accounting/financial-year";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const reportCategories = [
  {
    title: "Financial Statements",
    description: "Core accounting reports for period-end reporting and compliance.",
    reports: [
      {
        title: "Profit and Loss",
        description: "Review your income, expenses, and net profit over a specific period.",
        icon: TrendingUp,
        href: "/reports?view=profit-and-loss",
        color: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        title: "Balance Sheet",
        description: "A snapshot of your assets, liabilities, and equity at a specific date.",
        icon: Landmark,
        href: "/reports?view=balance-sheet",
        color: "text-blue-600",
        bg: "bg-blue-50",
      },
      {
        title: "Trial Balance",
        description: "Check the balances of all your general ledger accounts to ensure debits equal credits.",
        icon: Scale,
        href: "/reports?view=trial-balance",
        color: "text-violet-600",
        bg: "bg-violet-50",
      },
    ]
  },
  {
    title: "Ledger & Payables",
    description: "Detailed breakdowns of transactions and outstanding balances.",
    reports: [
      {
        title: "General Ledger",
        description: "View all transactions posted to your accounts over a date range.",
        icon: BookOpen,
        href: "/reports?view=general-ledger",
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
      {
        title: "Aged Receivables",
        description: "See which customers owe you money and how long it has been outstanding.",
        icon: Clock,
        href: "/reports/ar-aging",
        color: "text-cyan-600",
        bg: "bg-cyan-50",
      },
      {
        title: "Aged Payables",
        description: "Track unpaid bills and see who you owe money to and when it is due.",
        icon: FileText,
        href: "/reports/ap-aging",
        color: "text-rose-600",
        bg: "bg-rose-50",
      },
    ]
  },
  {
    title: "Compliance & Security",
    description: "System logs and audit trails for total financial transparency.",
    reports: [
      {
        title: "Audit Trail",
        description: "A chronological record of all changes, deletions, and postings in your system.",
        icon: ShieldCheck,
        href: "/reports/audit-trail",
        color: "text-slate-600",
        bg: "bg-slate-100",
      },
    ]
  }
];

export default async function ReportsPage(props: any) {
  const searchParams = await props.searchParams;
  const view = searchParams?.view as string;

  // 🚀 INTERACTION GUARD: If loading an active sheet, bypass the landing page instantly
  if (
    view &&
    ["trial-balance", "profit-and-loss", "balance-sheet", "general-ledger"].includes(view)
  ) {
    // The workspace lookup happens inside the boundary rather than above it.
    // Awaiting it here held the whole page back, so a cold boot of a statement
    // URL sat on the route-level loading.tsx — which is the Report Center menu
    // skeleton — before it could reach the statement skeleton below.
    return (
      <Suspense key={view} fallback={<ReportsWorkspaceSkeleton />}>
        <ReportsWorkspaceDataLoader view={view} />
      </Suspense>
    );
  }

  // The landing page keeps its own guard: dropping the call entirely would
  // render the Report Center to anyone.
  await requireAccountingWorkspace();

  return (
    <div className="w-full space-y-10 text-left">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
          Report Center
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-2xl">
          Generate real-time financial statements, track your cash flow, and
          ensure compliance with detailed ledger reports.
        </p>
      </div>

      {/* Report Categories Loop */}
      <div className="space-y-12">
        {reportCategories.map((category) => (
          <div key={category.title}>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">
                {category.title}
              </h2>
              <p className="text-sm text-slate-500">{category.description}</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {category.reports.map((report) => (
                <Link
                  key={report.title}
                  href={report.href}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-md hover:border-blue-200 min-h-[160px]"
                >
                  <div className="flex items-start gap-5">
                    <div className={`mt-1 shrink-0 flex size-12 items-center justify-center rounded-lg ${report.bg}`}>
                      <report.icon className={`size-6 ${report.color}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {report.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-500 leading-relaxed pr-8">
                        {report.description}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="absolute bottom-6 right-6 size-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DECOUPLED DATA ENGINE ───────────────────────────────────────────────────
async function ReportsWorkspaceDataLoader({ view }: { view: string }) {
  // Slow Prisma database queries run isolated inside this component boundary,
  // the workspace lookup among them.
  const { organizationId } = await requireAccountingWorkspace();
  const accounts = await getAccountOptions(organizationId);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, dateFormat: true, accountingPeriodEnd: true }
  });

  /*
   * The business's own financial year, not the calendar year.
   *
   * currentFinancialYear has been in the codebase all along and was never
   * called from here, so a company with an April year end was handed a profit
   * and loss running from 1 January — the right figures over the wrong twelve
   * months. Falls back to the calendar year only when no year end is recorded.
   */
  const financialYear = currentFinancialYear(org?.accountingPeriodEnd ?? null, accountingToday());
  const reports = await getCoreReports(
    organizationId,
    financialYear
      ? { startDate: financialYear.startDate, endDate: accountingToday() }
      : undefined
  );
  const orgName = org?.name || "Your Company";
  const dateFormat = org?.dateFormat || "YYYY-MM-DD";

  return (
    <ReportsWorkspace 
      key={view} 
      organizationName={orgName} 
      dateFormat={dateFormat} 
      accounts={accounts} 
      {...reports} 
    />
  );
}