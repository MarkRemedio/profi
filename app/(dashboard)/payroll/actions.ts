"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { postPayrollRunJournal, reversePayrollRunJournal } from "@/lib/payroll/posting";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";

// ─── Settings ────────────────────────────────────────────────────────────────

export type PayrollSettingsData = {
  payFrequency: string;
  taxOfficeReference: string | null;
  employersTaxId: string | null;
  pensionSchemeRef: string | null;
  pensionAutoEnrolment: boolean;
  pensionContributionRate: number;
  minimumWageRate: number;
  holidayYearStartMonth: number;
  annualLeaveEntitlementDays: number;
  sickPayRate: number;
  bankHolidayEntitlement: number;
};

export async function getPayrollSettings() {
  const workspace = await requireAccountantRole();

  let settings = await prisma.payrollSettings.findUnique({
    where: { organizationId: workspace.organizationId },
  });

  if (!settings) {
    settings = await prisma.payrollSettings.create({
      data: {
        organizationId: workspace.organizationId,
        payFrequency: "monthly",
        pensionAutoEnrolment: true,
        pensionContributionRate: 3,
        annualLeaveEntitlementDays: 28,
        bankHolidayEntitlement: 8,
        isActive: true,
      },
    });
  }

  // ✅ SAFELY CAST ALL DECIMALS/BIGINTS TO NUMBERS FOR THE CLIENT
  return {
    ...settings,
    pensionContributionRate: Number(settings.pensionContributionRate || 0),
    minimumWageRate: Number(settings.minimumWageRate || 0),
    sickPayRate: Number(settings.sickPayRate || 0),
  };
}

export async function updatePayrollSettings(input: PayrollSettingsData) {
  const workspace = await requireAccountantRole();

  const data: Prisma.PayrollSettingsUpdateInput = {
    payFrequency: input.payFrequency,
    taxOfficeReference: input.taxOfficeReference,
    employersTaxId: input.employersTaxId,
    pensionSchemeRef: input.pensionSchemeRef,
    pensionAutoEnrolment: input.pensionAutoEnrolment,
    
    // ✅ CAST NUMBERS BACK TO PRISMA DECIMALS WHEN SAVING
    pensionContributionRate: input.pensionContributionRate,
    minimumWageRate: input.minimumWageRate,
    sickPayRate: input.sickPayRate,
    
    holidayYearStartMonth: input.holidayYearStartMonth,
    annualLeaveEntitlementDays: input.annualLeaveEntitlementDays,
    bankHolidayEntitlement: input.bankHolidayEntitlement,
  };

  const settings = await prisma.payrollSettings.upsert({
    where: { organizationId: workspace.organizationId },
    update: data,
    create: {
      organization: { connect: { id: workspace.organizationId } },
      payFrequency: input.payFrequency,
      taxOfficeReference: input.taxOfficeReference,
      employersTaxId: input.employersTaxId,
      pensionSchemeRef: input.pensionSchemeRef,
      pensionAutoEnrolment: input.pensionAutoEnrolment,
      pensionContributionRate: input.pensionContributionRate,
      minimumWageRate: input.minimumWageRate,
      holidayYearStartMonth: input.holidayYearStartMonth,
      annualLeaveEntitlementDays: input.annualLeaveEntitlementDays,
      sickPayRate: input.sickPayRate,
      bankHolidayEntitlement: input.bankHolidayEntitlement,
      isActive: true,
    },
  });

  revalidatePath("/payroll/settings");
  
  // ✅ SAFELY CAST AGAIN ON RETURN
  return {
    ...settings,
    pensionContributionRate: Number(settings.pensionContributionRate || 0),
    minimumWageRate: Number(settings.minimumWageRate || 0),
    sickPayRate: Number(settings.sickPayRate || 0),
  };
}
// ─── Employees ────────────────────────────────────────────────────────────────

export type CreateEmployeeInput = {
  contactId?: string;
  name?: string;
  email?: string;
  phone?: string;
  employeeCode: string;
  startDate: string;
  jobTitle?: string;
  department?: string;
  salaryAmountMinor: number;
  salaryFrequency?: string;
  taxCode?: string;
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACTOR" | "CASUAL";
  nationalInsuranceNo?: string;
  pensionEnrolled?: boolean;
  rightToWorkConfirmed?: boolean;
  hasSignedContract?: boolean;
  notes?: string;
};

