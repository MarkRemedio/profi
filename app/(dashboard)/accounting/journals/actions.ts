"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, JournalStatus } from "@prisma/client";

import { poundsToMinor } from "@/lib/accounting/money";
import { prisma, type TransactionClient } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

export type JournalLineInput = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
};

export type JournalInput = {
  journalId?: string;
  journalDate: string;
  status?: "draft" | "posted";
  autoReversalDate?: string | null;
  memo: string;
  lines: JournalLineInput[];
};

function normalizeLines(lines: JournalLineInput[]) {
  const normalized = lines
    .map((line) => {
      const debit = line.debit.trim() ? poundsToMinor(line.debit) : BigInt(0);
      const credit = line.credit.trim() ? poundsToMinor(line.credit) : BigInt(0);

      if (
        (debit > BigInt(0) && credit > BigInt(0)) ||
        (debit === BigInt(0) && credit === BigInt(0))
      ) {
        throw new Error("Each journal line needs either a debit or a credit.");
      }

      return {
        accountId: line.accountId,
        debitMinor: debit,
        creditMinor: credit,
        memo: line.memo.trim() || null,
      };
    })
    .filter((line) => line.accountId);

  if (normalized.length < 2) {
    throw new Error("A journal needs at least two lines.");
  }

  const debitTotal = normalized.reduce((total, line) => total + line.debitMinor, BigInt(0));
  const creditTotal = normalized.reduce((total, line) => total + line.creditMinor, BigInt(0));

  if (debitTotal !== creditTotal) {
    throw new Error(
      `Journal entry is unbalanced: debits (${debitTotal}) do not equal credits (${creditTotal}).`,
    );
  }

  if (debitTotal === BigInt(0)) {
    throw new Error("Journal entry must have at least one non-zero amount.");
  }

  return {
    lines: normalized,
    debitTotal,
    creditTotal,
  };
}

function parseJournalDate(value: string) {
  if (!value) throw new Error("Journal date is required.");
  return new Date(`${value}T00:00:00.000Z`);
}

function parseOptionalJournalDate(value?: string | null) {
  return value ? parseJournalDate(value) : null;
}

function revalidateAccounting() {
  revalidatePath("/dashboard");
  revalidatePath("/accounting/journals");
  revalidatePath("/reports");
  revalidatePath("/taxes");
}

async function createPostedReversalJournal(
  tx: TransactionClient,
  input: {
    organizationId: string;
    actorUserId: string;
    original: {
      id: string;
      memo: string | null;
      lines: Array<{
        accountId: string;
        contactId: string | null;
        debitMinor: bigint;
        creditMinor: bigint;
        memo: string | null;
      }>;
    };
    reversalDate: Date;
  },
) {
  const existingReversal = await tx.journal.findFirst({
    where: {
      organizationId: input.organizationId,
      reversedJournalId: input.original.id,
    },
    select: { id: true },
  });

  if (existingReversal) return existingReversal.id;

  await assertPeriodOpen(tx, input.organizationId, input.reversalDate);

  const reversal = await tx.journal.create({
    data: {
      organizationId: input.organizationId,
      journalDate: input.reversalDate,
      memo: `Reversal of ${input.original.memo || input.original.id}`,
      status: JournalStatus.DRAFT,
      sourceType: "manual_reversal",
      reversedJournalId: input.original.id,
      createdByUserId: input.actorUserId,
      lines: {
        create: input.original.lines.map((line) => ({
          organizationId: input.organizationId,
          accountId: line.accountId,
          contactId: line.contactId,
          debitMinor: line.creditMinor,
          creditMinor: line.debitMinor,
          memo: line.memo ? `Reversal: ${line.memo}` : "Reversal",
        })),
      },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: reversal.id },
    data: {
      status: JournalStatus.POSTED,
      postedAt: new Date(),
      postedByUserId: input.actorUserId,
    },
  });

  await tx.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      entityType: "journal",
      entityId: input.original.id,
      action: AuditAction.REVERSE,
      after: {
        reversalJournalId: reversal.id,
        reversalDate: input.reversalDate.toISOString().slice(0, 10),
      },
    },
  });

  return reversal.id;
}

