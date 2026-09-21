/**
 * Checking a Unique Taxpayer Reference.
 *
 * There is nowhere to look a UTR up. Companies House does not hold it and HMRC
 * publishes no equivalent of the VAT number check, so unlike every other
 * reference on the tax profile this one cannot be confirmed against a register.
 * It arrives on a letter and is typed in by hand.
 *
 * What can be done is catch a wrong one. A UTR carries a leading check digit
 * over the other nine, so a single mistyped or transposed digit fails
 * arithmetic even though no service was asked.
 *
 * Nothing here ever rejects. HMRC has never published this algorithm — it is a
 * de facto standard that holds on real references and is relied on by UK
 * accounting software, which is not the same as a guarantee. Treating a failure
 * as fatal would mean a business holding a genuine reference that happens not
 * to satisfy it could never record it at all. So a failure is reported for
 * somebody to look at, and the value is still theirs to save.
 */

/** Applied to digits two through ten. The first digit is the check digit. */
const WEIGHTS = [6, 7, 8, 9, 10, 5, 4, 3, 2];

export type UtrCheck =
  | { state: "empty" }
  | { state: "valid"; utr: string }
  /** Right shape is not right length — say which, so it can be counted. */
  | { state: "wrong_length"; digits: number }
  | { state: "not_numeric" }
  /** Ten digits, but the check digit does not agree with the other nine. */
  | { state: "checksum_failed"; utr: string };

/**
 * Digits only.
 *
 * Spaces are how HMRC prints it, and a trailing K appears on payment
 * references quoting the same number — neither is part of the reference.
 */
export function normaliseUtr(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/[kK]$/, "");
}

export function checkUtr(value: string): UtrCheck {
  const normalised = normaliseUtr(value);
  if (!normalised) return { state: "empty" };
  if (!/^\d+$/.test(normalised)) return { state: "not_numeric" };
  if (normalised.length !== 10) return { state: "wrong_length", digits: normalised.length };

  const digits = normalised.split("").map(Number);
  const total = WEIGHTS.reduce((sum, weight, index) => sum + weight * digits[index + 1], 0);
  const expected = (11 - (total % 11)) % 11;

  // A remainder of 1 leaves an expected check digit of 10, which cannot be
  // written in one place. No such reference is issued, so this is a failure
  // rather than a case to allow through.
  if (expected === 10 || expected !== digits[0]) {
    return { state: "checksum_failed", utr: normalised };
  }

  return { state: "valid", utr: normalised };
}

/** What to show beside the field, or null when there is nothing to say. */
export function utrMessage(check: UtrCheck): { tone: "ok" | "warn"; text: string } | null {
  switch (check.state) {
    case "empty":
      return null;
    case "valid":
      return { tone: "ok", text: "Checks out." };
    case "not_numeric":
      return { tone: "warn", text: "A UTR is ten digits, with no letters." };
    case "wrong_length":
      return {
        tone: "warn",
        text: `A UTR is ten digits — this has ${check.digits}.`,
      };
    case "checksum_failed":
      return {
        tone: "warn",
        text: "That does not look like a valid UTR — check for a mistyped or swapped digit. You can still save it.",
      };
  }
}