export type EmployeeDTO = {
  id: string;
  organizationId: string;
  contactId: string;
  employeeCode: string;
  startDate: string;
  endDate: string | null;
  employmentType: string;
  status: string;
  jobTitle: string | null;
  department: string | null;
  salaryAmountMinor: number;
  salaryFrequency: string;
  taxCode: string;
  nationalInsuranceNo: string | null;
  pensionEnrolled: boolean;
  pensionContributionRate: number;
  rightToWorkConfirmed: boolean;
  hasSignedContract: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    name: string;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name_preference?: string | null;
  } | null;
};

function toEmployeeDTO(employee: {
  id: string;
  organizationId: string;
  contactId: string;
  employeeCode: string;
  startDate: Date;
  endDate: Date | null;
  employmentType: string;
  status: string;
  jobTitle: string | null;
  department: string | null;
  salaryAmountMinor: bigint;
  salaryFrequency: string;
  taxCode: string;
  nationalInsuranceNo: string | null;
  pensionEnrolled: boolean;
  pensionContributionRate: Prisma.Decimal;
  rightToWorkConfirmed: boolean;
  hasSignedContract: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact?: {
    name: string;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name_preference?: string | null;
  };
}): EmployeeDTO {
  return {
    id: employee.id,
    organizationId: employee.organizationId,
    contactId: employee.contactId,
    employeeCode: employee.employeeCode,
    startDate: employee.startDate.toISOString(),
    endDate: employee.endDate?.toISOString() ?? null,
    employmentType: employee.employmentType,
    status: employee.status,
    jobTitle: employee.jobTitle,
    department: employee.department,
    salaryAmountMinor: Number(employee.salaryAmountMinor),
    salaryFrequency: employee.salaryFrequency,
    taxCode: employee.taxCode,
    nationalInsuranceNo: employee.nationalInsuranceNo,
    pensionEnrolled: employee.pensionEnrolled,
    pensionContributionRate: Number(employee.pensionContributionRate),
    rightToWorkConfirmed: employee.rightToWorkConfirmed,
    hasSignedContract: employee.hasSignedContract,
    notes: employee.notes,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    contact: employee.contact ?? null,
  };
}

