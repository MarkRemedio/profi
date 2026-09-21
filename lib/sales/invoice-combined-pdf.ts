import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

import { formatMoney } from "@/lib/currency";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

export type CombinedPdfLine = {
  description?: string | null;
  quantity?: string | number | null;
  unitPriceMinor?: number | null;
  taxRate?: number | null;
  subtotalMinor?: number | null;
  totalMinor?: number | null;
};

export type CombinedPdfInvoice = {
  id: string;
  invoiceNo?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  currency?: string | null;
  contactName?: string | null;
  contactRegistrationNumber?: string | null;
  billingAddress?: string | null;
  reference?: string | null;
  poNumber?: string | null;
  subtotalMinor?: number | null;
  discountMinor?: number | null;
  taxMinor?: number | null;
  totalMinor?: number | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  lines?: CombinedPdfLine[];
};

export type CombinedPdfTemplate = {
  brandColor?: string | null;
  companyAddress?: string | null;
  bankName?: string | null;
  sortCode?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  bic?: string | null;
  notes?: string | null;
};

export type CombinedPdfAttachment = {
  filename: string;
  contentType?: string | null;
  bytes: Uint8Array;
};

export type CombinedPdfLogo = {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg";
};

export type ComposeCombinedInvoicePdfInput = {
  organizationName: string;
  invoice: CombinedPdfInvoice;
  template?: CombinedPdfTemplate | null;
  logo?: CombinedPdfLogo | null;
  attachments?: CombinedPdfAttachment[];
};

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function colorFromHex(value: string | null | undefined) {
  const match = value?.match(/^#([0-9a-f]{6})$/i);
  if (!match) return rgb(0.145, 0.388, 0.922);
  const hex = match[1];
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = safeText(text).split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
  }

  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    width: number;
    size: number;
    font: PDFFont;
    color?: ReturnType<typeof rgb>;
    lineHeight?: number;
  },
) {
  const lineHeight = options.lineHeight ?? options.size + 3;
  const lines = wrapText(text, options.font, options.size, options.width);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * lineHeight,
      size: options.size,
      font: options.font,
      color: options.color ?? rgb(0.15, 0.18, 0.24),
    });
  });
  return options.y - lines.length * lineHeight;
}

function money(minor: number | null | undefined, currency: string | null | undefined) {
  // Use the application's canonical formatter, but append the currency code
  // instead of a symbol because pdf-lib's standard font cannot encode every
  // supported currency glyph.
  return `${safeText(formatMoney(minor, currency, { hideSymbol: true }))} ${safeText(currency || "GBP")}`; // currency:allow last-resort default; the caller always passes the document currency
}

function dateLabel(value: string | null | undefined) {
  return value ? safeText(value.slice(0, 10)) : "-";
}

function contentKind(attachment: CombinedPdfAttachment): "pdf" | "png" | "jpg" | "other" {
  const type = attachment.contentType?.toLowerCase() ?? "";
  const name = attachment.filename.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === "image/png" || name.endsWith(".png")) return "png";
  if (type === "image/jpeg" || type === "image/jpg" || /\.jpe?g$/.test(name)) return "jpg";
  return "other";
}

function addNotePage(
  pdf: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  filename: string,
  message: string,
) {
  const page = pdf.addPage(A4);
  page.drawText("Attachment", {
    x: MARGIN,
    y: 760,
    size: 20,
    font: bold,
    color: rgb(0.1, 0.16, 0.26),
  });
  drawWrapped(page, filename, {
    x: MARGIN,
    y: 716,
    width: A4[0] - MARGIN * 2,
    size: 12,
    font: bold,
  });
  drawWrapped(page, message, {
    x: MARGIN,
    y: 680,
    width: A4[0] - MARGIN * 2,
    size: 11,
    font: regular,
  });
}

async function embedLogo(
  pdf: PDFDocument,
  logo: CombinedPdfLogo | null | undefined,
): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    return logo.contentType === "image/png"
      ? await pdf.embedPng(logo.bytes)
      : await pdf.embedJpg(logo.bytes);
  } catch {
    return null;
  }
}

