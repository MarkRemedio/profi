/**
 * Emails sent from the aged receivables and aged payables reports.
 *
 * Both used to be theatre: clicking "Email Statement Reminder" set a key in a
 * local state object and raised a toast reading "logged on screen", and nothing
 * left the browser. A customer never heard from you, and the badge saying a
 * reminder had been sent disappeared on refresh.
 *
 * The markup lives here, away from the server action, so the figures that go
 * out can be tested without a mail server.
 */

export type AgingEmailBucket = {
  label: string;
  amount: string;
};

export type AgingEmailItem = {
  reference: string;
  issueDate: string;
  dueDate: string;
  amount: string;
  /** Blank when the item is not yet due. */
  overdue: string;
};

export type AgingEmailInput = {
  /** The business sending the email. */
  orgName: string;
  /** The customer or supplier being written to. */
  recipientName: string;
  /** Already formatted by the caller, which owns the workspace date format. */
  asOfDate: string;
  totalOutstanding: string;
  buckets: AgingEmailBucket[];
  items: AgingEmailItem[];
  /** Optional closing line, e.g. bank details or a contact address. */
  note?: string;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Customer and supplier names are user data going into a message sent outside
 * the business, so they are escaped rather than trusted.
 */
export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const WRAPPER_OPEN = `<div style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">`;

const WRAPPER_CLOSE = `  </table>
</div>`;

function bucketRows(buckets: AgingEmailBucket[]): string {
  return buckets
    .map(
      (bucket) => `<tr>
        <td style="padding:6px 0;font-size:13px;color:#475569;">${escapeHtml(bucket.label)}</td>
        <td align="right" style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;">${escapeHtml(bucket.amount)}</td>
      </tr>`
    )
    .join("");
}

function itemRows(items: AgingEmailItem[]): string {
  if (items.length === 0) {
    return `<tr><td colspan="4" style="padding:16px 0;font-size:13px;color:#64748b;font-style:italic;">No individual items to list.</td></tr>`;
  }

  return items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(item.reference)}</td>
        <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;white-space:nowrap;">${escapeHtml(item.issueDate)}</td>
        <td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:12px;color:${item.overdue ? "#b91c1c" : "#64748b"};white-space:nowrap;">${escapeHtml(item.overdue || item.dueDate)}</td>
        <td align="right" style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">${escapeHtml(item.amount)}</td>
      </tr>`
    )
    .join("");
}

function body(input: AgingEmailInput, opts: { intro: string; itemsHeading: string; accent: string }): string {
  const { orgName, recipientName, asOfDate, totalOutstanding, buckets, items, note } = input;

  return `${WRAPPER_OPEN}
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${opts.accent};">${escapeHtml(orgName)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#475569;">As at ${escapeHtml(asOfDate)}</p>
      </td>
    </tr>

    <tr>
      <td style="padding:24px 28px 8px;">
        <p style="margin:0 0 12px;font-size:15px;">Hello ${escapeHtml(recipientName)},</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(opts.intro)}</p>
      </td>
    </tr>

    <tr>
      <td style="padding:16px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Total outstanding</p>
              <p style="margin:4px 0 14px;font-size:26px;font-weight:800;color:#0f172a;">${escapeHtml(totalOutstanding)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #e2e8f0;">
                ${bucketRows(buckets)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:8px 28px 24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">${escapeHtml(opts.itemsHeading)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${itemRows(items)}
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(
          note ?? `Sent by ${orgName}. Reply to this email if any of the above looks wrong.`
        )}</p>
      </td>
    </tr>
${WRAPPER_CLOSE}`;
}

/** A collection reminder: what this customer owes you, and how overdue it is. */
export function arStatementEmailHtml(input: AgingEmailInput): string {
  return body(input, {
    accent: "#1d4ed8",
    intro: `Here is a summary of the invoices currently outstanding on your account. If payment has already been sent, please ignore this message.`,
    itemsHeading: "Outstanding invoices",
  });
}

/** A remittance summary: what you owe this supplier, and when it falls due. */
export function apRemittanceEmailHtml(input: AgingEmailInput): string {
  return body(input, {
    accent: "#7c3aed",
    intro: `Here is a summary of the bills we currently have open on your account, so you can check it against your own records.`,
    itemsHeading: "Open bills",
  });
}

export function arStatementSubject(orgName: string, total: string): string {
  return `Statement of account from ${orgName} — ${total} outstanding`;
}

export function apRemittanceSubject(orgName: string, total: string): string {
  return `Account summary from ${orgName} — ${total} open`;
}
