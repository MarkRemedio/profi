"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AlertCircle, Check, CreditCard, Eye, EyeOff, Lock, User, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { isPasswordValid } from "@/lib/auth/password-rules";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import {
  completeClientSignupAction,
  startClientCheckoutAction,
} from "@/app/invite/client/[token]/actions";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Step = "payment" | "details";

interface ClientActivationProps {
  token: string;
  email: string;
  companyName: string;
  planName: string;
  planPrice: number;
  planInterval: string;
  trialDays: number;
  alreadyPaid: boolean;
}

export function ClientActivation({
  token,
  email,
  companyName,
  planName,
  planPrice,
  planInterval,
  trialDays,
  alreadyPaid,
}: ClientActivationProps) {
  // Server-resolved: if payment is already recorded we open on the details step,
  // which is what makes returning after an abandoned session safe.
  const [step, setStep] = useState<Step>(alreadyPaid ? "details" : "payment");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const router = useRouter();

  const allRulesPass = isPasswordValid(password);
  // Only complain once they've actually started typing the confirmation.
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    allRulesPass &&
    password === confirmPassword &&
    confirmPassword.length > 0 &&
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim());

  const beginCheckout = async () => {
    setStarting(true);
    setError(null);

    const result = await startClientCheckoutAction(token);

    if (!result.success) {
      setError(result.error ?? "Could not start checkout.");
      setStarting(false);
      return;
    }

    // Free plan, or payment already taken — skip Stripe entirely.
    if ("alreadyPaid" in result && result.alreadyPaid) {
      setStep("details");
      setStarting(false);
      return;
    }

    setClientSecret(result.clientSecret ?? null);
    setStarting(false);
  };

  const submitDetails = () => {
    setError(null);

    startSubmit(async () => {
      const result = await completeClientSignupAction(token, {
        firstName,
        lastName,
        password,
        confirmPassword,
      });

      if (!result.success) {
        setError(result.error ?? "Could not finish setting up your workspace.");
        return;
      }

      // Account exists but there is no session yet — send them to sign in.
      router.push("/login?activated=1");
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Brand + context */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white">
            W
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
            Activate {companyName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {planName} ·{" "}
            {planPrice === 0
              ? "Free"
              : `£${planPrice.toFixed(2)} / ${planInterval}`}
            {trialDays > 0 && planPrice > 0 ? ` · ${trialDays}-day trial` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-400">{email}</p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {(["payment", "details"] as Step[]).map((s, i) => {
            const done = s === "payment" && step === "details";
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold",
                    done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : active
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-400"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
                  {s === "payment" ? "Subscription" : "Your details"}
                </div>
                {i === 0 && <div className="h-px w-6 bg-slate-200" />}
              </div>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ---------------- Step 1: subscription ---------------- */}
        {step === "payment" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="size-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">Complete your subscription</h2>
            </div>

            {clientSecret ? (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            ) : (
              // Started on click rather than on mount, so simply loading or
              // refreshing this page never creates a Stripe session.
              <div className="space-y-4 py-6 text-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
                  <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                    {planName}
                  </p>
                  <p className="m-0 mt-1 text-lg font-black text-slate-900">
                    {planPrice === 0 ? "Free" : `£${planPrice.toFixed(2)} / ${planInterval}`}
                  </p>
                  {trialDays > 0 && planPrice > 0 && (
                    <p className="m-0 mt-0.5 text-xs text-slate-500">
                      {trialDays}-day free trial, cancel any time
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void beginCheckout()}
                  disabled={starting}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer border-none"
                >
                  {starting
                    ? "Opening secure checkout…"
                    : planPrice === 0
                      ? "Continue"
                      : "Continue to secure payment"}
                </button>
              </div>
            )}

            <p className="mt-4 text-center text-xs text-slate-400">
              You can close this page at any time — returning to your invitation link picks up
              where you left off.
            </p>
          </div>
        )}

        {/* ---------------- Step 2: details + password ---------------- */}
        {step === "details" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <User className="size-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">Create your login</h2>
            </div>
            <p className="mb-5 text-xs text-slate-500">
              Payment received. Set your name and a password to finish.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  First Name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Last Name
                </label>
                <input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 size-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded border-none bg-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* The strength bar and checklist, shared with signup and the team
                invite so all three read the same and cannot drift apart. */}
            <PasswordRequirements password={password} className="mt-3" />

            {/* Confirm password */}
            <div className="mt-4 space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-xs font-bold uppercase tracking-widest text-slate-500"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 size-4 text-slate-400" />
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={mismatch}
                  className={cn(
                    "w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-4",
                    mismatch
                      ? "border-red-300 focus:border-red-400 focus:ring-red-500/10"
                      : "border-slate-200 focus:border-blue-400 focus:ring-blue-500/10"
                  )}
                  required
                />
              </div>
              {mismatch && (
                <p className="m-0 flex items-center gap-1 text-[11px] text-red-600">
                  <X className="size-3" />
                  Passwords do not match
                </p>
              )}
              {!mismatch && confirmPassword.length > 0 && (
                <p className="m-0 flex items-center gap-1 text-[11px] text-emerald-600">
                  <Check className="size-3" />
                  Passwords match
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={submitDetails}
              disabled={submitting || !canSubmit}
              className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer border-none"
            >
              {submitting ? "Setting up your workspace…" : "Finish & Create Workspace"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
