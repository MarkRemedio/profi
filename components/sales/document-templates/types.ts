import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Which printable document a template configures. This is a *template
 * classifier*, distinct from the accounting entities (Invoice, CreditNote, …).
 * Not to be confused with `LineTemplateKind` in lib/accounting/templates.ts,
 * which classifies reusable line-item templates.
 */
export type DocumentTemplateKind =
  | "invoice"
  | "bill"
  | "credit_note"
  | "quote"
  | "statement";
// future: | "purchase_order" | "sales_receipt" | "supplier_statement"

/**
 * A self-describing document-template module. The workspace shell renders
 * whatever modules are registered; it knows nothing about specific types.
 *
 * Native modules implement Editor + Preview + Document. Transitional adapters
 * (e.g. the invoice editor) implement only Editor until they are extracted.
 */
export type DocumentModule<Config = unknown, Data = unknown> = {
  id: DocumentTemplateKind;
  kind: DocumentTemplateKind;
  label: string;
  icon: LucideIcon;
  defaults: Config;
  Editor: ComponentType<{ activeOrgId: string }>;
  Preview?: ComponentType<{ config: Config }>;
  Document?: ComponentType<{ config: Config; data: Data }>;
};
