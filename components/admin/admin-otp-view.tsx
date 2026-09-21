"use client";

import { useActionState, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  verifyAdminOtp,
  resendAdminOtp,
  type AdminOtpState,
} from "@/app/(admin)/admin/login/verify/actions";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { AlertCircle, MailCheck } from "lucide-react";

const initialState: AdminOtpState = null;

const slotClass =
  "size-12 text-lg font-bold text-slate-900 bg-white/50 border-slate-200 first:rounded-l-xl last:rounded-r-xl data-[active=true]:border-blue-500 data-[active=true]:ring-blue-500/20";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}•••@${domain}`;
}

export default function AdminOtpView({ email }: { email: string }) {
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyAdminOtp as (state: AdminOtpState, formData: FormData) => Promise<AdminOtpState>,
    initialState
  );
  const [resendState, resendAction, resending] = useActionState(
    resendAdminOtp as (state: AdminOtpState, formData: FormData) => Promise<AdminOtpState>,
    initialState
  );
  const [code, setCode] = useState("");

  const error = verifyState?.error ?? resendState?.error;
  const info = resendState?.info;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-50 font-sans text-slate-900 px-4 overflow-hidden">
      {/* Subtle Background Glow to match the login page */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-md p-8 sm:p-10 border border-slate-200/80 rounded-[2rem] bg-white/80 backdrop-blur-xl shadow-2xl shadow-blue-900/5 flex flex-col">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-b-full" />

        <div className="mb-8 text-center flex flex-col items-center">
          <div className="size-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-blue-100/50">
            <MailCheck className="size-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Check your email</h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">
            We sent a 6-digit verification code to{" "}
            <span className="font-bold text-slate-700">{maskEmail(email)}</span>.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-xs font-semibold text-red-800 border border-red-100 animate-in fade-in-50 slide-in-from-top-2 duration-300 shadow-sm">
            <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {!error && info && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 border border-emerald-100 animate-in fade-in-50 slide-in-from-top-2 duration-300 shadow-sm">
            <MailCheck className="size-4 shrink-0 text-emerald-600 mt-0.5" />
            <span className="leading-relaxed">{info}</span>
          </div>
        )}

        <form action={verifyAction} className="space-y-5">
          <div className="space-y-3">
            <label htmlFor="code" className="block text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Verification Code
            </label>
            <InputOTP
              id="code"
              name="code"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              autoComplete="one-time-code"
              autoFocus
              disabled={verifying}
              value={code}
              onChange={setCode}
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className={slotClass} />
                <InputOTPSlot index={1} className={slotClass} />
                <InputOTPSlot index={2} className={slotClass} />
              </InputOTPGroup>
              <InputOTPSeparator className="text-slate-300" />
              <InputOTPGroup>
                <InputOTPSlot index={3} className={slotClass} />
                <InputOTPSlot index={4} className={slotClass} />
                <InputOTPSlot index={5} className={slotClass} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            className="w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {verifying ? "Verifying Code..." : "Verify & Continue"}
          </button>
        </form>

        {/* The 60s resend cooldown is enforced server-side; a premature click
            just surfaces the "wait a minute" error. */}
        <form action={resendAction} className="mt-6 text-center">
          <button
            type="submit"
            disabled={resending || verifying}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resending ? "Sending..." : "Didn't get it? Resend code"}
          </button>
        </form>
      </div>
    </div>
  );
}
