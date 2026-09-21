/**
 * Mistral OCR for bank statements (server-only).
 *
 * This module does one thing: turn a PDF into per-page markdown and pull out
 * the pipe-tables Mistral reconstructs. Deciding what those tables MEAN is
 * ./statement-analysis; executing that decision is ./statement-plan.
 *
 * OCR-to-markdown is used rather than document annotation because it carries no
 * document page limit.
 */
import "server-only";

import type { RawCsvTable } from "@/lib/banking/column-mapping";

const OCR_MODEL = process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest";

/** True when the Mistral OCR path is available (API key configured). */
export function isMistralOcrConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

// ── markdown table extraction ────────────────────────────────────────

function isTableRow(line: string): boolean {
  return line.includes("|");
}

// A GitHub-flavoured markdown separator row: cells made only of -, :, spaces.
function isSeparatorRow(line: string): boolean {
  const cells = splitMarkdownRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")));
}

function splitMarkdownRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  // Split on unescaped pipes.
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") { cur += "|"; i++; }
    else if (ch === "|") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** Pull every pipe-table (header + separator + body rows) out of a markdown doc. */
export function extractMarkdownTables(markdown: string): RawCsvTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: RawCsvTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitMarkdownRow(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
        rows.push(splitMarkdownRow(lines[i]));
        i++;
      }
      tables.push({ headers, rows });
    } else {
      i++;
    }
  }
  return tables;
}

/** Fallback table extractor for OCR markdown when pipe '|' characters are absent. */
export function extractTextTables(markdown: string): RawCsvTable[] {
  const lines = markdown.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tables: RawCsvTable[] = [];

  const dateRegex = /^(\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{2,4})?|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+)$/i;

  let currentHeaders: string[] | null = null;
  let currentRows: string[][] = [];

  for (const line of lines) {
    if (/^Date\s+Description/i.test(line)) {
      if (currentRows.length > 0) {
        tables.push({
          headers: currentHeaders ?? ["Date", "Description", "Type", "In", "Out"],
          rows: currentRows,
        });
        currentRows = [];
      }
      currentHeaders = ["Date", "Description", "Type", "In", "Out"];
      continue;
    }

    const match = dateRegex.exec(line);
    if (!match) continue;

    const datePart = match[1];
    const rest = match[2];
    const tokens = rest.split(/\s+/);
    if (tokens.length < 2) continue;

    let debit = "";
    let credit = "";
    let type = "";
    const descParts = [...tokens];

    const lastToken = tokens[tokens.length - 1];
    if (/^-?[\d,]+\.\d{2}$/.test(lastToken)) {
      descParts.pop();
      const secondLastToken = descParts[descParts.length - 1];

      if (secondLastToken && /^[A-Z]{2,4}$/.test(secondLastToken)) {
        type = secondLastToken;
        descParts.pop();
      }

      if (["BGC", "FPI", "DEP", "BACS"].includes(type)) {
        credit = lastToken;
      } else if (["DEB", "DD", "CPT", "FEE", "PAY", "SO"].includes(type)) {
        debit = lastToken;
      } else {
        if (lastToken.startsWith("-")) {
          debit = lastToken.replace("-", "");
        } else {
          debit = lastToken;
        }
      }

      const description = descParts.join(" ");
      if (description) {
        currentRows.push([datePart, description, type, credit, debit]);
      }
    }
  }

  if (currentRows.length > 0) {
    tables.push({
      headers: currentHeaders ?? ["Date", "Description", "Type", "In", "Out"],
      rows: currentRows,
    });
  }

  return tables;
}

function extractOcrTables(pages: Array<{ tables?: Array<{ content?: string | null; format?: string | null }> }>): RawCsvTable[] {
  return pages.flatMap((page) =>
    (page.tables ?? []).flatMap((table) => {
      const content = table.content ?? "";
      return table.format === "markdown" && content.trim()
        ? extractMarkdownTables(content)
        : [];
    })
  );
}

// ── OCR call ─────────────────────────────────────────────────────────

export type OcrResult = {
  markdown: string;
  tables: RawCsvTable[];
  pageCount: number;
  pageMarkdowns: string[];
};

/**
 * Run a PDF through Mistral OCR. Throws if the API key is missing or the call
 * fails; the orchestrator turns that into a typed OcrUnavailable failure.
 */
export async function ocrPdf(
  bytes: Buffer | Uint8Array,
  filename: string
): Promise<OcrResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set.");

  const { Mistral } = await import("@mistralai/mistralai");
  const client = new Mistral({ apiKey });

  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:application/pdf;base64,${base64}`;

  const res = await client.ocr.process({
    model: OCR_MODEL,
    tableFormat: "markdown",
    document: { type: "document_url", documentUrl: dataUrl, documentName: filename },
  });

  const pages = res.pages ?? [];
  const pageMarkdowns = pages.map((p) => p.markdown ?? "");
  const markdown = pageMarkdowns.join("\n\n");
  let tables = extractOcrTables(pages);
  if (tables.length === 0) {
    tables = extractMarkdownTables(markdown);
  }
  if (tables.length === 0) {
    tables = extractTextTables(markdown);
  }
  return { markdown, tables, pageCount: pages.length, pageMarkdowns };
}
