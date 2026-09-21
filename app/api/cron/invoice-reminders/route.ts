import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  isOneTimeReminderKind,
  reminderKindForDate,
  type ReminderKind,
} from "@/lib/accounting/payment-schedule";
import { formatMoney } from "@/lib/currency";
import { isMailConfigured, sendMail } from "@/lib/email/mailer";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import { resolveInvoiceRecipients } from "@/lib/sales/recipients";
import {
  invoiceEmailHtml,
  invoiceEmailSubject,
  type InvoiceEmailLine,
  type InvoiceEmailVariant,
} from "@/lib/sales/invoice-email";

const REMIND_EVERY_DAYS = 7;
const MAX_PER_RUN = 200;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function ukDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${fromIso}T00:00:00Z`).getTime() - new Date(`${toIso}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function dueLabel(kind: ReminderKind, daysOverdue: number): string {
  if (kind === "pre_due") return "Due in 3 days";
  if (kind === "due") return "Due today";
  return `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`;
}

async function reserveReminder(input: {
  organizationId: string;
  invoiceId: string;
  kind: ReminderKind;
  recipients: string;
}): Promise<string | null> {
  try {
    const log = await runAsSystem(() =>
      prisma.reminderLog.create({
        data: { ...input, status: "failed", error: "Delivery did not complete." },
        select: { id: true },
      }),
    );
    return log.id;
  } catch (error) {
    // The partial unique index makes one-time reminders atomic across concurrent runs.
    if (isOneTimeReminderKind(input.kind) && (error as { code?: string }).code === "P2002")
      return null;
    throw error;
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!isMailConfigured())
    return Response.json({ error: "Email is not configured." }, { status: 500 });

  const today = accountingToday();
  const cutoff = new Date(Date.now() - REMIND_EVERY_DAYS * 86_400_000);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const organizations = await runAsSystem(() =>
    prisma.organization.findMany({ select: { id: true, name: true } }),
  );

  for (const org of organizations) {
    if (sent >= MAX_PER_RUN) break;
    try {
      const invoices = await runAsSystem(
        async () => (await listInvoices(prisma, org.id)) as InvoiceWithLines[],
      );
      for (const invoice of invoices) {
        if (sent >= MAX_PER_RUN) break;
        if (invoice.status === "draft" || invoice.status === "void" || !invoice.dueDate) continue;
        const amountDueMinor = invoice.totalMinor - invoice.amountPaidMinor;
        if (amountDueMinor <= 0) continue;

        const kind = reminderKindForDate(today, invoice.dueDate);
        if (!kind) continue;
        const daysOverdue = daysBetween(today, invoice.dueDate);
        const [state, contact] = await Promise.all([
          runAsSystem(() =>
            prisma.invoice.findFirst({
              where: { id: invoice.id, organizationId: org.id },
              select: { lastReminderAt: true, shareToken: true },
            }),
          ),
          runAsSystem(() =>
            prisma.contact.findFirst({
              where: { id: invoice.contactId, organizationId: org.id },
              select: {
                ...CONTACT_NAME_SELECT,
                email: true,
                contactPersons: {
                  select: {
                    email: true,
                    isActive: true,
                    receivesInvoices: true,
                    receivesReminders: true,
                  },
                },
              },
            }),
          ),
        ]);

        if (kind === "overdue" && state?.lastReminderAt && state.lastReminderAt > cutoff) {
          skipped += 1;
          continue;
        }

        const recipients = resolveInvoiceRecipients(
          contact?.email?.trim() ?? "",
          contact?.contactPersons ?? [],
          "reminder",
        );
        const logId = await reserveReminder({
          organizationId: org.id,
          invoiceId: invoice.id,
          kind,
          recipients: [recipients.to, ...recipients.cc].filter(Boolean).join(", "),
        });
        if (!logId) {
          skipped += 1;
          continue;
        }
        if (!recipients.to) {
          const message = "The customer has no primary email address.";
          await runAsSystem(() =>
            prisma.reminderLog.update({ where: { id: logId }, data: { error: message } }),
          );
          errors.push(`${org.name}/${invoice.invoiceNo}: ${message}`);
          continue;
        }

        const money = (minor: number) => formatMoney(minor, invoice.currency);
        const lines: InvoiceEmailLine[] = invoice.lines.map((line) => ({
          description: line.description || "—",
          quantity: String(line.quantity ?? ""),
          amount: money(Number(line.subtotalMinor ?? 0)),
        }));
        const base =
          (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(
            /\/$/,
            "",
          ) || null;
        const variant: InvoiceEmailVariant = kind === "pre_due" ? "pre_due" : "reminder";

        try {
          await sendMail({
            to: recipients.to,
            cc: recipients.cc,
            subject: invoiceEmailSubject(
              org.name,
              invoice.invoiceNo,
              money(amountDueMinor),
              variant,
            ),
            html: invoiceEmailHtml({
              orgName: org.name,
              customerName: contact ? contactDisplayName(contact) : invoice.contactName,
              invoiceNo: invoice.invoiceNo,
              issueDate: ukDate(invoice.issueDate),
              dueDate: ukDate(invoice.dueDate),
              dueLabel: dueLabel(kind, daysOverdue),
              isOverdue: kind === "overdue",
              lines,
              subtotal: money(invoice.subtotalMinor),
              discount: invoice.discountMinor > 0 ? `- ${money(invoice.discountMinor)}` : null,
              tax: invoice.taxMinor > 0 ? money(invoice.taxMinor) : null,
              total: money(invoice.totalMinor),
              amountPaid: invoice.amountPaidMinor > 0 ? money(invoice.amountPaidMinor) : null,
              amountDue: money(amountDueMinor),
              reference: invoice.reference,
              poNumber: invoice.poNumber,
              viewUrl: base && state?.shareToken ? `${base}/i/${state.shareToken}` : null,
              variant,
            }),
            fromName: org.name,
          });

          await runAsSystem(async () => {
            await prisma.reminderLog.update({
              where: { id: logId },
              data: { status: "sent", error: null, sentAt: new Date() },
            });
            if (kind === "overdue") {
              await prisma.invoice.update({
                where: { id: invoice.id },
                data: { lastReminderAt: new Date() },
              });
            }
          });
          sent += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown delivery error";
          await runAsSystem(() =>
            prisma.reminderLog.update({
              where: { id: logId },
              data: { status: "failed", error: message },
            }),
          );
          errors.push(`${org.name}/${invoice.invoiceNo}: ${message}`);
        }
      }
    } catch (error) {
      errors.push(
        `${org.name}: ${error instanceof Error ? error.message : "Unknown reminder error"}`,
      );
    }
  }

  console.log(
    `[cron] INVOICE_REMINDERS sent=${sent} skipped=${skipped} errors=${errors.length}`,
    errors.slice(0, 5),
  );
  return Response.json({ sent, skipped, errors: errors.length });
}
