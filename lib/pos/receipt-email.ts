import "server-only";

import { formatMoney } from "@/lib/currency";

export type ReceiptEmailInput = {
  businessName: string;
  receiptNo: string;
  soldAt: Date;
  currency: string;
  customerName: string | null;
  paymentMethod: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: Array<{ name: string; quantity: number; unitPriceMinor: number }>;
};

/** Escaped so a product called `Tom & Jerry's <b>` cannot break the markup. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The receipt a customer receives by email.
 *
 * Table-based with inline styles throughout, because email clients strip
 * stylesheets and most still do not lay out flexbox or grid. Rendered from the
 * sale as stored, so what is sent is what was rung up.
 */
export function posReceiptHtml(input: ReceiptEmailInput): string {
  const money = (minor: number) => escape(formatMoney(minor, input.currency));

  const rows = input.lines
    .map(
      (line) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;">
            ${escape(line.name)}
            <span style="color:#94a3b8;">&times;${line.quantity}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;color:#0f172a;font-size:14px;white-space:nowrap;">
            ${money(line.unitPriceMinor * line.quantity)}
          </td>
        </tr>`
    )
    .join("");

  const totalRow = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:6px 0;color:${bold ? "#0f172a" : "#64748b"};font-size:${bold ? "16px" : "14px"};font-weight:${bold ? "800" : "500"};">
        ${escape(label)}
      </td>
      <td style="padding:6px 0;text-align:right;color:#0f172a;font-size:${bold ? "16px" : "14px"};font-weight:${bold ? "800" : "600"};white-space:nowrap;">
        ${value}
      </td>
    </tr>`;

  const soldAt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(input.soldAt);

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f8fafc;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:32px;">

    <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #e2e8f0;">
      <div style="color:#0f172a;font-size:18px;font-weight:800;letter-spacing:-0.3px;">
        ${escape(input.businessName)}
      </div>
      <div style="color:#64748b;font-size:13px;margin-top:6px;">Receipt ${escape(input.receiptNo)}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escape(soldAt)}</div>
    </div>

    ${
      input.customerName
        ? `<p style="color:#0f172a;font-size:14px;margin:20px 0 0;">Hello ${escape(input.customerName)},</p>`
        : ""
    }
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:12px 0 20px;">
      Thank you for your purchase. Here is your receipt.
    </p>

    <table style="width:100%;border-collapse:collapse;">
      <tbody>${rows}</tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;">
      <tbody>
        ${totalRow("Subtotal", money(input.subtotalMinor))}
        ${input.discountMinor > 0 ? totalRow("Discount", `-${money(input.discountMinor)}`) : ""}
        ${input.taxMinor > 0 ? totalRow("VAT", money(input.taxMinor)) : ""}
        ${totalRow("Total", money(input.totalMinor), true)}
      </tbody>
    </table>

    <p style="color:#94a3b8;font-size:12px;margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;">
      Paid by ${escape(input.paymentMethod)}.
    </p>
  </div>
</div>`;
}
