import "server-only";

import OpenAI from "openai";

export type AiCategoryCandidate = { id: string; description: string; moneyIn: boolean };
export type AiCategoryAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  reportCategory: string;
};

/** AI may select only an existing account ID supplied by the workspace. */
export async function suggestAiCategories(
  transactions: AiCategoryCandidate[],
  accounts: AiCategoryAccount[],
): Promise<{
  suggestions: Map<string, { accountId: string; confidence: number; scope: "company" | "personal" }>;
  failedTransactions: number;
}> {
  if (!process.env.OPENAI_API_KEY || transactions.length === 0 || accounts.length === 0) {
    return { suggestions: new Map(), failedTransactions: transactions.length };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  const allowed = new Set(accounts.map((account) => account.id));
  const batches = Array.from(
    { length: Math.ceil(transactions.length / 25) },
    (_, index) => transactions.slice(index * 25, (index + 1) * 25),
  );
  const suggestions = new Map<string, { accountId: string; confidence: number; scope: "company" | "personal" }>();
  let failedTransactions = 0;
  let cursor = 0;
  const deadline = Date.now() + 50_000;

  const classifyBatch = async (batch: AiCategoryCandidate[], maySplit = true): Promise<void> => {
    // Do not hold the review dialog open indefinitely for very large files.
    // Remaining rows are returned as needing attention and can be retried.
    if (Date.now() >= deadline) {
      failedTransactions += batch.length;
      return;
    }
    try {
      const response = await client.responses.create({
        model: process.env.OPENAI_AI_ASSISTANT_MODEL || "gpt-5.6-terra",
        instructions: "Classify every supplied bank transaction using ONLY one account ID from the provided chart of accounts. Return confidence as an integer from 0 to 100. Also classify scope as company or personal. Use personal only when the description clearly indicates personal use; when uncertain, use company so the business owner can review it. Consider account code, name, type, report category, transaction direction, and description. The account must fit the economic nature of the transaction and its financial report section. Never invent an account, omit a transaction, or return an ID that was not supplied. Return JSON only.",
        input: JSON.stringify({ accounts, transactions: batch }),
        text: { format: { type: "json_schema", name: "bank_categories", strict: true, schema: { type: "object", properties: { suggestions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, accountId: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 }, scope: { type: "string", enum: ["company", "personal"] } }, required: ["id", "accountId", "confidence", "scope"], additionalProperties: false } } }, required: ["suggestions"], additionalProperties: false } } },
        store: false,
        max_output_tokens: 4_000,
      });
      const parsed = JSON.parse(response.output_text) as { suggestions: Array<{ id: string; accountId: string; confidence: number; scope: "company" | "personal" }> };
      for (const item of parsed.suggestions) {
        if (allowed.has(item.accountId) && item.confidence >= 50) {
          suggestions.set(item.id, { accountId: item.accountId, confidence: item.confidence, scope: item.scope });
        }
      }
    } catch (error) {
      // A slow batch gets one automatic retry as two smaller requests. This
      // keeps a single timeout from leaving 25 rows uncategorized.
      if (maySplit && batch.length > 5 && Date.now() + 15_000 < deadline) {
        const middle = Math.ceil(batch.length / 2);
        await Promise.all([
          classifyBatch(batch.slice(0, middle), false),
          classifyBatch(batch.slice(middle), false),
        ]);
        return;
      }
      failedTransactions += batch.length;
      console.error("[banking] AI categorization batch failed", {
        batchSize: batch.length,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // A small worker pool covers the full review without flooding the AI service.
  const worker = async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      await classifyBatch(batch);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, worker));
  return { suggestions, failedTransactions };
}
