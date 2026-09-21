/**
 * The invoice email.
 *
 * The three places an invoice could be emailed from all stopped short of it:
 * the bulk action raised "Email feature coming soon", the row menu had no email
 * item at all, and "Approve & mark sent" set the status to sent and admitted
 * "(Emailing is not wired up yet.)" — so an invoice could be marked as sent to
 * a customer who had never been told about it.
 *
 * Figures are stated in the *document's* currency, not the workspace's. This is
 * a request for payment: the customer pays the amount on the invoice they were
 * issued, whatever the books convert it to internally.
 */

export type InvoiceEmailLine = {
  description: string;
  quantity: string;
  amount: string;
};

export type InvoiceEmailInput = {
  orgName: string;
  customerName: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string | null;
  /** e.g. "Due in 29 days", "14 days overdue", or "" when there is no due date. */
  dueLabel: string;
  isOverdue: boolean;
  lines: InvoiceEmailLine[];
  subtotal: string;
  discount: string | null;
  tax: string | null;
  total: string;
  /** Set only when something has already been paid against this invoice. */
  amountPaid: string | null;
  amountDue: string;
  reference: string | null;
  poNumber: string | null;
  /** Optional link to the printable copy. */
  viewUrl?: string | null;
  /**
   * `invoice` is the document itself; `reminder` is a chase for one already
   * sent. Same figures either way — only the framing differs, because sending
   * "Please find your invoice below" for the third time reads as a system that
   * has lost track rather than one that is chasing.
   */
  variant?: InvoiceEmailVariant;
};

export type InvoiceEmailVariant = "invoice" | "reminder" | "pre_due";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Line descriptions and customer names are user data going to a third party. */
export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function lineRows(lines: InvoiceEmailLine[]): string {
  if (lines.length === 0) {
    return `<tr><td colspan="3" style="padding:12px 0;font-size:13px;color:#64748b;font-style:italic;">No line items.</td></tr>`;
  }
  return lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${escapeHtml(line.description)}</td>
        <td align="right" style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;white-space:nowrap;">${escapeHtml(line.quantity)}</td>
        <td align="right" style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;">${escapeHtml(line.amount)}</td>
      </tr>`,
    )
    .join("");
}

function totalRow(label: string, value: string, opts: { strong?: boolean } = {}): string {
  const weight = opts.strong ? "700" : "400";
  const size = opts.strong ? "15px" : "13px";
  return `<tr>
    <td style="padding:4px 0;font-size:${size};font-weight:${weight};color:${opts.strong ? "#0f172a" : "#475569"};">${escapeHtml(label)}</td>
    <td align="right" style="padding:4px 0;font-size:${size};font-weight:${opts.strong ? "800" : "600"};color:#0f172a;white-space:nowrap;">${escapeHtml(value)}</td>
  </tr>`;
}

export function invoiceEmailHtml(input: InvoiceEmailInput): string {
  const {
    orgName,
    customerName,
    invoiceNo,
    issueDate,
    dueDate,
    dueLabel,
    isOverdue,
    lines,
    subtotal,
    discount,
    tax,
    total,
    amountPaid,
    amountDue,
    reference,
    poNumber,
    viewUrl,
    variant = "invoice",
  } = input;

  const heading =
    variant === "pre_due"
      ? `Upcoming: invoice ${invoiceNo}`
      : variant === "reminder"
        ? `Reminder: invoice ${invoiceNo}`
        : `Invoice ${invoiceNo}`;
  const intro =
    variant === "pre_due"
      ? "A friendly heads-up that this invoice is due in three days. No action is needed if payment is already arranged."
      : variant === "reminder"
        ? isOverdue
          ? "This invoice is now past its due date. If payment has already been sent, please ignore this message."
          : "A friendly reminder that this invoice is still open. If payment has already been sent, please ignore this message."
        : "Please find your invoice below.";

  const meta = [
    `Issued ${issueDate}`,
    dueDate ? `Due ${dueDate}` : null,
    poNumber ? `PO ${poNumber}` : null,
    reference ? `Ref ${reference}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">${escapeHtml(orgName)}</p>
        <p style="margin:8px 0 0;font-size:22px;font-weight:800;">${escapeHtml(heading)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${escapeHtml(meta)}</p>
      </td>
    </tr>

    <tr>
      <td style="padding:22px 28px 6px;">
        <p style="margin:0 0 12px;font-size:15px;">Hello ${escapeHtml(customerName)},</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(intro)}</p>
      </td>
    </tr>

    <tr>
      <td style="padding:16px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${isOverdue ? "#fef2f2" : "#f8fafc"};border:1px solid ${isOverdue ? "#fecaca" : "#e2e8f0"};border-radius:10px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${isOverdue ? "#b91c1c" : "#64748b"};">Amount due</p>
              <p style="margin:4px 0 0;font-size:26px;font-weight:800;color:${isOverdue ? "#b91c1c" : "#0f172a"};">${escapeHtml(amountDue)}</p>
              ${dueLabel ? `<p style="margin:4px 0 0;font-size:12px;font-weight:600;color:${isOverdue ? "#b91c1c" : "#64748b"};">${escapeHtml(dueLabel)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:8px 28px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding-bottom:4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Description</td>
            <td align="right" style="padding-bottom:4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Qty</td>
            <td align="right" style="padding-bottom:4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Amount</td>
          </tr>
          ${lineRows(lines)}
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:16px 28px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:2px solid #0f172a;padding-top:8px;">
          ${totalRow("Subtotal", subtotal)}
          ${discount ? totalRow("Discount", discount) : ""}
          ${tax ? totalRow("VAT", tax) : ""}
          ${totalRow("Total", total, { strong: true })}
          ${amountPaid ? totalRow("Paid", amountPaid) : ""}
          ${amountPaid ? totalRow("Amount due", amountDue, { strong: true }) : ""}
        </table>
      </td>
    </tr>

    ${
      viewUrl
        ? `<tr>
      <td align="center" style="padding:0 28px 24px;">
        <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;">View invoice</a>
      </td>
    </tr>`
        : ""
    }

    <tr>
      <td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Sent by ${escapeHtml(orgName)}. Reply to this email if anything looks wrong.</p>
      </td>
    </tr>
  </table>
</div>`;
}

export function invoiceEmailSubject(
  orgName: string,
  invoiceNo: string,
  total: string,
  variant: InvoiceEmailVariant = "invoice",
): string {
  return variant === "pre_due"
    ? `Upcoming: invoice ${invoiceNo} from ${orgName} — ${total} due`
    : variant === "reminder"
      ? `Reminder: invoice ${invoiceNo} from ${orgName} — ${total} due`
      : `Invoice ${invoiceNo} from ${orgName} — ${total}`;
}