export async function createDraftJournal(input: JournalInput) {
  const workspace = await requireAccountantRole();
  const normalized = normalizeLines(input.lines);
  const requestedStatus = input.status ?? "draft";
  const autoReversalDate = parseOptionalJournalDate(input.autoReversalDate);

  const parsedJournalDate = parseJournalDate(input.journalDate);

  await prisma.$transaction(async (tx) => {
    if (requestedStatus === "posted") {
      await assertPeriodOpen(tx, workspace.organizationId, parsedJournalDate);
    }

    const journal = await tx.journal.create({
      data: {
        organizationId: workspace.organizationId,
        journalDate: parsedJournalDate,
        memo: input.memo.trim() || null,
        status: JournalStatus.DRAFT,
        sourceType: "manual",
        autoReversalDate,
        postedAt: null,
        postedByUserId: null,
        createdByUserId: workspace.userId,
        lines: {
          create: normalized.lines.map((line) => ({
            organizationId: workspace.organizationId,
            ...line,
          })),
        },
      },
      include: { lines: true },
    });

    if (requestedStatus === "posted") {
      await tx.journal.update({
        where: { id: journal.id },
        data: {
          status: JournalStatus.POSTED,
          postedAt: new Date(),
          postedByUserId: workspace.userId,
        },
      });
    }

    if (requestedStatus === "posted" && autoReversalDate) {
      try {
        await createPostedReversalJournal(tx, {
          organizationId: workspace.organizationId,
          actorUserId: workspace.userId,
          original: journal,
          reversalDate: autoReversalDate,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("accounting period")) {
          const reversalLabel = autoReversalDate.toISOString().slice(0, 10);
          throw new Error(
            `Cannot post: its auto-reversal date ${reversalLabel} is inside a closed accounting period.`,
          );
        }
        throw error;
      }
    }

    await tx.auditEvent.create({
      data: {
        organizationId: workspace.organizationId,
        actorUserId: workspace.userId,
        entityType: "journal",
        entityId: journal.id,
        action: requestedStatus === "posted" ? AuditAction.POST : AuditAction.CREATE,
        after: {
          memo: input.memo,
          journalDate: input.journalDate,
          status: requestedStatus,
          autoReversalDate: input.autoReversalDate ?? null,
          debitMinor: normalized.debitTotal.toString(),
          creditMinor: normalized.creditTotal.toString(),
        },
      },
    });
  });

  revalidateAccounting();
}

export async function updateDraftJournal(input: JournalInput) {
  if (!input.journalId) throw new Error("Journal id is required.");
  const workspace = await requireAccountantRole();
  const normalized = normalizeLines(input.lines);
  const parsedJournalDate = parseJournalDate(input.journalDate);

  await prisma.$transaction(async (tx) => {
    const journal = await tx.journal.findFirstOrThrow({
      where: {
        id: input.journalId,
        organizationId: workspace.organizationId,
        status: JournalStatus.DRAFT,
      },
      include: { lines: true },
    });

    await assertPeriodOpen(tx, workspace.organizationId, parsedJournalDate);

    await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
    await tx.journal.update({
      where: { id: journal.id },
      data: {
        journalDate: parsedJournalDate,
        memo: input.memo.trim() || null,
        autoReversalDate: parseOptionalJournalDate(input.autoReversalDate),
        lines: {
          create: normalized.lines.map((line) => ({
            organizationId: workspace.organizationId,
            ...line,
          })),
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: workspace.organizationId,
        actorUserId: workspace.userId,
        entityType: "journal",
        entityId: journal.id,
        action: AuditAction.UPDATE,
        before: { lines: journal.lines.length, memo: journal.memo },
        after: {
          memo: input.memo,
          journalDate: input.journalDate,
          debitMinor: normalized.debitTotal.toString(),
          creditMinor: normalized.creditTotal.toString(),
        },
      },
    });
  });

  revalidateAccounting();
}

export async function postJournal(journalId: string) {
  const workspace = await requireAccountantRole();

  await prisma.$transaction(async (tx) => {
    const journal = await tx.journal.findFirstOrThrow({
      where: {
        id: journalId,
        organizationId: workspace.organizationId,
        status: JournalStatus.DRAFT,
      },
      include: { lines: true },
    });

    // Re-validate that the journal is balanced before posting
    const debitTotal = journal.lines.reduce((sum, line) => sum + line.debitMinor, BigInt(0));
    const creditTotal = journal.lines.reduce((sum, line) => sum + line.creditMinor, BigInt(0));

    if (debitTotal !== creditTotal) {
      throw new Error(
        `Cannot post unbalanced journal: debits (${debitTotal}) do not equal credits (${creditTotal}).`,
      );
    }

    if (debitTotal === BigInt(0)) {
      throw new Error("Cannot post a journal with zero amounts.");
    }

    await assertPeriodOpen(tx, workspace.organizationId, journal.journalDate);

    await tx.journal.update({
      where: { id: journal.id },
      data: {
        status: JournalStatus.POSTED,
        postedAt: new Date(),
        postedByUserId: workspace.userId,
      },
    });

    if (journal.autoReversalDate) {
      try {
        await createPostedReversalJournal(tx, {
          organizationId: workspace.organizationId,
          actorUserId: workspace.userId,
          original: journal,
          reversalDate: journal.autoReversalDate,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("accounting period")) {
          const reversalLabel = journal.autoReversalDate.toISOString().slice(0, 10);
          throw new Error(
            `Cannot post: its auto-reversal date ${reversalLabel} is inside a closed accounting period.`,
          );
        }
        throw error;
      }
    }

    await tx.auditEvent.create({
      data: {
        organizationId: workspace.organizationId,
        actorUserId: workspace.userId,
        entityType: "journal",
        entityId: journal.id,
        action: AuditAction.POST,
        after: { lineCount: journal.lines.length },
      },
    });
  });

  revalidateAccounting();
}

export async function reversePostedJournal(journalId: string) {
  const workspace = await requireAccountantRole();

  await prisma.$transaction(async (tx) => {
    const original = await tx.journal.findFirstOrThrow({
      where: {
        id: journalId,
        organizationId: workspace.organizationId,
        status: JournalStatus.POSTED,
      },
      include: { lines: true },
    });

    await createPostedReversalJournal(tx, {
      organizationId: workspace.organizationId,
      actorUserId: workspace.userId,
      original,
      reversalDate: new Date(),
    });
  });

  revalidateAccounting();
}

export async function deleteDraftJournal(journalId: string) {
  const workspace = await requireAccountantRole();

  await prisma.$transaction(async (tx) => {
    const journal = await tx.journal.findFirstOrThrow({
      where: {
        id: journalId,
        organizationId: workspace.organizationId,
        status: JournalStatus.DRAFT,
      },
      include: { lines: true },
    });

    await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
    await tx.journal.delete({ where: { id: journal.id } });
    await tx.auditEvent.create({
      data: {
        organizationId: workspace.organizationId,
        actorUserId: workspace.userId,
        entityType: "journal",
        entityId: journal.id,
        action: AuditAction.DELETE,
        before: { memo: journal.memo, lineCount: journal.lines.length },
      },
    });
  });

  revalidateAccounting();
}
