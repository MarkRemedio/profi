"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Check digit for a 13-digit EAN. Weights alternate 1 and 3 across the first
 * twelve digits; the thirteenth is what makes the total a multiple of ten.
 */
function ean13CheckDigit(first12: string) {
  const sum = first12
    .split("")
    .reduce((total, char, index) => total + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  return ean13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

/**
 * Build a valid EAN-13 from a prefix, computing the check digit rather than
 * picking a random one. A random thirteenth digit is invalid ~90% of the time,
 * and encoders reject it.
 */
export function generateEan13(prefix = "50") {
  let body = prefix;
  while (body.length < 12) {
    body += Math.floor(Math.random() * 10).toString();
  }
  body = body.slice(0, 12);
  return body + ean13CheckDigit(body);
}

type Props = {
  value: string;
  className?: string;
  /** Print the human-readable digits under the bars. */
  showValue?: boolean;
};

/**
 * Renders a real, scannable barcode.
 *
 * EAN-13 when the value is a valid one, otherwise Code 128, which encodes any
 * ASCII string without checksum rules. Falling back matters because in-house
 * SKUs are rarely valid EANs, and an encoder given a bad EAN throws rather than
 * drawing anything.
 */
export function BarcodeImage({ value, className, showValue = true }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let cancelled = false;

    async function render() {
      if (!value?.trim()) {
        setError("No barcode set for this product.");
        return;
      }

      try {
        // Loaded on demand; label printing is a rare action.
        const { default: JsBarcode } = await import("jsbarcode");
        if (cancelled || !svgRef.current) return;

        JsBarcode(svgRef.current, value, {
          format: isValidEan13(value) ? "EAN13" : "CODE128",
          displayValue: showValue,
          fontSize: 14,
          height: 60,
          margin: 8,
          background: "#ffffff",
        });
        setError("");
      } catch {
        if (!cancelled) setError("This value cannot be encoded as a barcode.");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [value, showValue]);

  if (error) {
    return <p className="text-xs text-center text-slate-400 py-6">{error}</p>;
  }

  return <svg ref={svgRef} className={className} />;
}
