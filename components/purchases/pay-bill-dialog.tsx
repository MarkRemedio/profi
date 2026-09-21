"use client";

import { formatMoney } from "@/lib/currency";
import { useCurrency } from "@/components/currency-provider";
import { useEffect, useRef, useState } from "react";
import { Banknote, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ChartAccountOption } from "@/lib/accounting/documents";
import type { Bill } from "./purchase-types";

// A bill carries its own currency, which need not be the workspace's. The
// registry renders each one with its proper symbol, so the previous
// GBP-or-bare-code special case is no longer needed.
function formatBillMinor(bill: Bill) {
  return formatMoney(bill.totalMinor, bill.currency);
}

type PayBillDialogProps = {
  bill: Bill | null;
  bankAccounts: ChartAccountOption[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    billId: string,
    paymentAccountId?: string,
    paymentMethod?: "cash" | "cheque" | "bank_transfer"
  ) => Promise<boolean>;
};

export function PayBillDialog({
  bill,
  bankAccounts,
  saving,
  onOpenChange,
  onConfirm,
}: PayBillDialogProps) {
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "cheque" | "bank_transfer">("bank_transfer");

  // Latest bankAccounts without being an effect dependency: a background
  // workspace refetch must not re-run the default-selection effect and clobber
  // the user's choice. The effect keys only on billId (per opened bill).
  const bankAccountsRef = useRef(bankAccounts);
  bankAccountsRef.current = bankAccounts;

  // Default to the main bank (1000), or the first bank account, per opened bill.
  const billId = bill?.id ?? null;
  useEffect(() => {
    const accounts = bankAccountsRef.current;
    if (billId && accounts.length > 0) {
      const main = accounts.find((account) => account.code === "1000");
      setPaymentAccountId((main ?? accounts[0]).id);
    }
  }, [billId]);

  async function handleConfirm() {
    if (!bill) return;
    const ok = await onConfirm(bill.id, paymentAccountId || undefined, paymentMethod);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={Boolean(bill)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark bill as paid</DialogTitle>
          <DialogDescription>
            {bill
              ? `Pay ${formatBillMinor(bill)} to ${bill.contactName} for bill ${bill.invoiceNo}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Pay from bank account
          </label>
          <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
            <SelectTrigger className="h-10 w-full bg-white">
              <SelectValue placeholder="Select bank account..." />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bankAccounts.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No bank accounts found — the payment will use the default bank account (1000).
            </p>
          ) : null}
        </div>

        <div className="pt-3">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">Payment method</label>
          <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
            <SelectTrigger className="h-10 w-full bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            disabled={saving || (bankAccounts.length > 0 && !paymentAccountId)}
            onClick={handleConfirm}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Banknote className="mr-2 size-4" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
