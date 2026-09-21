export function minorToMajor(minor: number | bigint | string) {
  return Number(minor) / 100;
}

// formatGbpMinor was removed: it hardcoded GBP and was the single largest
// reason a workspace's chosen currency never appeared. Use formatMoney from
// @/lib/currency (or the useCurrency hook in client components) instead.

export function poundsToMinor(value: string) {
  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a positive amount with up to 2 decimal places.");
  }

  const [whole, fractional = ""] = normalized.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fractional.padEnd(2, "0"));
}
