import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";

export type PayrollDashboardData = {
  activeEmployees: number;
  totalEmployees: number;
  monthlyCost: number;
  pendingTimesheets: number;
  nextPayDate: string | null;
  daysUntilNextPay: number | null;
  recentPayrollRuns: PayrollRunSummary[];
};

export type PayrollRunSummary = {
  id: string;
  name: string;
  payDate: string;
  status: string;
  employeeCount: number;
  totalNet: number;
};

export type QuickLink = {
  title: string;
  description: string;
  href: string;
  icon: string;
};

export async function getPayrollDashboardData(): Promise<PayrollDashboardData> {
  const workspace = await requireAccountantRole();
  const orgId = workspace.organizationId;

  // Get employee counts
  const [totalEmployees, activeEmployees] = await Promise.all([
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
  ]);

  // Get pending timesheets count
  const pendingTimesheets = await prisma.timesheet.count({
    where: { organizationId: orgId, status: "SUBMITTED" },
  });

  // Get next pay date from active schedule
  const nextSchedule = await prisma.payrollSchedule.findFirst({
    where: { organizationId: orgId, status: "active" },
    orderBy: { nextPayDate: "asc" },
    select: { nextPayDate: true },
  });

  // Get recent payroll runs (last 5)
  const recentRuns = await prisma.payrollRun.findMany({
    where: { organizationId: orgId },
    orderBy: { payDate: "desc" },
    take: 5,
    include: {
      _count: { select: { employees: true } },
    },
  });

  // Calculate monthly cost from last completed run
  const lastCompletedRun = await prisma.payrollRun.findFirst({
    where: { organizationId: orgId, status: "PAID" },
    orderBy: { payDate: "desc" },
    select: { totalNetMinor: true },
  });

  const monthlyCost = lastCompletedRun
    ? Number(lastCompletedRun.totalNetMinor)
    : 0;

  // Map recent runs - transform schema status to UI-expected status
  const statusMap: Record<string, string> = {
    DRAFT: "PENDING",
    APPROVED: "PENDING",
    PROCESSING: "PROCESSING",
    PAID: "COMPLETED",
    FAILED: "FAILED",
  };

  const recentPayrollRuns: PayrollRunSummary[] = recentRuns.map((run) => ({
    id: run.id,
    name: run.name,
    payDate: run.payDate.toISOString().slice(0, 10),
    status: statusMap[run.status] ?? run.status,
    employeeCount: run._count.employees,
    totalNet: Number(run.totalNetMinor),
  }));

  const nextPayDate = nextSchedule?.nextPayDate
    ? nextSchedule.nextPayDate.toISOString().slice(0, 10)
    : null;

  return {
    activeEmployees,
    totalEmployees,
    monthlyCost,
    pendingTimesheets,
    nextPayDate,
    daysUntilNextPay: nextSchedule?.nextPayDate
      ? Math.ceil((nextSchedule.nextPayDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null,
    recentPayrollRuns,
  };
}

export type PayrollSummaryStats = {
  totalGrossPay: number;
  totalTax: number;
  totalNI: number;
  totalPension: number;
  totalNetPay: number;
  employeeCount: number;
};

export async function getPayrollSummaryStats(
  periodStart: Date,
  periodEnd: Date
): Promise<PayrollSummaryStats> {
  const workspace = await requireAccountantRole();

  const runs = await prisma.payrollRun.findMany({
    where: {
      organizationId: workspace.organizationId,
      payDate: { gte: periodStart, lte: periodEnd },
      status: "PAID",
    },
    include: { employees: true },
  });

  let totalGrossPay = 0;
  let totalTax = 0;
  let totalNI = 0;
  let totalPension = 0;
  let totalNetPay = 0;
  let employeeCount = 0;

  for (const run of runs) {
    totalGrossPay += Number(run.totalGrossMinor);
    totalTax += Number(run.totalTaxMinor);
    totalNI += Number(run.totalNIMinor);
    totalPension += Number(run.totalPensionMinor);
    totalNetPay += Number(run.totalNetMinor);
    employeeCount += run.employees.length;
  }

  return {
    totalGrossPay,
    totalTax,
    totalNI,
    totalPension,
    totalNetPay,
    employeeCount,
  };
}
