import type { CSSProperties } from "react";
import { formatMoney } from "@/lib/currency";
import { formatPeriodRange } from "@/lib/accounting/billing-period";
import { invoiceLineColumnLabel, type InvoiceTemplateConfig } from "./invoice-template-config";
import styles from "./invoice-print-document.module.css";

export type PrintableInvoiceLine = {
  id?: string;
  accountId?: string | null;
  description?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  accountReportCategory?: string | null;
  /** Per-line location, entered on the invoice form. */
  location?: string | null;
  quantity?: string | number | null;
  unitPriceMinor?: number | null;
  amountMinor?: number | null;
  discountMinor?: number | null;
  subtotalMinor?: number | null;
  taxRate?: number | null;
  taxCode?: string | null;
  taxMinor?: number | null;
  totalMinor?: number | null;
};

export type PrintableInvoice = {
  id: string;
  contactId?: string | null;
  invoiceNo?: string | null;
  status?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  /** Optional service/billing period the invoice covers (ISO yyyy-mm-dd). */
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  currency?: string | null;
  contactName?: string | null;
  contactRegistrationNumber?: string | null;
  billingAddress?: string | null;
  paymentTermsDays?: number | null;
  poNumber?: string | null;
  reference?: string | null;
  amountsAre?: string | null;
  exchangeRate?: number | null;
  subtotalMinor?: number | null;
  discountMinor?: number | null;
  taxMinor?: number | null;
  totalMinor?: number | null;
  amountPaidMinor?: number | null;
  payments?: Array<{
    accountCode?: string | null;
    accountName?: string | null;
    amountMinor: number;
    paidAt: string;
  }>;
  attachments?: Array<{
    id?: string;
    filename: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    storagePath?: string | null;
  }>;
  lines?: PrintableInvoiceLine[];
  organization?: {
    name?: string | null;
    dateFormat?: string | null;
    vatRegistrationNo?: string | null;
    companyNumber?: string | null;
  } | null;
};

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toString" in value) return numberValue(String(value));
  return 0;
}

