"use server";

import { requireAccountantRole, requireAccountingWorkspace } from "@/lib/accounting/dal";
import type { PaymentSchedule, ReminderKind } from "@/lib/accounting/payment-schedule";
import { prisma } from "@/lib/prisma";

type Fail = { success: false; error: string };

export type ReminderLogRow = {
  id: string;
  kind: ReminderKind;
  recipients: string;
  sentAt: string;
  status: "sent" | "failed";
  error: string | null;
};

function fail(error: string): Fail {
  return { success: false, error };
}

function normalizeSchedule(schedule: PaymentSchedule): {
  paymentScheduleType: "day_of_month" | "end_of_month" | null;
  paymentScheduleDay: number | null;
} {
  if (!schedule.type) return { paymentScheduleType: null, paymentScheduleDay: null };
  if (schedule.type === "end_of_month") {
    return { paymentScheduleType: "end_of_month", paymentScheduleDay: null };
  }
  if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 28) {
    throw new Error("Choose a payment day from 1 to 28.");
  }
  return { paymentScheduleType: "day_of_month", paymentScheduleDay: schedule.day };
}

export async function getContactPaymentSchedule(
  contactId: string,
): Promise<{ success: true; schedule: PaymentSchedule } | Fail> {
  try {
    if (!contactId) return fail("That customer could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId: workspace.organizationId },
      select: { paymentScheduleType: true, paymentScheduleDay: true },
    });
    if (!contact) return fail("That customer is no longer on your records.");

    if (contact.paymentScheduleType === "day_of_month" && contact.paymentScheduleDay) {
      return {
        success: true,
        schedule: { type: "day_of_month", day: contact.paymentScheduleDay },
      };
    }
    if (contact.paymentScheduleType === "end_of_month") {
      return { success: true, schedule: { type: "end_of_month", day: null } };
    }
    return { success: true, schedule: { type: null, day: null } };
  } catch (error) {
    console.error("Failed to load the customer payment schedule", error);
    return fail("Could not load the agreed payment day. Try again.");
  }
}

export async function updateContactPaymentSchedule(
  contactId: string,
  schedule: PaymentSchedule,
): Promise<{ success: true; schedule: PaymentSchedule } | Fail> {
  try {
    if (!contactId) return fail("That customer could not be identified.");
    const workspace = await requireAccountantRole();
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId: workspace.organizationId },
      select: { id: true },
    });
    if (!contact) return fail("That customer is no longer on your records.");

    const normalized = normalizeSchedule(schedule);
    await prisma.contact.update({
      where: { id: contact.id },
      data: normalized,
    });
    return { success: true, schedule };
  } catch (error) {
    console.error("Failed to update the customer payment schedule", error);
    return fail(error instanceof Error ? error.message : "Could not save the agreed payment day.");
  }
}

export async function listInvoiceReminderLogs(
  invoiceId: string,
): Promise<{ success: true; logs: ReminderLogRow[] } | Fail> {
  try {
    if (!invoiceId) return fail("That invoice could not be identified.");
    const workspace = await requireAccountingWorkspace();
    const logs = await prisma.reminderLog.findMany({
      where: { invoiceId, organizationId: workspace.organizationId },
      select: {
        id: true,
        kind: true,
        recipients: true,
        sentAt: true,
        status: true,
        error: true,
      },
      orderBy: { sentAt: "desc" },
    });

    return {
      success: true,
      logs: logs.map((log) => ({
        id: log.id,
        kind: log.kind as ReminderKind,
        recipients: log.recipients,
        sentAt: log.sentAt.toISOString(),
        status: log.status as "sent" | "failed",
        error: log.error,
      })),
    };
  } catch (error) {
    console.error("Failed to list invoice reminder logs", error);
    return fail("Could not load reminder history. Try again.");
  }
}
