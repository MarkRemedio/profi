import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { formatMoney } from "@/lib/currency";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import { listInvoices, type InvoiceWithLines } from "@/lib/accounting/documents";
import { accountingToday } from "@/lib/accounting/accounting-today";

/**
 * The customer-facing copy of an invoice.
 *
 * This is the only route that serves a document to somebody outside the
 * workspace, and it is reachable solely by a token that a person in the
 * business deliberately minted. There is no id-addressable public route any
 * more: /print/invoice/[id] is now scoped to the signed-in organisation.
 *
 * `runAsSystem` is used on purpose and is safe here — the caller is anonymous
 * by design, so there is no session to scope by, and the token itself is the
 * authorisation. It is looked up as the *only* filter, so a token can never
 * reach a document it was not minted for.
 */
export const dynamic = "force-dynamic";

function ukDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A malformed token is a miss, not a crash: uuid columns reject anything that
  // is not a uuid, and this route takes whatever is in the URL bar.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return notFound();
  }

  const row = await runAsSystem(async () =>
    prisma.invoice.findFirst({
      where: { shareToken: token },
      select: {
        id: true,
        status: true,
        organizationId: true,
        billingAddress: true,
        contact: { select: CONTACT_NAME_SELECT },
        organization: { select: { name: true } },
      },
    })
  );

  if (!row) return notFound();

  // A void invoice is not something anybody should be paying against, so the
  // link stops working the moment it is voided rather than needing revoking.
  if (row.status === "VOID") return notFound();
  // Drafts are not documents yet. A token cannot normally be minted for one,
  // but an invoice can be reverted to draft after it was shared.
  if (row.status === "DRAFT") return notFound();

  // Read through the same loader the workspace uses, so the customer sees
  // exactly the figures the business does. Payments are journal-derived and
  // reconverted into the document's currency by logic that is fiddly enough
  // (a penny of rounding on a weak currency makes a settled invoice look a
  // penny short) that a second implementation here would drift.
  const invoice = await runAsSystem(async () => {
    const all = (await listInvoices(prisma, row.organizationId)) as InvoiceWithLines[];
    return all.find((entry) => entry.id === row.id) ?? null;
  });

  if (!invoice) return notFound();

  const currency = invoice.currency;
  const money = (minor: number) => formatMoney(minor, currency);

  const amountDue = invoice.totalMinor - invoice.amountPaidMinor;

  const today = accountingToday();
  const isOverdue = Boolean(invoice.dueDate) && invoice.dueDate! < today && amountDue > 0;

  const customerName = row.contact ? contactDisplayName(row.contact) : invoice.contactName;
  const orgName = row.organization?.name || "";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
        <header className="border-b border-slate-100 px-6 py-6 sm:px-8">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
            {orgName}
          </p>
          <h1 className="m-0 mt-2 text-2xl font-black tracking-tight text-slate-900">
            Invoice {invoice.invoiceNo}
          </h1>
          <p className="m-0 mt-1 text-sm text-slate-500">
            Issued {ukDate(invoice.issueDate)}
            {invoice.dueDate ? ` · Due ${ukDate(invoice.dueDate)}` : ""}
          </p>
        </header>

        <section className="px-6 py-5 sm:px-8">
          <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Billed to
          </p>
          <p className="m-0 mt-1 text-sm font-bold text-slate-800">{customerName}</p>
          {row.billingAddress ? (
            <p className="m-0 mt-1 whitespace-pre-line text-sm text-slate-500">
              {row.billingAddress}
            </p>
          ) : null}
        </section>

        <section className="px-6 sm:px-8">
          <div
            className={`rounded-xl border px-5 py-4 ${
              isOverdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`m-0 text-[11px] font-bold uppercase tracking-wider ${
                isOverdue ? "text-red-700" : "text-slate-500"
              }`}
            >
              Amount due
            </p>
            <p
              className={`m-0 mt-1 text-3xl font-black tabular-nums ${
                isOverdue ? "text-red-700" : "text-slate-900"
              }`}
            >
              {money(amountDue)}
            </p>
            {isOverdue ? (
              <p className="m-0 mt-1 text-xs font-bold text-red-700">This invoice is overdue.</p>
            ) : null}
          </div>
        </section>

        <section className="px-6 py-6 sm:px-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-2 text-left">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2.5 pr-3 text-slate-700">{line.description || "—"}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-500">
                    {String(line.quantity ?? "")}
                  </td>
                  <td className="py-2.5 text-right font-mono font-medium tabular-nums text-slate-900">
                    {money(line.subtotalMinor ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mt-4 w-full border-t-2 border-slate-900 pt-2 text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-slate-600">Subtotal</td>
                <td className="py-1 text-right font-mono tabular-nums">
                  {money(invoice.subtotalMinor)}
                </td>
              </tr>
              {Number(invoice.discountMinor) > 0 ? (
                <tr>
                  <td className="py-1 text-slate-600">Discount</td>
                  <td className="py-1 text-right font-mono tabular-nums">
                    − {money(invoice.discountMinor)}
                  </td>
                </tr>
              ) : null}
              {Number(invoice.taxMinor) > 0 ? (
                <tr>
                  <td className="py-1 text-slate-600">VAT</td>
                  <td className="py-1 text-right font-mono tabular-nums">
                    {money(invoice.taxMinor)}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td className="py-2 text-base font-black text-slate-900">Total</td>
                <td className="py-2 text-right font-mono text-base font-black tabular-nums text-slate-900">
                  {money(invoice.totalMinor)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="border-t border-slate-100 bg-slate-50 px-6 py-4 sm:px-8">
          <p className="m-0 text-xs text-slate-500">
            Sent by {orgName}. Contact them directly if anything here looks wrong.
          </p>
        </footer>
      </div>
    </main>
  );
}
