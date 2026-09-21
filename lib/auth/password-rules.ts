/**
 * The password rules, in one place.
 *
 * There are three ways into this product — public signup, a client invite from
 * an accountant, and a team invite from inside a workspace — and each had its
 * own answer. Signup and the client invite happened to agree on five rules; the
 * team invite checked nothing at all and handed the password straight to
 * Supabase, so somebody joining an existing workspace could set a weaker
 * password than someone signing up for their own.
 *
 * Deliberately free of `server-only`: the forms need to show the checklist as
 * the user types, and the actions need to enforce it. A rule the client shows
 * but the server does not check is a suggestion; a rule the server checks but
 * the client does not show is a mystery error.
 */

export type PasswordRule = {
  id: string;
  /** Shown in the checklist, phrased as the thing they need. */
  label: string;
  /** Phrased to complete "must contain…", for server-side error messages. */
  requirement: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    requirement: "at least 8 characters",
    test: (password) => password.length >= 8,
  },
  {
    id: "uppercase",
    label: "One uppercase letter (A-Z)",
    requirement: "one uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    label: "One lowercase letter (a-z)",
    requirement: "one lowercase letter",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "One number (0-9)",
    requirement: "one number",
    test: (password) => /[0-9]/.test(password),
  },
  {
    id: "special",
    label: "One special character (!@#$%^&*)",
    requirement: "one special character",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
];

/** Each rule with whether this password satisfies it, for the checklist. */
export function evaluatePassword(password: string) {
  return PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(password) }));
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/**
 * What is still missing, for a server-side error message.
 *
 * Returns the requirements not met, so the message can name them rather than
 * saying the password is invalid and leaving the user to guess which part.
 */
export function passwordProblems(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.requirement);
}

/** One sentence naming everything still missing, or null when there is nothing. */
export function passwordProblemMessage(password: string): string | null {
  const problems = passwordProblems(password);
  if (problems.length === 0) return null;
  return `Your password needs ${problems.join(", ")}.`;
}
