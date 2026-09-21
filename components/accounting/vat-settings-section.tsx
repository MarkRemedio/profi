"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { verifyVatNumber, warmVatCheck } from "@/app/(dashboard)/vat-actions";

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "registered"; name: string; address: string | null; reference: string | null }
  | { kind: "rejected"; message: string }
  | { kind: "unchecked"; message: string };

export type VatDraft = { vatRegistered: boolean; vatNumber: string };

/**
 * VAT registration for the workspace.
 *
 * This one flag decides whether invoices and bills offer VAT at all. A business
 * below the registration threshold must not be shown tax rates — an invoice
 * charging VAT it has no right to collect is a real problem, not a cosmetic one.
 *
 * Editable rather than fixed at signup, because businesses cross the threshold
 * mid-year and deregister when they shrink.
 *
 * Deliberately has no save button of its own. It sat beside the dialog's own
 * "Save Settings" and nobody could tell whether both needed pressing, or whether
 * one discarded the other. The dialog owns the values and saves everything at
 * once; this renders them and verifies the number against HMRC.
 *
 * It does not load its own values either. It used to, and seeded them through
 * onChange when the fetch landed — which overwrote anything ticked in the
 * meantime, so the checkbox appeared to revert on its own. The dialog now loads
 * everything before rendering this at all.
 */
export function VatSettingsSection({
  value,
  onChange,
  canManage,
  error,
}: {
  value: VatDraft;
  onChange: (next: VatDraft) => void;
  canManage: boolean;
  /** Surfaced by the dialog when saving is refused — e.g. HMRC has no record. */
  error?: string | null;
}) {
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const warmed = useRef(false);

  /**
   * Get the HMRC token in hand before the first Check, so it costs one round
   * trip instead of two.
   *
   * Only for a workspace that is, or is becoming, VAT registered — the Check
   * button does not exist otherwise. It used to run for everyone on mount,
   * which spent an HMRC round trip (the slowest call here) on the majority who
   * will never press it, and queued ahead of their save: Next runs server
   * actions one at a time per client.
   */
  function warmOnce() {
    if (warmed.current) return;
    warmed.current = true;
    void warmVatCheck().catch(() => null);
  }

  useEffect(() => {
    if (value.vatRegistered) warmOnce();
    // Mount only. A workspace already registered opens straight onto the Check
    // button; anyone else warms it when they tick the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck() {
    setCheck({ kind: "checking" });
    const result = await verifyVatNumber(value.vatNumber);

    if (result.status === "registered") {
      setCheck({
        kind: "registered",
        name: result.name,
        address: result.address,
        reference: result.consultationNumber,
      });
    } else if (result.status === "not_registered") {
      setCheck({ kind: "rejected", message: "HMRC has no registration for this number." });
    } else if (result.status === "invalid_format") {
      setCheck({ kind: "rejected", message: result.reason });
    } else {
      setCheck({ kind: "unchecked", message: result.reason });
    }
  }

  return (
    /* No heading of its own — the card around this already says "VAT
       registration", and saying it twice reads as two separate settings. */
    <div>
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
        <Checkbox
          checked={value.vatRegistered}
          disabled={!canManage}
          onCheckedChange={(checked) => {
            onChange({ ...value, vatRegistered: checked === true });
            setCheck({ kind: "idle" });
            if (checked === true) warmOnce();
          }}
          className="mt-0.5"
        />
        <div className="w-full text-sm">
          <p className="font-medium text-slate-800">This business is VAT registered</p>
          <p className="mt-1 text-xs text-slate-500">
            Turns VAT rates on for invoices and bills. Leave it off and every document is
            raised with no VAT, which is what a business below the registration threshold
            should be issuing.
          </p>

          {value.vatRegistered && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={value.vatNumber}
                  disabled={!canManage}
                  placeholder="GB 123 4567 89"
                  onChange={(event) => {
                    onChange({ ...value, vatNumber: event.target.value });
                    setCheck({ kind: "idle" });
                  }}
                  className="h-9 flex-1 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  disabled={!canManage || !value.vatNumber.trim() || check.kind === "checking"}
                  onClick={runCheck}
                >
                  {check.kind === "checking" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Check
                    </>
                  )}
                </Button>
              </div>

              {check.kind === "checking" && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Asking HMRC…
                </p>
              )}

              {check.kind === "registered" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Registered with HMRC
                  </p>
                  <p className="mt-1 font-medium">{check.name}</p>
                  {check.address && <p className="mt-0.5 text-emerald-800">{check.address}</p>}
                  <p className="mt-1.5 text-emerald-700">
                    Check this is your business — a valid number may belong to someone else.
                  </p>
                  {check.reference && (
                    <p className="mt-1 text-[11px] text-emerald-700">
                      HMRC reference {check.reference}
                    </p>
                  )}
                </div>
              )}

              {check.kind === "rejected" && (
                <p className="flex items-start gap-1.5 text-xs text-red-600">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {check.message}
                </p>
              )}

              {check.kind === "unchecked" && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {check.message} You can still save it.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