export async function composeCombinedInvoicePdf(
  input: ComposeCombinedInvoicePdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = colorFromHex(input.template?.brandColor);
  const logo = await embedLogo(pdf, input.logo);
  const invoicePages: PDFPage[] = [];
  const invoice = input.invoice;
  const currency = invoice.currency || "GBP"; // currency:allow last-resort default; every stored document carries its own currency

  const addInvoicePage = (continuation = false) => {
    const page = pdf.addPage(A4);
    invoicePages.push(page);
    page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: accent });

    let titleX = MARGIN;
    if (!continuation && logo) {
      const scale = Math.min(64 / logo.width, 42 / logo.height, 1);
      page.drawImage(logo, {
        x: MARGIN,
        y: A4[1] - 72,
        width: logo.width * scale,
        height: logo.height * scale,
      });
      titleX += logo.width * scale + 14;
    }

    page.drawText(safeText(input.organizationName || "Your company"), {
      x: titleX,
      y: A4[1] - 51,
      size: 17,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(continuation ? "INVOICE - CONTINUED" : "INVOICE", {
      x: continuation ? 395 : 448,
      y: A4[1] - 51,
      size: continuation ? 10 : 15,
      font: bold,
      color: rgb(1, 1, 1),
    });
    return page;
  };

  let page = addInvoicePage();
  page.drawText("Bill to", { x: MARGIN, y: 714, size: 9, font: bold, color: accent });
  page.drawText(safeText(invoice.contactName || "Customer"), {
    x: MARGIN,
    y: 694,
    size: 13,
    font: bold,
  });
  let partyY = 677;
  if (invoice.billingAddress) {
    partyY = drawWrapped(page, invoice.billingAddress, {
      x: MARGIN,
      y: partyY,
      width: 250,
      size: 9,
      font: regular,
    });
  }
  if (invoice.contactRegistrationNumber) {
    page.drawText(`Reg. No.: ${safeText(invoice.contactRegistrationNumber)}`, {
      x: MARGIN,
      y: partyY - 2,
      size: 9,
      font: regular,
    });
  }

  const metadata = [
    ["Invoice no.", invoice.invoiceNo || invoice.id],
    ["Issue date", dateLabel(invoice.issueDate)],
    ["Due date", dateLabel(invoice.dueDate)],
    invoice.reference ? ["Reference", invoice.reference] : null,
    invoice.poNumber ? ["PO number", invoice.poNumber] : null,
    invoice.servicePeriodStart || invoice.servicePeriodEnd
      ? [
          "Service period",
          `${dateLabel(invoice.servicePeriodStart)} - ${dateLabel(invoice.servicePeriodEnd)}`,
        ]
      : null,
  ].filter(Boolean) as string[][];
  metadata.forEach(([label, value], index) => {
    const y = 714 - index * 20;
    page.drawText(label, { x: 358, y, size: 8, font: regular, color: rgb(0.4, 0.44, 0.5) });
    page.drawText(safeText(value), { x: 438, y, size: 9, font: bold });
  });

  let y = 590;
  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 5,
      width: A4[0] - MARGIN * 2,
      height: 24,
      color: rgb(0.94, 0.96, 0.98),
    });
    const headings = [
      ["Description", MARGIN],
      ["Qty", 316],
      ["Unit price", 354],
      ["Tax", 432],
      ["Amount", 474],
    ] as const;
    headings.forEach(([label, x]) =>
      page.drawText(label, { x, y: y + 3, size: 8, font: bold, color: rgb(0.22, 0.27, 0.34) }),
    );
    y -= 24;
  };
  drawTableHeader();

  for (const line of invoice.lines ?? []) {
    const descriptionLines = wrapText(line.description || "Invoice item", regular, 8.5, 245);
    const rowHeight = Math.max(22, descriptionLines.length * 11 + 8);
    if (y - rowHeight < 190) {
      page = addInvoicePage(true);
      y = 690;
      drawTableHeader();
    }

    descriptionLines.forEach((text, index) => {
      page.drawText(text, { x: MARGIN, y: y - index * 11, size: 8.5, font: regular });
    });
    page.drawText(safeText(line.quantity ?? 1), { x: 316, y, size: 8.5, font: regular });
    page.drawText(money(line.unitPriceMinor, currency), { x: 354, y, size: 7.5, font: regular });
    page.drawText(line.taxRate == null ? "-" : `${safeText(line.taxRate)}%`, {
      x: 432,
      y,
      size: 8,
      font: regular,
    });
    page.drawText(money(line.totalMinor ?? line.subtotalMinor, currency), {
      x: 474,
      y,
      size: 7.5,
      font: bold,
    });
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight + 7 },
      end: { x: A4[0] - MARGIN, y: y - rowHeight + 7 },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93),
    });
    y -= rowHeight;
  }

  if (y < 220) {
    page = addInvoicePage(true);
    y = 690;
  }

  const totals = [
    ["Subtotal", invoice.subtotalMinor],
    ...(Number(invoice.discountMinor ?? 0) > 0
      ? [["Discount", -Number(invoice.discountMinor)]]
      : []),
    ["Tax", invoice.taxMinor],
    ["Total", invoice.totalMinor],
  ] as Array<[string, number | null | undefined]>;
  totals.forEach(([label, value], index) => {
    const totalY = y - index * 21;
    page.drawText(label, {
      x: 365,
      y: totalY,
      size: label === "Total" ? 11 : 9,
      font: label === "Total" ? bold : regular,
    });
    page.drawText(money(value, currency), {
      x: 447,
      y: totalY,
      size: label === "Total" ? 10 : 8,
      font: label === "Total" ? bold : regular,
    });
  });

  const template = input.template ?? {};
  const paymentDetails = [
    template.bankName && `Bank: ${template.bankName}`,
    template.sortCode && `Sort code: ${template.sortCode}`,
    template.accountNumber && `Account: ${template.accountNumber}`,
    template.iban && `IBAN: ${template.iban}`,
    template.bic && `BIC: ${template.bic}`,
  ].filter(Boolean) as string[];
  if (paymentDetails.length || template.companyAddress || template.notes) {
    page.drawText("Payment and issuer details", {
      x: MARGIN,
      y: y,
      size: 10,
      font: bold,
      color: accent,
    });
    const details = [template.companyAddress, ...paymentDetails, template.notes]
      .filter(Boolean)
      .join("\n");
    drawWrapped(page, details, {
      x: MARGIN,
      y: y - 18,
      width: 275,
      size: 8.5,
      font: regular,
      lineHeight: 11,
    });
  }

  invoicePages.forEach((invoicePage, index) => {
    invoicePage.drawText(`Invoice page ${index + 1} of ${invoicePages.length}`, {
      x: 455,
      y: 24,
      size: 7.5,
      font: regular,
      color: rgb(0.45, 0.48, 0.54),
    });
  });

  for (const attachment of input.attachments ?? []) {
    const kind = contentKind(attachment);
    if (kind === "other") {
      addNotePage(
        pdf,
        regular,
        bold,
        attachment.filename,
        "This attachment type is provided separately and could not be embedded in the combined PDF.",
      );
      continue;
    }

    try {
      if (kind === "pdf") {
        const source = await PDFDocument.load(attachment.bytes);
        const sourcePages = source.getPageIndices();
        if (sourcePages.length === 0) throw new Error("Attachment PDF has no pages.");
        const copiedPages = await pdf.copyPages(source, sourcePages);
        copiedPages.forEach((copiedPage) => pdf.addPage(copiedPage));
        continue;
      }

      const image =
        kind === "png"
          ? await pdf.embedPng(attachment.bytes)
          : await pdf.embedJpg(attachment.bytes);
      const imagePage = pdf.addPage(A4);
      const availableWidth = A4[0] - MARGIN * 2;
      const availableHeight = A4[1] - MARGIN * 2;
      const scale = Math.min(availableWidth / image.width, availableHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      imagePage.drawImage(image, {
        x: (A4[0] - width) / 2,
        y: (A4[1] - height) / 2,
        width,
        height,
      });
    } catch {
      addNotePage(
        pdf,
        regular,
        bold,
        attachment.filename,
        "This attachment could not be embedded. It may be corrupt, encrypted, or use an unsupported encoding; it is provided separately.",
      );
    }
  }

  return pdf.save();
}
