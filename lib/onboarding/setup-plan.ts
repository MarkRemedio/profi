import "server-only";

import OpenAI from "openai";

/**
 * The first-week plan, written from what the client said they want to fix.
 *
 * Deliberately not the workspace assistant in `lib/ai-assistant/`. That one is
 * scoped to an organisation, reads live ledger data through tools, and cites
 * what it found — none of which exists during signup. There is no workspace
 * yet, no accounts, no transactions. This is a much smaller thing: take a few
 * answers and turn them into a plan for a workspace that is about to exist.
 *
 * Two rules shape everything here.
 *
 * It must never block signup. The step it runs from is one screen before the
 * card form, so a slow or unavailable model cannot be allowed to stall the
 * funnel — every failure path returns the deterministic plan below rather than
 * an error, and the caller treats a plan as a bonus rather than a result.
 *
 * It must never promise what the product cannot do. The model is given the
 * actual feature set and told to plan inside it; a plan that opens with
 * "connect your Stripe payouts" when that does not exist is worse than no plan.
 */

export type SetupPlanStep = {
  title: string;
  detail: string;
  /** Where in the product this happens, e.g. "Sales → Customers". */
  where: string;
};

export type SetupPlan = {
  headline: string;
  summary: string;
  steps: SetupPlanStep[];
  /** True when this came from the fallback rather than the model. */
  generated: boolean;
};

export type SetupPlanInput = {
  businessName: string;
  businessStructure: string;
  focusAreas: string[];
  booksToday: string;
  notes: string;
  vatRegistered: boolean;
  currency: string;
};

/** What the product can actually do, so the plan stays inside it. */
const FEATURES = [
  "Sales: customers, quotes, invoices, credit notes, statements, payment reminders",
  "Purchases: suppliers, bills, expense claims, approval rules",
  "Banking: connected feeds, statement import, transaction matching, AI categorisation",
  "Accounting: chart of accounts, manual journals, period close",
  "Taxes: VAT returns, CIS, corporation tax, self-employment",
  "Reports: profit and loss, balance sheet, aged receivables and payables",
];

const FOCUS_LABELS: Record<string, string> = {
  invoices: "getting invoices out quickly",
  chasing: "chasing overdue payments",
  accuracy: "keeping the books accurate and audit-ready",
  profit: "understanding real profitability",
  expenses: "tracking bills and expenses",
  time: "spending less time on bookkeeping",
};

const BOOKS_LABELS: Record<string, string> = {
  new: "nothing yet — a brand new business",
  sheets: "spreadsheets",
  paper: "paper and receipts",
  xero: "Xero",
  quickbooks: "QuickBooks",
  sage: "Sage",
  freeagent: "FreeAgent",
  accountant: "their accountant handles it",
  other: "another system",
};

/**
 * The plan used when the model is unavailable, slow, or returns nonsense.
 *
 * Not a placeholder or an apology — a real, correct plan assembled from the
 * same answers. Somebody who hits this should get something useful and never
 * learn that anything went wrong, because from their side nothing did.
 */
