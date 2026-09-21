/**
 * CSV column mapping for bank statement imports. Pure and client-safe —
 * shared by the server-side parser and the import modal, so the user can
 * remap columns and re-derive the preview without another server round trip.
 * Output amounts are in MINOR units (pennies).
 */

export type ParsedTransaction = {
  date: string; // YYYY-MM-DD
  description: string;
  debit: number; // pennies (money OUT)
  credit: number; // pennies (money IN)
  /**
   * Running balance after this row, in pennies, when the statement prints one.
   * Used by the reconciliation gate as a fallback check; not persisted.
   */
  balance?: number | null;
};

export type ColumnRole = "date" | "description" | "debit" | "credit" | "amount" | "ignore";

/** One role per CSV column, by index. */
export type ColumnMapping = ColumnRole[];

export type RawCsvTable = {
  headers: string[];
  rows: string[][];
};

export type SkippedStatementRow = {
  reason:
    | "unparseable_date"
    | "blank_continuation"
    | "zero_movement";
  rawDate: string;
  rawCells: string[];
};

export type ApplyMappingResult = {
  transactions: ParsedTransaction[];
  skippedRows: SkippedStatementRow[];
};

function cleanCellText(raw: string): string {
  return raw.trim().replace(/[*_`]/g, "").replace(/\s+/g, " ");
}

export function parseAmount(raw: string): number {
  if (!raw) return 0;
  let cleaned = raw
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[*_`]/g, "")
    // Every supported currency's symbol, not just the three sterling-area ones:
    // a peso statement previously kept its "₱" and parsed as zero throughout.
    // "TSh" is stripped as a word since the shilling has no single-character sign.
    .replace(/TSh/gi, "")
    .replace(/[£$€₱,\s]/g, ""); // currency:allow strips symbols from input, does not render one
  if (cleaned === "" || cleaned === "-") return 0;

  // Accounting negatives: "(1234.56)", trailing-minus "1234.56-" and
  // debit suffixes "1234.56 DR". Credit suffixes are positive.
  let negative = false;
  if (/^\((.*)\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  } else if (cleaned.endsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(0, -1);
  }
  const suffix = /(CR|DR)$/i.exec(cleaned);
  if (suffix) {
    negative = suffix[1].toUpperCase() === "DR";
    cleaned = cleaned.slice(0, -suffix[1].length);
  }

  const value = Number(cleaned);
  if (Number.isNaN(value)) return 0;
  return Math.round((negative ? -value : value) * 100);
}

/**
 * Statement period, used to resolve dates that omit the year ("07 Mar").
 * Both bounds are ISO YYYY-MM-DD.
 */
export type DateContext = { periodStart: string; periodEnd: string };

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function monthNumber(raw: string): string | undefined {
  return MONTHS[raw.replace(/[.,]/g, "").slice(0, 3).toLowerCase()];
}

/**
 * Pick the year that places `month`/`day` inside the statement period.
 * A period spanning a year boundary (Dec→Jan) has exactly one candidate that
 * fits; a period inside one calendar year has two identical candidates. A date
 * that fits neither lies outside the stated period and is rejected — the
 * resulting row-count shortfall surfaces through the reconciliation gate rather
 * than silently landing on a guessed year.
 */
function resolveYear(month: string, day: string, ctx: DateContext): string | null {
  for (const year of [ctx.periodStart.slice(0, 4), ctx.periodEnd.slice(0, 4)]) {
    const iso = `${year}-${month}-${day}`;
    if (iso >= ctx.periodStart && iso <= ctx.periodEnd) return iso;
  }
  return null;
}

export function parseDate(raw: string, ctx?: DateContext): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  // Try ISO first.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // d/m/Y, d-m-Y, d.m.y (UK day-first).
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    const [, d, m] = dmy;
    let y = dmy[3];
    if (y.length === 2) y = `20${y}`;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${y}-${month}-${day}`;
    }
  }

  // "11 May 2026" / "1st January 2026" / "31 Mar 25" / "31 Mar, 25".
  const text = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+[.,]?)\s*,?\s*(\d{2,4})$/i.exec(s);
  if (text) {
    const mm = monthNumber(text[2]);
    if (mm) {
      const year = text[3].length === 2 ? `20${text[3]}` : text[3];
      return `${year}-${mm}-${text[1].padStart(2, "0")}`;
    }
  }

  // Year-less forms, resolvable only against a statement period. UK bank
  // statements routinely omit the year ("07 Mar", "07/03") because the period
  // is printed once in the header.
  if (ctx) {
    // "07 Mar" / "7 March" / "1st Apr"
    const dm = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+[.,]?)$/i.exec(s);
    if (dm) {
      const mm = monthNumber(dm[2]);
      if (mm) return resolveYear(mm, dm[1].padStart(2, "0"), ctx);
    }
    // "Mar 07" / "March 7"
    const md = /^([A-Za-z]+[.,]?)\s+(\d{1,2})(?:st|nd|rd|th)?$/i.exec(s);
    if (md) {
      const mm = monthNumber(md[1]);
      if (mm) return resolveYear(mm, md[2].padStart(2, "0"), ctx);
    }
    // "07/03" / "07-03" / "07.03" — day-first, matching the d/m/Y branch above.
    const dmNumeric = /^(\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
    if (dmNumeric) {
      const month = dmNumeric[2].padStart(2, "0");
      const day = dmNumeric[1].padStart(2, "0");
      if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
        return resolveYear(month, day, ctx);
      }
    }
  }
  return null;
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Match on word boundaries, not raw substrings. A naked `includes("in")`
 * matches "Vending" and "Closing Balance", which silently mapped a balance
 * column as money-in.
 */
function findColumn(headers: string[], keywords: string[]): number {
  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const idx = headers.findIndex((h) => re.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Header-keyword auto-detection — same heuristics the parser always used. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const dateCol = findColumn(lower, ["date"]);
  const descCol = findColumn(lower, ["description", "narrative", "memo", "details", "particulars"]);
  const debitCol = findColumn(lower, ["debit", "withdrawals", "out", "payment out", "spent"]);
  const creditCol = findColumn(lower, ["credit", "deposits", "in", "payment in", "received"]);
  const amountCol = debitCol < 0 && creditCol < 0 ? findColumn(lower, ["amount"]) : -1;

  return headers.map((_, i) => {
    if (i === dateCol) return "date";
    if (i === descCol) return "description";
    if (i === debitCol) return "debit";
    if (i === creditCol) return "credit";
    if (i === amountCol) return "amount";
    return "ignore";
  });
}

export type ApplyMappingOptions = {
  /** Statement period, enabling year-less dates ("07 Mar"). */
  dateContext?: DateContext;
  /**
   * Carry the previous row's date onto rows with an empty date cell. Bank
   * statements group same-day transactions and print the date only on the
   * first line; without this the continuation lines are dropped.
   */
  fillDown?: boolean;
  /** Column holding the running balance, captured for the reconciliation gate. */
  balanceColumn?: number;
  /** Drop rows that parse but carry no debit/credit movement. PDF ledgers use this for markers. */
  skipZeroMovement?: boolean;
};

/** Apply a column mapping to a raw CSV table. Rows without a parseable date are skipped. */
export function applyMapping(
  table: RawCsvTable,
  mapping: ColumnMapping,
  options: ApplyMappingOptions = {}
): ParsedTransaction[] {
  return applyMappingDetailed(table, mapping, options).transactions;
}

/** Apply a column mapping and report rows that were skipped instead of dropping them invisibly. */
export function applyMappingDetailed(
  table: RawCsvTable,
  mapping: ColumnMapping,
  options: ApplyMappingOptions = {}
): ApplyMappingResult {
  const roleIndex = (role: ColumnRole) => mapping.findIndex((r) => r === role);
  const dateCol = roleIndex("date");
  const descCol = roleIndex("description");
  const debitCol = roleIndex("debit");
  const creditCol = roleIndex("credit");
  const amountCol = roleIndex("amount");

  const out: ParsedTransaction[] = [];
  const skippedRows: SkippedStatementRow[] = [];
  let lastDate: string | null = null;

  for (const cells of table.rows) {
    const rawDate = dateCol >= 0 ? (cells[dateCol] ?? "").trim() : "";
    let date = rawDate ? parseDate(rawDate, options.dateContext) : null;

    if (date) {
      lastDate = date;
    } else if (options.fillDown && rawDate === "" && lastDate) {
      // Only inherit when the cell is genuinely blank. An unparseable date is a
      // signal (a totals row, a page header) and must not adopt the row above.
      const hasMovement =
        parseAmount(debitCol >= 0 ? cells[debitCol] ?? "" : "") !== 0 ||
        parseAmount(creditCol >= 0 ? cells[creditCol] ?? "" : "") !== 0 ||
        parseAmount(amountCol >= 0 ? cells[amountCol] ?? "" : "") !== 0;
      if (!hasMovement) {
        skippedRows.push({ reason: "blank_continuation", rawDate, rawCells: cells });
        continue;
      }
      date = lastDate;
    }
    if (!date) {
      skippedRows.push({ reason: "unparseable_date", rawDate, rawCells: cells });
      continue;
    }

    const description = descCol >= 0 ? cleanCellText(cells[descCol] ?? "") : "Unknown";

    let debit = 0;
    let credit = 0;
    if (amountCol >= 0 && debitCol < 0 && creditCol < 0) {
      const amount = parseAmount(cells[amountCol] ?? "0");
      debit = amount < 0 ? Math.abs(amount) : 0;
      credit = amount > 0 ? amount : 0;
    } else {
      debit = parseAmount(debitCol >= 0 ? cells[debitCol] ?? "0" : "0");
      credit = parseAmount(creditCol >= 0 ? cells[creditCol] ?? "0" : "0");
    }

    // Separate debit/credit columns are magnitudes; a minus sign in one of them
    // is a presentation quirk, not a direction reversal.
    if (amountCol < 0 || debitCol >= 0 || creditCol >= 0) {
      debit = Math.abs(debit);
      credit = Math.abs(credit);
    }

    if (options.skipZeroMovement && debit === 0 && credit === 0) {
      skippedRows.push({ reason: "zero_movement", rawDate, rawCells: cells });
      continue;
    }

    const tx: ParsedTransaction = { date, description: description || "Unknown", debit, credit };

    // Only carried when a balance column was actually requested, so the common
    // CSV shape stays a plain four-field row.
    const balanceCol = options.balanceColumn;
    if (balanceCol !== undefined && balanceCol >= 0) {
      const balanceRaw = (cells[balanceCol] ?? "").trim();
      tx.balance = balanceRaw === "" ? null : parseAmount(balanceRaw);
    }

    out.push(tx);
  }
  return { transactions: out, skippedRows };
}

export function parseCsvTable(bytes: Uint8Array | ArrayBuffer | string): RawCsvTable {
  let text: string;
  if (typeof bytes === "string") {
    text = bytes;
  } else {
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    text = new TextDecoder("utf-8").decode(arr);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  return {
    headers: splitCsvLine(lines[0]).map((h) => h.trim()),
    rows: lines.slice(1).map(splitCsvLine),
  };
}
