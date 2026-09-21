import "server-only";

import OpenAI from "openai";
import type { AiDocumentKind, AiDocumentProposal } from "@/lib/banking/types";

type Candidate = { id: string; description: string; moneyIn: boolean; amountMinor: number };
type Contact = { id: string; name: string; type: string; pastDescriptions?: string[] };
type Account = { id: string; code: string; name: string; type: string };

/** AI can only select IDs already scoped and supplied by the current workspace. */
export async function proposeBankDocument(candidate: Candidate, contacts: Contact[], accounts: Account[]): Promise<AiDocumentProposal> {
  const manual = (reason: string): AiDocumentProposal => ({ transaction_id: candidate.id, kind: null, confidence: 0, contact_id: null, contact_name: null, account_id: null, account_label: null, reason, requires_manual_intervention: true });
  if (!process.env.OPENAI_API_KEY) return manual("AI document suggestions are unavailable. Review this transaction manually.");
  if (!accounts.length) return manual("No suitable chart-of-accounts code is available. Categorize this transaction manually.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 });
  const response = await client.responses.create({
    model: process.env.OPENAI_AI_ASSISTANT_MODEL || "gpt-5.6-terra",
    instructions: "Propose one accounting document for a bank transaction. Money in may only be sales_receipt or invoice. Money out may only be expense or supplier_bill. Select only a supplied account ID. Reuse a supplied contact ID when the description clearly matches it; otherwise return an empty contactId and derive a short, readable contactName from the merchant or payer wording in the bank description. Do not include dates, card wording, payment verbs, or reference numbers in a derived name. Use invoice only when the description clearly refers to an invoice/customer settlement; use supplier_bill for identifiable supplier purchases, otherwise expense. Confidence must reflect document and account certainty. Return JSON only.",
    input: JSON.stringify({ transaction: candidate, contacts, accounts }),
    text: { format: { type: "json_schema", name: "bank_document_proposal", strict: true, schema: { type: "object", properties: { kind: { type: "string", enum: ["sales_receipt", "invoice", "expense", "supplier_bill"] }, contactId: { type: "string" }, contactName: { type: "string" }, accountId: { type: "string" }, confidence: { type: "number" }, reason: { type: "string" } }, required: ["kind", "contactId", "contactName", "accountId", "confidence", "reason"], additionalProperties: false } } },
    store: false,
    max_output_tokens: 500,
  });
  try {
    const value = JSON.parse(response.output_text) as { kind: AiDocumentKind; contactId: string; contactName: string; accountId: string; confidence: number; reason: string };
    const contact = contacts.find((item) => item.id === value.contactId);
    const account = accounts.find((item) => item.id === value.accountId);
    const directionValid = candidate.moneyIn ? ["sales_receipt", "invoice"].includes(value.kind) : ["expense", "supplier_bill"].includes(value.kind);
    const contactValid = contact && (candidate.moneyIn ? ["customer", "both"].includes(contact.type) : ["supplier", "both"].includes(contact.type));
    const derivedName = value.contactName.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!account || !directionValid || value.confidence < 0.5 || (!contactValid && derivedName.length < 2)) return manual("The record type or accounting category could not be identified reliably. Review this transaction manually.");
    return { transaction_id: candidate.id, kind: value.kind, confidence: Math.round(value.confidence * 100), contact_id: contactValid ? contact.id : null, contact_name: contactValid ? contact.name : derivedName, account_id: account.id, account_label: `${account.code} · ${account.name}`, reason: value.reason.slice(0, 300), requires_manual_intervention: false, requires_post_review: true };
  } catch { return manual("The AI response could not be verified. Review this transaction manually."); }
}
