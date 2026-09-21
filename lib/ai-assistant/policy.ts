import "server-only";

/**
 * Deterministic boundaries applied before a prompt reaches a model. These are
 * deliberately narrow: legitimate accounting questions are answered, while
 * legal direction and attempts to obtain data outside the workspace are not.
 */
const LEGAL_ACTION_PATTERN = /\b(sue|lawsuit|litigation|court|legal action|legal advice|solicitor|attorney|settlement agreement|breach of contract|terminate (?:a |the )?contract)\b/i;
const OUTSIDE_WORKSPACE_DATA_PATTERN = /\b(show|give|send|export|reveal|list)\b.{0,80}\b(other (?:company|organisation|organization|workspace)|another (?:company|organisation|organization|workspace)|someone else(?:'s)?|other client(?:'s)?|other customer(?:'s)?)\b/i;
const PROMPT_OVERRIDE_PATTERN = /\b(ignore (?:all |previous |your )?(?:instructions|rules)|reveal (?:your )?(?:system|developer) prompt|change (?:your )?(?:persona|role)|act as (?:a )?(?:system|developer))\b/i;

export type AiRequestPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: "legal_action" | "outside_workspace_data" | "prompt_override"; message: string };

export function assessAiRequestPolicy(question: string): AiRequestPolicyResult {
  if (PROMPT_OVERRIDE_PATTERN.test(question)) {
    return { allowed: false, reason: "prompt_override", message: "I can help with your workspace books, but I can’t change my operating rules or reveal internal instructions." };
  }
  if (LEGAL_ACTION_PATTERN.test(question)) {
    return { allowed: false, reason: "legal_action", message: "I can’t provide directions or advice for legal action. Please speak with a qualified legal professional." };
  }
  if (OUTSIDE_WORKSPACE_DATA_PATTERN.test(question)) {
    return { allowed: false, reason: "outside_workspace_data", message: "I can only use records from your current workspace that your role is allowed to access." };
  }
  return { allowed: true };
}
