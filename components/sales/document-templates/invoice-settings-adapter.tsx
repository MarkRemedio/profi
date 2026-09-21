"use client";

import { FileText, Receipt, Sliders } from "lucide-react";
import { InvoiceSettings } from "@/components/sales/invoice-settings";
import type { DocumentModule, DocumentTemplateKind } from "./types";

// Transitional: mounts the existing InvoiceSettings chromeless, controlled to a
// single tab, so the shell can host invoice/credit_note/quote under one unified
// tab bar. Delete this file when those types are extracted into native modules.
//
// Known transitional limitation: switching among these three tabs remounts
// InvoiceSettings, so unsaved edits in one are dropped when moving to another.
// Acceptable while this is an adapter; native extraction removes it.
function makeAdapter(
  kind: Extract<DocumentTemplateKind, "invoice" | "credit_note" | "quote">,
  label: string,
  icon: DocumentModule["icon"]
): DocumentModule {
  return {
    id: kind,
    kind,
    label,
    icon,
    defaults: {},
    Editor: ({ activeOrgId }) => (
      <InvoiceSettings activeOrgId={activeOrgId} activeTab={kind} hideChrome />
    ),
  };
}

export const invoiceAdapterModules: DocumentModule[] = [
  makeAdapter("invoice", "Invoice", FileText),
  makeAdapter("credit_note", "Credit Note", Receipt),
  makeAdapter("quote", "Quote / Estimate", Sliders),
];