export function fallbackSetupPlan(input: SetupPlanInput): SetupPlan {
  const steps: SetupPlanStep[] = [];
  const has = (area: string) => input.focusAreas.includes(area);
  const migrating = !["new", "accountant"].includes(input.booksToday);

  if (migrating) {
    steps.push({
      title: "Bring last year's closing figures across",
      detail: `Import your chart of accounts and recent bank statements from ${BOOKS_LABELS[input.booksToday] ?? "your current system"}, so the numbers start from where you left off.`,
      where: "Accounting → Chart of Accounts",
    });
  }

  if (has("invoices") || input.focusAreas.length === 0) {
    steps.push({
      title: "Send your first invoice",
      detail: "Add a customer, raise the invoice, and email it straight from the workspace. Your branding is already applied.",
      where: "Sales → Customers",
    });
  }

  if (has("chasing")) {
    steps.push({
      title: "Turn on payment reminders",
      detail: "Set the reminder schedule once and overdue invoices chase themselves. Aged receivables shows who is behind.",
      where: "Sales → Invoices",
    });
  }

  if (has("expenses")) {
    steps.push({
      title: "Record your first bill",
      detail: "Enter a supplier bill or an expense claim so what goes out is tracked alongside what comes in.",
      where: "Purchases → Bills",
    });
  }

  steps.push({
    title: "Connect your bank",
    detail: "A live feed means transactions arrive on their own and match themselves against invoices and bills.",
    where: "Banking → Accounts",
  });

  if (has("accuracy") || input.vatRegistered) {
    steps.push({
      title: input.vatRegistered ? "Check your first VAT period" : "Review your chart of accounts",
      detail: input.vatRegistered
        ? "Confirm the VAT scheme and dates are right before the period closes, so the first return needs no unpicking."
        : "Make sure the account names match how you think about the business. Renaming them now is free.",
      where: input.vatRegistered ? "Taxes → VAT" : "Accounting → Chart of Accounts",
    });
  }

  if (has("profit")) {
    steps.push({
      title: "Read your profit and loss",
      detail: "Once a few weeks of transactions are in, the P&L shows what the business earns rather than what it banks.",
      where: "Reports → Profit and Loss",
    });
  }

  return {
    headline: `Your first week, ${input.businessName || "set up"}`,
    summary: "A short route from an empty workspace to books you can rely on, built from what you told us matters.",
    steps: steps.slice(0, 6),
    generated: false,
  };
}

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  /* One retry and a short timeout: this runs one screen before checkout, and a
     plan that arrives late is worth less than the funnel moving on. */
  return new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
}

function isPlanShaped(value: unknown): value is { headline: string; summary: string; steps: SetupPlanStep[] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.headline !== "string" || typeof candidate.summary !== "string") return false;
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) return false;
  return candidate.steps.every(
    (step) =>
      step &&
      typeof step === "object" &&
      typeof (step as SetupPlanStep).title === "string" &&
      typeof (step as SetupPlanStep).detail === "string" &&
      typeof (step as SetupPlanStep).where === "string",
  );
}

