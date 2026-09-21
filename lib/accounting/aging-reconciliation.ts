import "server-only";

import type { DbOrTx } from "@/lib/prisma";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";

/**
 * Everything the aged reports cannot see by walking documents, plus the ledger
 * balance they should add up to.
 *
 * An aged report is a re-derivation. It walks the invoices or the bills and
 * totals what looks unsettled, while the control account already holds the
 * answer — every debit and credit that has touched receivables or payables
 * since the business began. Two derivations of one number, from different data
 * by different code. Agreement is evidence; disagreement is a defect with an
 * amount attached.
 *
 * Nothing checked that, and the gap was not hypothetical. A receivable moves
 * for reasons no invoice explains:
 *
 *   - a credit note, which credits the receivable and reduces what is owed;
 *   - a bank receipt categorised straight to Accounts Receivable — a payment on
 *     account, where a customer has paid without saying which invoice it is for;
 *   - anything else posted directly to the control account.
 *
 * None of those appeared in aged receivables. A customer sitting in credit
 * showed as owing nothing rather than being owed, and the report's total
 * disagreed with the trial balance while presenting itself as authoritative.
 *
 * Rather than enumerate the cases, this reads the residual: movement on the
 * control account that no invoice (or bill) accounts for. That covers all three
 * above and anything added later, and it makes the report reconcile by
 * construction rather than by having remembered every source of movement.
 *
 * A reversal is deliberately not residual. `invoice_revert` carries the
 * invoice's own id, so the subquery excludes it — correct, because the reversal
 * and the original journal cancel in the ledger while the reverted invoice
 * drops out of the document walk as a draft. Counting it here would subtract it
 * a second time.
 */

export type AgingAdjustment = {
  contactId: string | null;
  contactName: string;
  /**
   * Base-currency minor units, positive when it reduces what is owed — a
   * credit to the receivable, or a debit to the payable.
   */
  amountMinor: number;
};

export type AgingReconciliation = {
  /** Net debit on 1100 Accounts Receivable. Positive: customers owe us. */
  receivableControlMinor: number;
  /** Net credit on 2000 Accounts Payable. Positive: we owe suppliers. */
  payableControlMinor: number;
  /** Receivable movement with no invoice behind it, by customer. */
  receivableAdjustments: AgingAdjustment[];
  /** Payable movement with no bill behind it, by supplier. */
  payableAdjustments: AgingAdjustment[];
  missingReceivableAccount: boolean;
  missingPayableAccount: boolean;
};

const RECEIVABLE_CODE = "1100";
const PAYABLE_CODE = "2000";

type ResidualRow = { contact_id: string | null; amount: bigint };

export async function computeAgingReconciliation(
  prisma: DbOrTx,
  organizationId: string
): Promise<AgingReconciliation> {
  /* general_ledger_entries is the posted-journal view every other report reads,
     so these figures cannot drift from the trial balance. Draft journals are
     already excluded there, which is what we want: an unposted document owes
     nothing. */
  const [balances, receivableResiduals, payableResiduals, receivableAccount, payableAccount] =
    await Promise.all([
      prisma.$queryRaw<Array<{ account_code: string; net: bigint }>>`
        select account_code, coalesce(sum(debit_minor - credit_minor), 0)::bigint as net
        from general_ledger_entries
        where org_id = ${organizationId}::uuid
          and account_code in (${RECEIVABLE_CODE}, ${PAYABLE_CODE})
        group by account_code
      `,
      /* Credited to the receivable, so positive means the customer owes less. */
      prisma.$queryRaw<ResidualRow[]>`
        select g.contact_id,
               coalesce(sum(g.credit_minor - g.debit_minor), 0)::bigint as amount
        from general_ledger_entries g
        where g.org_id = ${organizationId}::uuid
          and g.account_code = ${RECEIVABLE_CODE}
          and (
            g.source_id is null
            or not exists (select 1 from invoices i where i.id = g.source_id)
          )
        group by g.contact_id
        having coalesce(sum(g.credit_minor - g.debit_minor), 0) <> 0
      `,
      /* Debited to the payable, so positive means we owe the supplier less. */
      prisma.$queryRaw<ResidualRow[]>`
        select g.contact_id,
               coalesce(sum(g.debit_minor - g.credit_minor), 0)::bigint as amount
        from general_ledger_entries g
        where g.org_id = ${organizationId}::uuid
          and g.account_code = ${PAYABLE_CODE}
          and (
            g.source_id is null
            or not exists (select 1 from bills b where b.id = g.source_id)
          )
        group by g.contact_id
        having coalesce(sum(g.debit_minor - g.credit_minor), 0) <> 0
      `,
      /* Both control accounts exist in every seeded chart, and a workspace that
         has raised nothing simply has no entries against them — a zero balance,
         not a missing account. Only an account absent from the chart is worth
         reporting, because then the check is comparing against nothing. */
      prisma.chartAccount.findFirst({
        where: { organizationId, code: RECEIVABLE_CODE },
        select: { id: true },
      }),
      prisma.chartAccount.findFirst({
        where: { organizationId, code: PAYABLE_CODE },
        select: { id: true },
      }),
    ]);

  const contactIds = [
    ...new Set(
      [...receivableResiduals, ...payableResiduals]
        .map((row) => row.contact_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { organizationId, id: { in: contactIds } },
        select: { id: true, ...CONTACT_NAME_SELECT },
      })
    : [];
  const nameById = new Map(contacts.map((contact) => [contact.id, contactDisplayName(contact)]));

  /* A journal line can carry no contact — a manual adjustment to the control
     account, or a bank receipt reconciled before anyone was attached to it. It
     still belongs on the report, because it is still part of what the ledger
     says is owed. */
  const toAdjustment = (row: ResidualRow): AgingAdjustment => ({
    contactId: row.contact_id,
    contactName: row.contact_id
      ? nameById.get(row.contact_id) ?? "Unknown contact"
      : "Unallocated",
    amountMinor: Number(row.amount),
  });

  const byCode = new Map(balances.map((row) => [row.account_code, Number(row.net)]));

  return {
    // A receivable is a debit balance and a payable a credit one, so the
    // payable is negated to make both read as "amount outstanding".
    receivableControlMinor: byCode.get(RECEIVABLE_CODE) ?? 0,
    payableControlMinor: -(byCode.get(PAYABLE_CODE) ?? 0),
    receivableAdjustments: receivableResiduals.map(toAdjustment),
    payableAdjustments: payableResiduals.map(toAdjustment),
    missingReceivableAccount: !receivableAccount,
    missingPayableAccount: !payableAccount,
  };
}