export async function getEmployees() {
  const workspace = await requireAccountantRole();

  const employees = await prisma.employee.findMany({
    where: { organizationId: workspace.organizationId },
    include: {
      contact: { select: { ...CONTACT_NAME_SELECT, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return employees.map(toEmployeeDTO);
}

export async function createEmployee(input: CreateEmployeeInput) {
  const workspace = await requireAccountantRole();

  if (!input.employeeCode || !input.startDate || input.salaryAmountMinor <= 0) {
    throw new Error("Employee code, start date, and salary are required.");
  }

  if (!input.contactId && !input.name) {
    throw new Error("Employee name is required.");
  }

  const contactId =
    input.contactId ||
    (
      await prisma.contact.create({
        data: {
          organizationId: workspace.organizationId,
          contactType: "BOTH",
          name: input.name!,
          email: input.email,
          phone: input.phone,
        },
        select: { id: true },
      })
    ).id;

  const employee = await prisma.employee.create({
    data: {
      organizationId: workspace.organizationId,
      contactId,
      employeeCode: input.employeeCode,
      startDate: new Date(input.startDate),
      jobTitle: input.jobTitle,
      department: input.department,

      // ✅ Safely cast the JavaScript number to a Prisma BigInt!
      salaryAmountMinor: BigInt(input.salaryAmountMinor),

      salaryFrequency: input.salaryFrequency ?? "annual",
      taxCode: input.taxCode ?? "1250L",
      employmentType: input.employmentType ?? "FULL_TIME",
      nationalInsuranceNo: input.nationalInsuranceNo,
      pensionEnrolled: input.pensionEnrolled ?? false,
      rightToWorkConfirmed: input.rightToWorkConfirmed ?? false,
      hasSignedContract: input.hasSignedContract ?? false,
      notes: input.notes,
    },
    include: {
      contact: { select: { ...CONTACT_NAME_SELECT, email: true } },
    },
  });

  revalidatePath("/payroll/employees");
  revalidatePath("/payroll");
  return toEmployeeDTO(employee);
}

// ✅ Duplicate updateEmployee removed! Only one strictly typed function remains.
export async function updateEmployee(id: string, input: Partial<CreateEmployeeInput>) {
  const workspace = await requireAccountantRole();

  const employee = await prisma.employee.update({
    where: { id, organizationId: workspace.organizationId },
    data: {
      jobTitle: input.jobTitle,
      department: input.department,
      
      // ✅ Safely cast to BigInt if it is included in the update
      salaryAmountMinor: input.salaryAmountMinor !== undefined ? BigInt(input.salaryAmountMinor) : undefined,
      
      salaryFrequency: input.salaryFrequency,
      taxCode: input.taxCode,
      nationalInsuranceNo: input.nationalInsuranceNo,
      pensionEnrolled: input.pensionEnrolled,
      rightToWorkConfirmed: input.rightToWorkConfirmed,
      hasSignedContract: input.hasSignedContract,
      notes: input.notes,
      endDate: input.startDate ? new Date(input.startDate) : undefined,
    },
  });

  revalidatePath("/payroll/employees");
  revalidatePath("/payroll");
  return toEmployeeDTO(employee);
}

// ─── Timesheets ───────────────────────────────────────────────────────────────

export type CreateTimesheetInput = {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  entries: Array<{
    date: string;
    hoursWorked: number;
    leaveType?: "ANNUAL" | "SICK" | "UNPAID" | "MATERNITY" | "PATERNITY" | "OTHER";
    leaveHours?: number;
    notes?: string;
  }>;
};

export async function getTimesheets() {
  const workspace = await requireAccountantRole();

  const timesheets = await prisma.timesheet.findMany({
    where: { organizationId: workspace.organizationId },
    include: {
      employee: { include: { contact: { select: CONTACT_NAME_SELECT } } },
      linkedPayrollRun: { select: { name: true } },
    },
    orderBy: { periodStart: "desc" },
  });

  return timesheets;
}

export async function createTimesheet(input: CreateTimesheetInput) {
  const workspace = await requireAccountantRole();

  if (!input.employeeId || !input.periodStart || !input.periodEnd) {
    throw new Error("Employee, period start and end are required.");
  }

  const timesheet = await prisma.timesheet.create({
    data: {
      organizationId: workspace.organizationId,
      employeeId: input.employeeId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      status: "DRAFT",
      entries: {
        create: input.entries.map((entry) => ({
          date: new Date(entry.date),
          hours: entry.hoursWorked,
          leaveType: entry.leaveType ?? null,
          leaveHours: entry.leaveHours ?? 0,
          notes: entry.notes ?? null,
        })),
      },
    },
  });

  revalidatePath("/payroll/timesheets");
  revalidatePath("/payroll");
  return timesheet;
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export type CreatePayrollRunInput = {
  name: string;
  payDate: string;
  department?: string;
  scheduleId?: string;
  employees?: Array<{
    id: string;
    grossPayMinor: number;
    taxMinor: number;
    nationalInsuranceMinor: number;
    netPayMinor: number;
  }>;
};

export async function getPayrollRuns() {
  const workspace = await requireAccountantRole();

  const runs = await prisma.payrollRun.findMany({
    where: { organizationId: workspace.organizationId },
    include: {
      schedule: { select: { name: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { payDate: "desc" },
  });

  return runs;
}

export async function createPayrollRun(input: CreatePayrollRunInput) {
  const workspace = await requireAccountantRole();

  let totalGrossMinor = 0;
  let totalTaxMinor = 0;
  let totalNIMinor = 0;
  let totalNetMinor = 0;

  if (input.employees) {
    totalGrossMinor = input.employees.reduce((sum, emp) => sum + emp.grossPayMinor, 0);
    totalTaxMinor = input.employees.reduce((sum, emp) => sum + emp.taxMinor, 0);
    totalNIMinor = input.employees.reduce((sum, emp) => sum + emp.nationalInsuranceMinor, 0);
    totalNetMinor = input.employees.reduce((sum, emp) => sum + emp.netPayMinor, 0);
  }

  const run = await prisma.payrollRun.create({
    data: {
      organizationId: workspace.organizationId,
      name: input.name,
      payDate: new Date(input.payDate),
      status: "DRAFT",
      
      pay_period_start: new Date(input.payDate),
      pay_period_end: new Date(input.payDate),
      department: input.department ?? null,
      scheduleId: input.scheduleId ?? null,
      
      totalGrossMinor: BigInt(totalGrossMinor),
      totalTaxMinor: BigInt(totalTaxMinor),
      totalNIMinor: BigInt(totalNIMinor),
      totalPensionMinor: BigInt(0), 
      totalNetMinor: BigInt(totalNetMinor),
    },
  });

  if (input.employees && input.employees.length > 0) {
    const employeeRecords = input.employees.map((emp) => ({
      payrollRunId: run.id,
      run_id: run.id,
      employeeId: emp.id,
      grossSalaryMinor: BigInt(emp.grossPayMinor),
      taxMinor: BigInt(emp.taxMinor),
      nationalInsuranceMinor: BigInt(emp.nationalInsuranceMinor),
      netPayMinor: BigInt(emp.netPayMinor),
      hoursWorked: 0,
    }));

    await prisma.payrollRunEmployee.createMany({
      data: employeeRecords,
    });
  }

  revalidatePath("/payroll/run-payroll");
  revalidatePath("/payroll");
  
  return { id: run.id, name: run.name }; 
}

export async function approvePayrollRun(id: string) {
  const workspace = await requireAccountantRole();
  const orgId = workspace.organizationId;

  await prisma.$transaction(async (tx) => {
    // Only DRAFT runs may be approved — mirrors the invoice/bill approve guard,
    // and keeps PayrollRun.status from drifting (e.g. forcing a PAID run back to
    // APPROVED). The ledger itself is already double-post-safe via journal_id.
    const run = await tx.payrollRun.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true },
    });
    if (!run) throw new Error("Payroll run not found.");
    if (run.status !== "DRAFT") {
      throw new Error(`Only draft payroll runs can be approved (current status: ${run.status}).`);
    }
    await postPayrollRunJournal(tx, orgId, workspace.userId, id);
    await tx.payrollRun.update({
      where: { id, organizationId: orgId },
      data: { status: "APPROVED" },
    });
  });

  revalidatePath("/payroll/run-payroll");
  revalidatePath("/payroll");
  return { id };
}

export async function reversePayrollRun(id: string) {
  const workspace = await requireAccountantRole();
  const orgId = workspace.organizationId;

  await prisma.$transaction(async (tx) => {
    // Only APPROVED (posted) runs may be reversed — keeps status in sync with the
    // ledger side. The reversal itself is idempotent (no-op if not posted / already reversed).
    const run = await tx.payrollRun.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true },
    });
    if (!run) throw new Error("Payroll run not found.");
    if (run.status !== "APPROVED") {
      throw new Error(`Only approved payroll runs can be reversed (current status: ${run.status}).`);
    }
    await reversePayrollRunJournal(tx, orgId, workspace.userId, id);
    await tx.payrollRun.update({
      where: { id, organizationId: orgId },
      data: { status: "DRAFT" },
    });
  });

  revalidatePath("/payroll/run-payroll");
  revalidatePath("/payroll");
  return { id };
}

// ─── Report Generation ────────────────────────────────────────────────────────

export type PayrollReportRow = {
  id: string;
  period: string;
  grossPay: number;
  tax: number;
  nationalInsurance: number;
  pension: number;
  netPay: number;
  employeeCount: number;
};

export async function getPayrollSummaryReport(
  periodStart: string,
  periodEnd: string,
): Promise<PayrollReportRow[]> {
  const workspace = await requireAccountantRole();

  const runs = await prisma.payrollRun.findMany({
    where: {
      organizationId: workspace.organizationId,
      payDate: {
        gte: new Date(periodStart),
        lte: new Date(periodEnd),
      },
    },
    include: {
      _count: { select: { employees: true } },
    },
    orderBy: { payDate: "desc" },
  });

  return runs.map((run) => ({
    id: run.id,
    period: run.payDate.toISOString().slice(0, 7),
    grossPay: Number(run.totalGrossMinor) / 100,
    tax: Number(run.totalTaxMinor) / 100,
    nationalInsurance: Number(run.totalNIMinor) / 100,
    pension: Number(run.totalPensionMinor) / 100,
    netPay: Number(run.totalNetMinor) / 100,
    employeeCount: run._count.employees,
  }));
}

export type P60Data = {
  employeeName: string;
  taxCode: string;
  niNumber: string;
  taxYear: string;
  totalEarnings: number;
  totalTax: number;
  totalNI: number;
  totalPension: number;
  netPay: number;
};

export async function generateP60Report(taxYear: number): Promise<P60Data[]> {
  const workspace = await requireAccountantRole();

  const startDate = new Date(`${taxYear}-04-06`);
  const endDate = new Date(`${taxYear + 1}-04-05`);

  const employees = await prisma.employee.findMany({
    where: {
      organizationId: workspace.organizationId,
      status: "ACTIVE",
    },
    include: {
      contact: { select: CONTACT_NAME_SELECT },
      payrollRunEmployees: {
        where: {
          payrollRun: {
            payDate: { gte: startDate, lte: endDate },
            status: "PAID",
          },
        },
      },
    },
  });

  return employees.map((emp) => {
    const totalEarnings = emp.payrollRunEmployees.reduce(
      (sum, pre) => sum + Number(pre.grossSalaryMinor),
      0,
    );
    const totalTax = emp.payrollRunEmployees.reduce((sum, pre) => sum + Number(pre.taxMinor), 0);
    const totalNI = emp.payrollRunEmployees.reduce(
      (sum, pre) => sum + Number(pre.nationalInsuranceMinor),
      0,
    );
    const totalPension = emp.payrollRunEmployees.reduce(
      (sum, pre) => sum + Number(pre.pensionEmployeeContribution),
      0,
    );
    const netPay = emp.payrollRunEmployees.reduce((sum, pre) => sum + Number(pre.netPayMinor), 0);

    return {
      employeeName: contactDisplayName(emp.contact),
      taxCode: emp.taxCode,
      niNumber: emp.nationalInsuranceNo ?? "",
      taxYear: `${taxYear}/${taxYear + 1}`,
      totalEarnings: totalEarnings / 100,
      totalTax: totalTax / 100,
      totalNI: totalNI / 100,
      totalPension: totalPension / 100,
      netPay: netPay / 100,
    };
  });
}

export type FPSData = {
  payrollRunId: string;
  submissionDate: string;
  employees: {
    niNumber: string;
    taxCode: string;
    grossEarnings: number;
    taxDeducted: number;
    niDeducted: number;
  }[];
};

export async function generateFPSReport(payrollRunId: string): Promise<FPSData> {
  const workspace = await requireAccountantRole();

  const run = await prisma.payrollRun.findUniqueOrThrow({
    where: { id: payrollRunId, organizationId: workspace.organizationId },
    include: {
      employees: {
        include: { employee: true },
      },
    },
  });

  return {
    payrollRunId: run.id,
    submissionDate: new Date().toISOString().slice(0, 10),
    employees: run.employees.map((pre) => ({
      niNumber: pre.employee.nationalInsuranceNo ?? "",
      taxCode: pre.employee.taxCode,
      grossEarnings: Number(pre.grossSalaryMinor) / 100,
      taxDeducted: Number(pre.taxMinor) / 100,
      niDeducted: Number(pre.nationalInsuranceMinor) / 100,
    })),
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getPayrollDashboardData() {
  const workspace = await requireAccountantRole();

  const activeEmployees = await prisma.employee.count({
    where: {
      organizationId: workspace.organizationId,
      status: "ACTIVE",
    },
  });

  const nextSchedule = await prisma.payrollSchedule.findFirst({
    where: {
      organizationId: workspace.organizationId,
      nextPayDate: { gte: new Date() },
      status: "active",
    },
    orderBy: { nextPayDate: "asc" },
  });

  let daysUntilNextPay = null;
  if (nextSchedule?.nextPayDate) {
    const today = new Date();
    const diffTime = Math.abs(nextSchedule.nextPayDate.getTime() - today.getTime());
    daysUntilNextPay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const pendingTimesheets = await prisma.timesheet.count({
    where: {
      organizationId: workspace.organizationId,
      status: "SUBMITTED",
    },
  });

  const recentRuns = await prisma.payrollRun.findMany({
    where: { organizationId: workspace.organizationId },
    orderBy: { payDate: "desc" },
    take: 5,
    include: {
      _count: {
        select: { employees: true },
      },
    },
  });

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const monthlyCost = recentRuns
    .filter(
      (run) =>
        run.status === "PAID" &&
        run.payDate.getMonth() === currentMonth &&
        run.payDate.getFullYear() === currentYear
    )
    .reduce((sum, run) => sum + Number(run.totalNetMinor), 0);

  const formattedRecentRuns = recentRuns.map((run) => {
    let uiStatus = "PENDING";
    if (run.status === "PAID") uiStatus = "COMPLETED";
    if (run.status === "PROCESSING") uiStatus = "PROCESSING";
    if (run.status === "FAILED") uiStatus = "FAILED";

    return {
      id: run.id,
      name: run.name,
      status: uiStatus,
      payDate: run.payDate,
      totalNet: Number(run.totalNetMinor),
      employeeCount: run._count.employees,
    };
  });

  return {
    activeEmployees,
    daysUntilNextPay,
    monthlyCost,
    pendingTimesheets,
    recentPayrollRuns: formattedRecentRuns,
  };
}