function formatDate(value: string | null | undefined, format: string | null | undefined) {
  if (!value) return "—";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  if (format === "DD/MM/YYYY") return `${day}/${month}/${year}`;
  if (format === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  return `${year}-${month}-${day}`;
}

function formatQuantity(value: PrintableInvoiceLine["quantity"]) {
  const quantity = numberValue(value ?? 1);
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function statusLabel(status: string | null | undefined) {
  if (!status) return "Invoice";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * "15 Aug – 11 Sep 2026" for the service period the invoice covers. Returns
 * null unless both dates are present and well-formed, so a partial range
 * renders nothing rather than a dangling dash.
 */
function formatServicePeriod(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  try {
    return formatPeriodRange(start, end);
  } catch {
    return null;
  }
}

type PrintableLineDetail = "reference" | "category" | "location";

export type InvoicePreviewHighlight =
  | "address"
  | "vat"
  | "registration"
  | "notes"
  | "payment"
  /** Every other field on the settings form lights its own part of the preview;
   *  this one was added without one, so editing it changed the page silently. */
  | "preparedBy"
  /** The line table, so the column switches have something to point at. */
  | "lines"
  /** The stamp & signature block, for the fields on the settings card. */
  | "signature"
  | null;

function detailValue(line: PrintableInvoiceLine, detail: PrintableLineDetail) {
  if (detail === "reference") return line.accountCode || "—";
  if (detail === "category") return line.accountName || line.accountReportCategory || "—";
  // Was hardcoded to a dash. The column has existed on the document and in the
  // schema for a while, and the invoice form now captures it — so every printed
  // document showed "—" for a location the customer had actually been given.
  if (detail === "location") return line.location || "—";
  return "";
}

export function InvoicePrintDocument({
  invoice,
  config,
  documentLabel = "Invoice",
  displayMode = "print",
  previewHighlight = null,
}: {
  invoice: PrintableInvoice;
  config: InvoiceTemplateConfig;
  documentLabel?: string;
  displayMode?: "print" | "preview" | "preview-large";
  previewHighlight?: InvoicePreviewHighlight;
}) {
  const currency = invoice.currency || "GBP"; // currency:allow last-resort default; every stored document carries its own currency
  const money = (value: unknown) => formatMoney(numberValue(value), currency);
  const dateFormat = invoice.organization?.dateFormat || "YYYY-MM-DD";
  const servicePeriodLabel = formatServicePeriod(
    invoice.servicePeriodStart,
    invoice.servicePeriodEnd,
  );
  const allLines = invoice.lines ?? [];
  const shippingLines = allLines.filter(
    (line) => line.description?.trim().toLowerCase() === "shipping",
  );
  const lineItems = allLines.filter(
    (line) => line.description?.trim().toLowerCase() !== "shipping",
  );
  const shippingMinor = shippingLines.reduce(
    (sum, line) => sum + numberValue(line.totalMinor ?? line.subtotalMinor),
    0,
  );
  const shippingSubtotal = shippingLines.reduce(
    (sum, line) => sum + numberValue(line.subtotalMinor),
    0,
  );
  const subtotalMinor = Math.max(0, numberValue(invoice.subtotalMinor) - shippingSubtotal);
  /*
   * The line table's columns, from the config's column set.
   *
   * `parseInvoiceTemplateConfig` has already folded the older `lineDetail`,
   * `showLineDate` and `showUnitPrice` toggles into `columns`, so this is the
   * single answer for both visibility and headings — a record saved before
   * `columns` existed still arrives here rendering as it always did.
   */
  const lineColumns = config.columns;
  const columnLabel = (id: Parameters<typeof invoiceLineColumnLabel>[1]) =>
    invoiceLineColumnLabel(lineColumns, id);
  const selectedLineDetails: PrintableLineDetail[] = (
    ["reference", "category", "location"] as PrintableLineDetail[]
  ).filter((detail) => lineColumns[detail].show);
  const title = documentLabel.toUpperCase();
  /*
   * Bills are received, not issued.
   *
   * A handful of things on this document only make sense in one direction, and
   * rather than fork the component they are switched on this. Reading the label
   * keeps it to one place; the alternative was a prop every caller had to
   * remember to pass.
   */
  const isBill = documentLabel.toLowerCase() === "bill";
  const vatRegistrationNo = invoice.organization?.vatRegistrationNo || config.vatNumber;
  const companyNumber = invoice.organization?.companyNumber || config.regNumber;
  const paymentDetails = [
    config.bankName && ["Bank", config.bankName],
    config.sortCode && ["Sort code", config.sortCode],
    config.accountNumber && ["Account", config.accountNumber],
    config.iban && ["IBAN", config.iban],
    config.bic && ["BIC", config.bic],
  ].filter(Boolean) as string[][];
  /*
   * Terms, one per line, with blank lines kept as spacing.
   *
   * These used to be filtered out entirely, so a blank line typed to separate
   * two groups of terms simply vanished on the page — the author saw paragraphs
   * in the box and a solid block in the preview. A blank line now marks a gap
   * above the term that follows it rather than becoming an empty numbered item,
   * which is what filtering was avoiding in the first place.
   *
   * Leading blanks are ignored: a gap above the first term is padding, not
   * separation, and the card already has its own.
   */
  const terms: Array<{ text: string; gapBefore: boolean }> = [];
  let pendingGap = false;
  for (const raw of config.notes.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (terms.length) pendingGap = true;
      continue;
    }
    terms.push({ text: line, gapBefore: pendingGap });
    pendingGap = false;
  }

  /*
   * A stamp or signature only exists on the page when there is an image to
   * show and its toggle is on. Both off — or nothing uploaded, which is every
   * record saved before these fields existed — and the section is not
   * rendered at all: no empty slot, no caption over nothing.
   */
  const showStamp = config.showStamp && Boolean(config.stampUrl);
  const showSignature = config.showSignature && Boolean(config.signatureUrl);

  const amountDueMinor = Math.max(
    0,
    numberValue(invoice.totalMinor) - numberValue(invoice.amountPaidMinor),
  );
  const rootStyle = {
    "--invoice-accent": config.brandColor,
    "--invoice-secondary": config.secondaryColor,
    "--invoice-tertiary": config.tertiaryColor,
    "--invoice-text": config.textColor,
  } as CSSProperties;

  return (
    <article
      className={`${styles.document} ${styles[config.theme]} ${styles[config.font]} ${styles[config.paperSize]} ${displayMode === "preview" ? styles.preview : ""} ${displayMode === "preview-large" ? styles.previewLarge : ""}`}
      style={rootStyle}
      data-invoice-template={config.theme}
      /* On the root rather than the header, because moving the logo also moves
         what sits opposite it — one attribute lets the stylesheet arrange the
         whole letterhead, and it does so for all six templates at once instead
         of six near-identical overrides. */
      data-logo-position={config.logoPosition}
      /* Same mechanism as the logo: the stylesheet reads one attribute and
         places the stamp & signature block for all six templates at once. */
      data-signature-position={config.signaturePosition}
    >
      <header
        className={`${styles.letterhead} ${config.theme === "bold" ? styles.boldLetterhead : ""}`}
      >
        <div className={styles.companyIdentity}>
          {config.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.logo}
              src={config.logo}
              alt={`${invoice.organization?.name || "Company"} logo`}
            />
          ) : (
            <span className={styles.logoFallback}>
              {/* Whatever was set in settings, falling back to the first two
                  characters of the workspace name — which is a poor initialism
                  for anything longer than one word, hence the field. */}
              {config.logoInitials || (invoice.organization?.name || "Co").slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <h1>{invoice.organization?.name || "Your company"}</h1>
            {config.companyAddress ? (
              <p
                className={`${styles.multiline} ${previewHighlight === "address" ? styles.previewHighlight : ""}`}
              >
                {config.companyAddress}
              </p>
            ) : null}
            <p
              className={`${styles.identityNumbers} ${previewHighlight === "vat" || previewHighlight === "registration" ? styles.previewHighlight : ""}`}
            >
              {vatRegistrationNo ? `VAT Reg: ${vatRegistrationNo}` : ""}
              {vatRegistrationNo && companyNumber ? " · " : ""}
              {companyNumber ? `Company No: ${companyNumber}` : ""}
            </p>
          </div>
        </div>
        <div className={styles.documentTitle}>
          <h2>{title}</h2>
          <span className={styles.status}>{statusLabel(invoice.status)}</span>
          <p>
            No: <strong>{invoice.invoiceNo || invoice.id}</strong>
          </p>
          <p>
            Date: <strong>{formatDate(invoice.issueDate, dateFormat)}</strong>
          </p>
          {invoice.dueDate ? (
            <p>
              Due: <strong>{formatDate(invoice.dueDate, dateFormat)}</strong>
            </p>
          ) : null}
          {servicePeriodLabel ? (
            <p>
              Service period: <strong>{servicePeriodLabel}</strong>
            </p>
          ) : null}
        </div>
      </header>

      <section className={styles.summaryMetrics} aria-label="Invoice summary">
        <div className={styles.metricPrimary}>
          <span>Total due</span>
          <strong>{money(amountDueMinor)}</strong>
          <small>{currency}</small>
        </div>
        <div className={styles.metricSecondary}>
          <span>Subtotal</span>
          <strong>{money(subtotalMinor)}</strong>
          <small>{lineItems.length} line {lineItems.length === 1 ? "item" : "items"}</small>
        </div>
        <div className={styles.metricDark}>
          <span>VAT</span>
          <strong>{money(invoice.taxMinor)}</strong>
          <small>{config.showTax ? "Included" : "Hidden"}</small>
        </div>
        <div className={styles.metricStatus}>
          <span>Status</span>
          <strong>{statusLabel(invoice.status)}</strong>
          <small>{amountDueMinor ? "Payment due" : "Settled"}</small>
        </div>
      </section>

      <section className={styles.boldFacts} aria-label="Key invoice facts">
        <div>
          <span>Bill to</span>
          <strong>{invoice.contactName || "Customer"}</strong>
        </div>
        <div>
          <span>Invoice no.</span>
          <strong>{invoice.invoiceNo || invoice.id}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>{formatDate(invoice.issueDate, dateFormat)}</strong>
        </div>
        <div>
          <span>Due date</span>
          <strong>{formatDate(invoice.dueDate, dateFormat)}</strong>
        </div>
        <div>
          <span>Currency</span>
          <strong>{currency}</strong>
        </div>
      </section>

      <section className={styles.partyGrid}>
        <div className={styles.partyCard}>
          {/* A bill comes from a supplier; everything else goes to a customer.
              Same card, and the label has to follow the direction or the
              document names the wrong party. */}
          <p className={styles.sectionLabel}>{isBill ? "Supplier" : "Bill to"}</p>
          <strong>{invoice.contactName || (isBill ? "Supplier" : "Customer")}</strong>
          {invoice.billingAddress ? (
            <p className={styles.multiline}>{invoice.billingAddress}</p>
          ) : null}
          {!isBill && config.showCustomerRegNumber && invoice.contactRegistrationNumber ? (
            <p>Reg. No.: {invoice.contactRegistrationNumber}</p>
          ) : null}
        </div>
        {/* Only when somebody has been named.
            It used to fall back to the organisation's own name, which reads as
            nonsense — a document prepared by the company that issued it says
            nothing. On a bill it is worse than nothing: the document was
            prepared by the supplier, so printing your own name under it is
            simply wrong. Blank now means the card is not shown, and the
            reference moves to the card beside it so it is not lost with it. */}
        {config.preparedBy ? (
          <div
            className={`${styles.partyCard} ${previewHighlight === "preparedBy" ? styles.previewHighlight : ""}`}
          >
            <p className={styles.sectionLabel}>Prepared by</p>
            <strong>{config.preparedBy}</strong>
            {invoice.reference ? <p>Reference: {invoice.reference}</p> : null}
          </div>
        ) : null}
        <div className={styles.partyCard}>
          <p className={styles.sectionLabel}>Payment terms</p>
          <strong>
            {invoice.paymentTermsDays != null
              ? `Net ${invoice.paymentTermsDays} Days`
              : "Due on receipt"}
          </strong>
        </div>
      </section>

      <dl className={styles.detailStrip}>
        {invoice.poNumber ? (
          <div>
            <dt>PO number</dt>
            <dd>{invoice.poNumber}</dd>
          </div>
        ) : null}
        {invoice.reference ? (
          <div>
            <dt>Reference no.</dt>
            <dd>{invoice.reference}</dd>
          </div>
        ) : null}
        <div>
          <dt>Currency</dt>
          <dd>{currency}</dd>
        </div>
      </dl>

      <section className={`${styles.itemsSection} ${previewHighlight === "lines" ? styles.previewHighlight : ""}`}>
        <h3>Line items</h3>
        <table
          className={`${styles.itemsTable} ${selectedLineDetails.length === 3 ? styles.allDetails : ""}`}
        >
          <thead>
            <tr>
              <th className={styles.indexColumn}>#</th>
              {lineColumns.date.show ? (
                <th className={styles.dateColumn}>{columnLabel("date")}</th>
              ) : null}
              <th>{columnLabel("description")}</th>
              {selectedLineDetails.map((detail) => (
                <th key={detail} className={styles.detailColumn}>
                  {columnLabel(detail)}
                </th>
              ))}
              {lineColumns.quantity.show ? (
                <th className={styles.quantityColumn}>{columnLabel("quantity")}</th>
              ) : null}
              {lineColumns.unitPrice.show ? (
                <th className={styles.moneyColumn}>{columnLabel("unitPrice")}</th>
              ) : null}
              <th className={styles.moneyColumn}>{columnLabel("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line, index) => (
              <tr key={line.id || `${index}-${line.description || "line"}`}>
                <td>{index + 1}</td>
                {lineColumns.date.show ? (
                  <td>{formatDate(invoice.issueDate, dateFormat)}</td>
                ) : null}
                <td>{line.description || "Invoice item"}</td>
                {selectedLineDetails.map((detail) => (
                  <td key={detail}>{detailValue(line, detail)}</td>
                ))}
                {lineColumns.quantity.show ? (
                  <td className={styles.number}>{formatQuantity(line.quantity)}</td>
                ) : null}
                {lineColumns.unitPrice.show ? (
                  <td className={styles.number}>
                    {money(line.unitPriceMinor ?? line.amountMinor)}
                  </td>
                ) : null}
                <td className={styles.number}>
                  {money(line.totalMinor ?? line.subtotalMinor ?? line.amountMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.termsAndTotals}>
        <div
          className={`${styles.termsCard} ${previewHighlight === "notes" ? styles.previewHighlight : ""}`}
        >
          {/* A bill carries the supplier's terms, not yours — what this box
              holds on one is your own filing notes, so it says so. */}
          <p className={styles.sectionLabel}>{isBill ? "Internal notes" : "Terms & conditions"}</p>
          <ol>
            {terms.map((term, index) => (
              <li
                key={`${term.text}-${index}`}
                className={term.gapBefore ? styles.termGap : undefined}
              >
                {term.text}
              </li>
            ))}
          </ol>
        </div>
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(subtotalMinor)}</dd>
          </div>
          {config.showShipping && shippingMinor ? (
            <div>
              <dt>Shipping &amp; delivery</dt>
              <dd>{money(shippingMinor)}</dd>
            </div>
          ) : null}
          {config.showTax ? (
            <div>
              <dt>VAT</dt>
              <dd>{money(invoice.taxMinor)}</dd>
            </div>
          ) : null}
          {numberValue(invoice.discountMinor) ? (
            <div>
              <dt>Discount</dt>
              <dd>({money(invoice.discountMinor)})</dd>
            </div>
          ) : null}
          <div className={styles.totalDue}>
            <dt>Total Due ({currency})</dt>
            <dd>{money(invoice.totalMinor)}</dd>
          </div>
        </dl>
      </section>

      {config.footer || paymentDetails.length || config.contactEmail || config.contactPhone ? (
        <section
          className={`${styles.paymentInstructions} ${previewHighlight === "payment" ? styles.previewHighlight : ""}`}
        >
          {/* Likewise: nobody pays you from a bill, so the block below it is a
              footer on an internal record rather than instructions to anyone. */}
          <h3>{isBill ? "Record footer" : "Payment instructions"}</h3>
          {config.footer ? <p className={styles.multiline}>{config.footer}</p> : null}
          {/* One row per detail, labels in their own column.
              These used to run together on a single line separated by pipes,
              which is how a paragraph reads and not how a bank account does —
              somebody copying a sort code had to find it inside a sentence. Laid
              out in a grid, the values line up under each other and can be read
              off the page the way the terms beside them can. */}
          {paymentDetails.length ? (
            <dl className={styles.paymentRows}>
              {paymentDetails.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {config.contactEmail || config.contactPhone ? (
            <p>
              For billing enquiries, contact{" "}
              <strong>
                {[config.contactEmail, config.contactPhone].filter(Boolean).join(" or ")}
              </strong>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Not on a bill: the stamp and signature are the issuer's mark of
          approval, and on a bill the issuer is the supplier — stamping your
          own record with your own signature asserts something nobody did. */}
      {!isBill && (showStamp || showSignature) ? (
        <section
          className={`${styles.signatureBlock} ${previewHighlight === "signature" ? styles.previewHighlight : ""}`}
          aria-label="Stamp and signature"
        >
          {showStamp ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.stampImage}
              src={config.stampUrl ?? undefined}
              alt={`${invoice.organization?.name || "Company"} stamp`}
            />
          ) : null}
          {showSignature ? (
            <div className={styles.signatureArea}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.signatureImage}
                src={config.signatureUrl ?? undefined}
                alt="Signature"
              />
              <div className={styles.signatureRule}>
                {config.signatureName ? <strong>{config.signatureName}</strong> : null}
                <span>Signed for {invoice.organization?.name || "the company"}</span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className={styles.footer}>
        <span>{invoice.organization?.name || "Your company"} — Confidential</span>
        <span>This document is intended solely for the named recipient.</span>
        <span>Page 1 of 1</span>
      </footer>
    </article>
  );
}
