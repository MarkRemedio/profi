"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { fetchExchangeRate } from "@/lib/accounting/exchange-rates";

export type DocumentRateResult =
  | {
      ok: true;
      /** Units of the workspace currency per 1 unit of the document currency. */
      rate: number;
      /** The date the rate was published for — may predate the requested date. */
      rateDate: string;
      baseCurrency: string;
      /** True when the requested date was a weekend or holiday. */
      rolledBack: boolean;
    }
  | { ok: false; baseCurrency: string; reason: string };

/**
 * Look up the rate for a document being drafted.
 *
 * Never throws. The published rate is a convenience: the user can always type
 * one, and a free service with no SLA must not stand between someone and
 * raising an invoice. A failure returns a reason the form can show beside a
 * still-editable rate field.
 */
export async function getDocumentExchangeRate(
  documentCurrency: string,
  issueDate: string
): Promise<DocumentRateResult> {
  const workspace = await requireAccountingWorkspace();

  const org = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { baseCurrency: true },
  });
  const baseCurrency = org?.baseCurrency ?? "GBP"; // currency:allow last-resort default

  if (documentCurrency === baseCurrency) {
    return { ok: true, rate: 1, rateDate: issueDate, baseCurrency, rolledBack: false };
  }

  const parsed = new Date(`${issueDate}T00:00:00`);
  const onDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const looked = await fetchExchangeRate(documentCurrency, baseCurrency, onDate);
  if (!looked) {
    return {
      ok: false,
      baseCurrency,
      reason: `No published rate for ${documentCurrency} to ${baseCurrency} on ${issueDate}. Enter one manually.`,
    };
  }

  return {
    ok: true,
    rate: looked.rate,
    rateDate: looked.rateDate,
    baseCurrency,
    // Central banks do not publish at weekends, so an answer for an earlier
    // date is expected rather than an error — but the user should see which
    // day's rate they are actually using.
    rolledBack: looked.rateDate !== issueDate,
  };
}
