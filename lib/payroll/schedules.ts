"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";

export type PayrollScheduleRow = {
  id: string;
  name: string;
  frequency: string;
  department: string | null;
  nextPayDate: string;
  lastRunDate: string | null;
  status: string;
};

export async function getPayrollSchedules(): Promise<PayrollScheduleRow[]> {
  const workspace = await requireAccountantRole();

  const schedules = await prisma.payrollSchedule.findMany({
    where: { organizationId: workspace.organizationId },
    orderBy: { nextPayDate: "asc" },
  });

  return schedules.map((s) => ({
    id: s.id,
    name: s.name,
    frequency: s.frequency,
    department: s.department,
    nextPayDate: s.nextPayDate.toISOString().slice(0, 10),
    lastRunDate: s.lastRunDate?.toISOString().slice(0, 10) ?? null,
    status: s.status,
  }));
}

export async function createPayrollSchedule(data: {
  name: string;
  frequency: string;
  department?: string;
  nextPayDate: string;
}): Promise<PayrollScheduleRow> {
  const workspace = await requireAccountantRole();

  const schedule = await prisma.payrollSchedule.create({
    data: {
      organizationId: workspace.organizationId,
      name: data.name,
      frequency: data.frequency,
      department: data.department ?? null,
      nextPayDate: new Date(data.nextPayDate),
      status: "active",
    },
  });

  return {
    id: schedule.id,
    name: schedule.name,
    frequency: schedule.frequency,
    department: schedule.department,
    nextPayDate: schedule.nextPayDate.toISOString().slice(0, 10),
    lastRunDate: schedule.lastRunDate?.toISOString().slice(0, 10) ?? null,
    status: schedule.status,
  };
}

export async function updatePayrollSchedule(
  id: string,
  data: {
    name?: string;
    frequency?: string;
    department?: string | null;
    nextPayDate?: string;
    status?: string;
  }
): Promise<PayrollScheduleRow> {
  const workspace = await requireAccountantRole();

  const updateData: Prisma.PayrollScheduleUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.frequency !== undefined) updateData.frequency = data.frequency;
  if (data.department !== undefined) updateData.department = data.department;
  if (data.nextPayDate !== undefined)
    updateData.nextPayDate = new Date(data.nextPayDate);
  if (data.status !== undefined) updateData.status = data.status;

  const schedule = await prisma.payrollSchedule.update({
    where: { id, organizationId: workspace.organizationId },
    data: updateData,
  });

  return {
    id: schedule.id,
    name: schedule.name,
    frequency: schedule.frequency,
    department: schedule.department,
    nextPayDate: schedule.nextPayDate.toISOString().slice(0, 10),
    lastRunDate: schedule.lastRunDate?.toISOString().slice(0, 10) ?? null,
    status: schedule.status,
  };
}

export async function deletePayrollSchedule(id: string): Promise<void> {
  const workspace = await requireAccountantRole();

  await prisma.payrollSchedule.delete({
    where: { id, organizationId: workspace.organizationId },
  });
}
