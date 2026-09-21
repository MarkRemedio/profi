/**
 * Today's date (yyyy-mm-dd) in the organization's accounting timezone.
 *
 * There is no per-organization timezone column yet and the product is
 * UK-centric (GBP/VAT/en-GB), so the default is Europe/London. Using UTC here
 * (as `new Date().toISOString().slice(0,10)` does) renders the wrong date near
 * midnight UK time, worse under BST. When a per-org timezone is added, pass it in.
 */
export function accountingToday(timeZone = "Europe/London"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
