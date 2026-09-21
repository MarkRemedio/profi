/**
 * Shapes shared between the HMRC server modules and the pages that render them.
 *
 * Kept out of `hmrc-mtd.ts` because that module is `server-only`: a client
 * component needs this type, and importing it from there would either fail the
 * bundle or rely on type erasure happening to save it.
 */

export type VatObligation = {
  /** Period start, yyyy-mm-dd. */
  start: string;
  end: string;
  due: string;
  /** Present only once the period has been filed. */
  received: string | null;
  /** HMRC's key for the period, needed to submit against it. */
  periodKey: string;
  fulfilled: boolean;
};
