"use client";

import { createPortal } from "react-dom";

import { useState } from "react";
import {
  X,
  Loader2,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";

import { useCurrency } from "@/components/currency-provider";
import {
  useBankAccounts,
  useContacts,
  useExpenseAccounts,
  useCreateTransfer,
  useCreateReceivedPayment,
  useCreatePaidExpense,
} from "@/lib/banking/api";

// ─── Shared shell ────────────────────────────────────────────────────

function ModalShell({
  title,
  icon,
  iconBg,
  iconText,
  children,
  onClose,
  onSubmit,
  submitting,
  submitLabel,
  error,
  success,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  iconText: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  error: string | null;
  success: string | null;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-lg ${iconBg} ${iconText}`}>
              {icon}
            </div>
            <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">{children}</div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            {success}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !!success}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? "Saving..." : success ? "Done" : submitLabel}
          </button>
        </div>

        <style jsx>{`
          :global(.money-input) {
            width: 100%;
            height: 38px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 0 10px;
            font-size: 14px;
            outline: none;
            background: white;
          }
          :global(.money-input:focus) {
            border-color: #2563eb;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── 1. Transfer Money ──────────────────────────────────────────────

export function TransferMoneyModal({ onClose }: { onClose: () => void }) {
  const { symbol } = useCurrency();
  const { data: accounts, isLoading } = useBankAccounts();
  const transfer = useCreateTransfer();

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!fromId || !toId) return setError("Pick both From and To accounts.");
    if (fromId === toId) return setError("From and To must be different.");
    if (!amount || parseFloat(amount) <= 0) return setError("Enter an amount.");

    try {
      await transfer.mutateAsync({
        from_account_id: fromId,
        to_account_id: toId,
        amount,
        date,
        memo: memo || undefined,
      });
      setSuccess(`✓ Transferred ${symbol}${amount}`);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer.");
    }
  };

  return (
    <ModalShell
      title="Transfer Money"
      icon={<ArrowRightLeft className="size-5" />}
      iconBg="bg-blue-100"
      iconText="text-blue-600"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={transfer.isPending}
      submitLabel="Transfer"
      error={error}
      success={success}
    >
      {isLoading && <p className="text-sm text-slate-500">Loading accounts...</p>}

      {!isLoading && (
        <>
          <Field label="From Account *">
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="money-input"
            >
              <option value="">Select account...</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} (Balance: {symbol}{a.balance})
                </option>
              ))}
            </select>
          </Field>

          <Field label="To Account *">
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="money-input"
            >
              <option value="">Select account...</option>
              {accounts
                ?.filter((a) => a.id !== fromId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} (Balance: {symbol}{a.balance})
                  </option>
                ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${symbol}) *`}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="money-input"
              />
            </Field>

            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="money-input"
              />
            </Field>
          </div>

          <Field label="Memo (optional)">
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Move to savings"
              className="money-input"
            />
          </Field>
        </>
      )}
    </ModalShell>
  );
}

// ─── 2. Received Payment ────────────────────────────────────────────

export function ReceivedPaymentModal({ onClose }: { onClose: () => void }) {
  const { symbol } = useCurrency();
  const { data: accounts, isLoading: accLoading } = useBankAccounts();
  const { data: customers, isLoading: cLoading } = useContacts("customer");
  const received = useCreateReceivedPayment();

  const [bankId, setBankId] = useState("");
  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!bankId) return setError("Pick a deposit account.");
    if (!amount || parseFloat(amount) <= 0) return setError("Enter an amount.");

    try {
      await received.mutateAsync({
        bank_account_id: bankId,
        contact_id: contactId || null,
        amount,
        date,
        memo: memo || undefined,
      });
      setSuccess(`✓ Recorded ${symbol}${amount} received`);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    }
  };

  return (
    <ModalShell
      title="Received Payment"
      icon={<ArrowDownToLine className="size-5" />}
      iconBg="bg-green-100"
      iconText="text-green-600"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={received.isPending}
      submitLabel="Record Payment"
      error={error}
      success={success}
    >
      {(accLoading || cLoading) && (
        <p className="text-sm text-slate-500">Loading...</p>
      )}

      {!accLoading && !cLoading && (
        <>
          <Field label="Deposit into *">
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="money-input"
            >
              <option value="">Select bank account...</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} ({a.bank_name})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Customer (optional)">
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="money-input"
            >
              <option value="">— No customer linked —</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${symbol}) *`}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="money-input"
              />
            </Field>

            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="money-input"
              />
            </Field>
          </div>

          <Field label="Reference / Memo">
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="INV-736 payment"
              className="money-input"
            />
          </Field>

          <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Posts to Accounts Receivable (code 1100). Use the Sales section for full invoice tracking.
          </p>
        </>
      )}
    </ModalShell>
  );
}

// ─── 3. Paid Expense ────────────────────────────────────────────────

export function PaidExpenseModal({ onClose }: { onClose: () => void }) {
  const { symbol } = useCurrency();
  const { data: accounts, isLoading: accLoading } = useBankAccounts();
  const { data: expenseAccounts, isLoading: eLoading } = useExpenseAccounts();
  const { data: suppliers, isLoading: sLoading } = useContacts("supplier");
  const paid = useCreatePaidExpense();

  const [bankId, setBankId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!bankId) return setError("Pick the bank account paying.");
    if (!expenseId) return setError("Pick an expense category.");
    if (!amount || parseFloat(amount) <= 0) return setError("Enter an amount.");

    try {
      await paid.mutateAsync({
        bank_account_id: bankId,
        expense_account_id: expenseId,
        contact_id: contactId || null,
        amount,
        date,
        memo: memo || undefined,
      });
      setSuccess(`✓ Recorded ${symbol}${amount} expense`);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record expense.");
    }
  };

  return (
    <ModalShell
      title="Paid Expense"
      icon={<ArrowUpFromLine className="size-5" />}
      iconBg="bg-orange-100"
      iconText="text-orange-600"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={paid.isPending}
      submitLabel="Record Expense"
      error={error}
      success={success}
    >
      {(accLoading || eLoading || sLoading) && (
        <p className="text-sm text-slate-500">Loading...</p>
      )}

      {!accLoading && !eLoading && !sLoading && (
        <>
          <Field label="Paid from *">
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="money-input"
            >
              <option value="">Select bank account...</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name} (Balance: {symbol}{a.balance})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Expense Category *">
            <select
              value={expenseId}
              onChange={(e) => setExpenseId(e.target.value)}
              className="money-input"
            >
              <option value="">Select expense category...</option>
              {expenseAccounts?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Supplier (optional)">
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="money-input"
            >
              <option value="">— No supplier linked —</option>
              {suppliers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${symbol}) *`}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="money-input"
              />
            </Field>

            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="money-input"
              />
            </Field>
          </div>

          <Field label="Description / Memo">
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="AWS hosting May"
              className="money-input"
            />
          </Field>

          {expenseAccounts && expenseAccounts.length === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No expense categories found. Add some in the Chart of Accounts first.
            </p>
          )}
        </>
      )}
    </ModalShell>
  );
}