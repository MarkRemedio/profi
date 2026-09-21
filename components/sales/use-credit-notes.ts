"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

import { createCreditNoteDB, updateCreditNoteDB, deleteCreditNotesDB, fetchCreditNotesDB, voidCreditNoteDB } from "@/app/(dashboard)/sales/credit-notes/actions";

export interface CreditNote {
  id: string;
  cnNo: string;
  contactName: string;
  date: string;
  /** Net of VAT. Equals the total when no VAT was credited. */
  subtotalMinor: number;
  taxMinor: number;
  taxCode: string;
  totalMinor: number;
  remainingMinor: number;
  /** Whether its reversing journal is in the ledger. */
  posted: boolean;
  /** "void" once reversed — the note stays on the record, carrying nothing. */
  status: "open" | "allocated" | "partially_allocated" | "refunded" | "void";
  invoiceRef: string;
}

export function useCreditNotes(activeOrgId: string) {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  // loadNotes re-runs after every mutation, so `loading` alone can't drive the
  // page skeleton — it would blow the whole table away on each save.
  const [hasLoaded, setHasLoaded] = useState(false);

  // 🚀 Fetch real database rows on mount!
  const loadNotes = async () => {
    if (!activeOrgId) {
      setLoading(false); // 🚀 Turn off the spinner if no org ID is present yet!
      return;
    }
    setLoading(true);
    try {
      const notes = await fetchCreditNotesDB(activeOrgId);
      setCreditNotes(notes as any);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setHasLoaded(true);
  };

  useEffect(() => {
    loadNotes();
  }, [activeOrgId]);

  /**
   * Turn a refusal into a message rather than a crash.
   *
   * These actions reject for reasons somebody can act on — a credit note is
   * already in the ledger, a customer name matches nothing, the VAT exceeds the
   * total. Left to propagate, a server action that throws reaches the Next.js
   * error overlay, which shows a stack trace over the page for what is really
   * the application saying "no, and here is why".
   *
   * Returns whether it worked, so a caller can keep a dialog open on failure
   * instead of closing it as though the save had gone through.
   */
  const run = async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    try {
      await action();
      await loadNotes();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback);
      return false;
    }
  };

  const addCreditNote = async (newNote: Omit<CreditNote, "id" | "cnNo">) => {
    if (!activeOrgId) return false;
    // 🚀 Saves directly to PostgreSQL with strict workspace tenant locks
    return run(
      () => createCreditNoteDB(activeOrgId, newNote),
      "That credit note could not be saved."
    );
  };

  const editCreditNote = async (id: string, updatedFields: Partial<CreditNote>) => {
    return run(
      () => updateCreditNoteDB(activeOrgId, id, updatedFields),
      "That credit note could not be updated."
    );
  };

  const deleteNotes = async (idsToDelete: string[]) => {
    return run(
      () => deleteCreditNotesDB(activeOrgId, idsToDelete),
      "Those credit notes could not be deleted."
    );
  };

  const voidNote = async (id: string) => {
    return run(() => voidCreditNoteDB(activeOrgId, id), "That credit note could not be voided.");
  };

  /**
   * Void several at once.
   *
   * Sequential rather than in parallel: each one posts a journal, and the
   * ledger would rather take them in order than have several transactions
   * competing for the same accounts. A handful of credit notes is not a volume
   * problem.
   */
  const voidNotes = async (ids: string[]) => {
    return run(async () => {
      for (const id of ids) {
        await voidCreditNoteDB(activeOrgId, id);
      }
    }, "Those credit notes could not be voided.");
  };

  const stats = useMemo(() => {
    return creditNotes.reduce(
      (acc, cnItem) => {
        /* Void notes count for nothing.
         *
         * Allocated is inferred as total minus remaining, and voiding sets
         * remaining to zero — so a cancelled note read as fully allocated, and
         * the tiles claimed credit had been applied to invoices that had never
         * seen it. A void credit note issues no credit and allocates none; its
         * reversal has already taken it back out of the ledger. */
        if (cnItem.status === "void") return acc;

        acc.totalIssued += Number(cnItem.totalMinor);
        acc.totalRemaining += Number(cnItem.remainingMinor);
        acc.totalAllocated += Number(cnItem.totalMinor) - Number(cnItem.remainingMinor);
        return acc;
      },
      { totalIssued: 0, totalRemaining: 0, totalAllocated: 0 }
    );
  }, [creditNotes]);

  return {
    creditNotes,
    loading,
    // True only for the very first fetch — drives the full-page skeleton.
    initialLoading: loading && !hasLoaded,
    error: null,
    stats,
    addCreditNote,
    editCreditNote,
    deleteNotes,
    voidNote,
    voidNotes,
  };
}