export async function buildSetupPlan(input: SetupPlanInput): Promise<SetupPlan> {
  const openai = client();
  if (!openai) return fallbackSetupPlan(input);

  const focus = input.focusAreas.map((area) => FOCUS_LABELS[area] ?? area).filter(Boolean);

  const prompt = [
    `Business name: ${input.businessName || "not given"}`,
    `Legal structure: ${input.businessStructure || "not given"}`,
    `VAT registered: ${input.vatRegistered ? "yes" : "no"}`,
    `Base currency: ${input.currency}`,
    `Books kept in today: ${BOOKS_LABELS[input.booksToday] ?? input.booksToday}`,
    `What they want to fix: ${focus.length ? focus.join("; ") : "not specified"}`,
    input.notes.trim() ? `In their own words: ${input.notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_AI_ASSISTANT_MODEL || "gpt-5.6-terra",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You write short, concrete first-week setup plans for WAWPROFI, UK accounting software.",
            "",
            "The workspace is brand new and completely empty. Plan only what can be done in these areas:",
            ...FEATURES.map((feature) => `- ${feature}`),
            "",
            "Rules:",
            "- Never invent a feature, integration or menu item. If it is not listed above, it does not exist.",
            "- UK English. Plain language, no jargon, no accountancy lecture.",
            "- Order the steps so each one is possible after the last. Nothing depends on data that does not exist yet.",
            "- Address the specific things they said they want to fix. A generic tour is a failure.",
            "- Four to six steps. Each detail is one or two sentences, and says why it is worth doing.",
            "- 'where' is a breadcrumb into the product, e.g. 'Sales → Customers'.",
            "- Never mention pricing, payment, trials or this signup flow.",
            "",
            'Reply with JSON only: {"headline": string, "summary": string, "steps": [{"title": string, "detail": string, "where": string}]}',
            "headline is at most 8 words. summary is one sentence naming what they said they care about.",
          ].join("\n"),
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallbackSetupPlan(input);

    const parsed = JSON.parse(raw);
    if (!isPlanShaped(parsed)) return fallbackSetupPlan(input);

    return {
      headline: parsed.headline.slice(0, 90),
      summary: parsed.summary.slice(0, 260),
      steps: parsed.steps.slice(0, 6).map((step) => ({
        title: String(step.title).slice(0, 90),
        detail: String(step.detail).slice(0, 260),
        where: String(step.where).slice(0, 60),
      })),
      generated: true,
    };
  } catch (error) {
    /* Logged, not surfaced. The reader gets the fallback plan and carries on;
       an error toast one screen before checkout costs a signup and buys
       nothing, since there is nothing for them to do about it. */
    console.error("Setup plan generation failed:", error);
    return fallbackSetupPlan(input);
  }
}

/**
 * What Aurelius knows about each step, so an answer is about the screen the
 * reader is actually looking at.
 *
 * Kept here beside the plan prompt rather than in the component, because it is
 * prompt material — it goes to the model, it is not rendered.
 */
const STEP_CONTEXT: Record<number, string> = {
  1: "They are naming their workspace and choosing a base currency and date format. The base currency is what the books are kept in; changing it later is a migration, not a setting. Multicurrency decides whether they can raise a document in another currency, and the books stay in the base either way. Five currencies are supported today: GBP, USD, EUR, PHP, TZS.",
  2: "They are entering their legal structure and tax references: company number (CRN), Company UTR, employer PAYE reference, whether they pay CIS subcontractors, financial year end and nature of business. A Companies House search can fill most of it. The UTR is not on the public register — it only comes from HMRC's letter. Everything except structure is optional and can be added later.",
  3: "They are saying whether they are VAT registered, and if so the VAT number and filing frequency. The number can be checked against HMRC live. Registration is compulsory above £90,000 of taxable turnover in a rolling twelve months; voluntary registration is allowed below it and lets them reclaim input VAT.", // currency:allow UK VAT registration threshold, a statutory sterling figure
  4: "They are choosing what they want the software to fix, what they keep their books in today, and optionally describing their situation in their own words. These answers write their first-week plan.",
  5: "They are choosing between customising their document branding and purchase rules now, or finishing with sensible defaults. Nothing is locked in either way — every setting is in Settings afterwards. The standard chart of accounts is created for them regardless.",
};

/**
 * A short answer to a question asked during setup.
 *
 * Strictly guidance about this screen and about UK bookkeeping — never advice
 * about their specific tax position, which nobody should be giving from a
 * signup form on the basis of six answers.
 */
/**
 * Answers held locally for the questions Aurelius offers as chips.
 *
 * The fallback used to be one sentence for every question, so an outage meant
 * somebody asking three different things got the same reply three times —
 * which reads as broken rather than as a hiccup. These are the questions he
 * suggests, so they are the ones most likely to be asked, and they are exactly
 * the ones that can be answered without a model. Matched loosely on keywords,
 * because somebody who types their own version of the same question deserves
 * the same answer.
 */
const OFFLINE_ANSWERS: Array<{ match: RegExp; answer: string }> = [
  {
    match: /change.*(currency|money)|currency.*(later|change)/i,
    answer:
      "Not easily — the base currency is what every figure in your books is stored in, so changing it later is a migration rather than a setting. Pick the one you bank in and file accounts in. You can still invoice in other currencies by turning multicurrency on.",
  },
  {
    match: /multicurrenc|more than one currenc|foreign currenc/i,
    answer:
      "It lets you raise invoices and enter bills in currencies other than your base one. Your books stay in the base currency throughout — each document is converted at the rate on the day, and the difference is tracked for you. You can switch it on later in Settings.",
  },
  {
    match: /UTR|unique taxpayer/i,
    answer:
      "A Unique Taxpayer Reference is the ten-digit number HMRC uses to identify you for tax. A company gets one after incorporation; a sole trader gets one after registering for Self Assessment. It is not on any public register — it only comes from HMRC's own letters, so we cannot look it up for you. You can leave it blank and add it later.",
  },
  {
    match: /PAYE/i,
    answer:
      "Only if you run payroll. An employer PAYE reference is issued when you register as an employer with HMRC, and it looks like 123/AB456. If nobody is on your payroll yet, leave it blank — you can add it the day you need it.",
  },
  {
    match: /(register|registered|need).*(vat)|vat.*(register|registered|need)/i,
    answer:
      "You must register once your VAT-taxable turnover passes £90,000 in any rolling twelve months, or if you expect to pass it in the next thirty days. Below that it is voluntary — worth it if you buy a lot from VAT-registered suppliers, since you can reclaim the VAT. Your accountant is the right person to confirm your own position.", // currency:allow UK VAT registration threshold, a statutory sterling figure
  },
  {
    match: /(vat).*(threshold|limit)|threshold/i,
    answer:
      "£90,000 of VAT-taxable turnover in any rolling twelve months — not a tax year, which catches people out. If you cross it you have thirty days to register. You can register voluntarily below it.", // currency:allow UK VAT registration threshold, a statutory sterling figure
  },
  {
    match: /standard setup|skip.*setup|default/i,
    answer:
      "It creates your standard chart of accounts, clean default layouts for every document, and bills that wait for approval before they post. Nothing is locked in — every one of those is in Settings afterwards. Customising now only saves you doing it later.",
  },
  {
    match: /(change|edit).*(branding|logo|template|layout)/i,
    answer:
      "Yes, all of it. Logos, colours, fonts, layouts, numbering and paper size are in Sales settings and Purchases settings, and changing them there applies to everything you send from that point on.",
  },
  {
    match: /spreadsheet|excel|migrat|bring.*across|import/i,
    answer:
      "You can import your chart of accounts and your bank statements from a file. Customers, suppliers and opening balances are entered directly for now, so it is worth having last year's closing figures to hand before you start.",
  },
];

/** The best local answer for a question, or null when none fits. */
function offlineAnswer(question: string): string | null {
  return OFFLINE_ANSWERS.find((entry) => entry.match.test(question))?.answer ?? null;
}

export async function askAurelius(step: number, question: string): Promise<string> {
  const openai = client();
  if (!openai) {
    return (
      offlineAnswer(question) ??
      "I cannot reach my knowledge right now — try me again in a moment. Nothing on this screen is a decision you are stuck with; it can all be changed later in Settings."
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_AI_ASSISTANT_MODEL || "gpt-5.6-terra",
      messages: [
        {
          role: "system",
          content: [
            "You are Aurelius, the guide inside WAWPROFI, UK accounting software. You are helping somebody through signup.",
            `They are on step ${step} of 5. ${STEP_CONTEXT[step] ?? ""}`,
            "",
            "Rules:",
            "- Answer in at most three short sentences. This is a sidebar, not an article.",
            "- UK English. Plain language. No jargon, no lecture, no bullet lists.",
            "- Explain what the choice means and what happens if they get it wrong. Say when something can be changed later, because most of it can.",
            "- Never give advice about their own tax position, and never tell them what to declare. Point them at their accountant for that.",
            "- Never invent a feature. If you are unsure whether the product does something, say it is worth checking in Settings once they are in.",
            "- If the question is not about setup or bookkeeping, say so briefly and steer back.",
          ].join("\n"),
        },
        { role: "user", content: question.slice(0, 300) },
      ],
    });

    return (
      completion.choices[0]?.message?.content?.trim() ||
      "I did not catch that — try asking it a different way."
    );
  } catch (error) {
    console.error("Aurelius question failed:", error);
    return (
      offlineAnswer(question) ??
      "I could not reach my knowledge just then — ask me again in a moment. Nothing here is a decision you are stuck with; it can all be changed later in Settings."
    );
  }
}
