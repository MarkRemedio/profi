"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, User, ArrowRight, Building2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { acceptInviteAndCreateAccountAction } from "@/app/(dashboard)/settings/profile-access/actions";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { isPasswordValid, passwordProblemMessage } from "@/lib/auth/password-rules";

export function InviteSignupForm({ invite, token }: { invite: any; token: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // 🚀 Toggles for password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const passwordValid = isPasswordValid(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSeamlessSignup(e: React.FormEvent) {
    e.preventDefault();

    // Checked here as well as on the button, because a form still submits on
    // Enter. The server checks the same rules — this only saves a round trip.
    const problem = passwordProblemMessage(password);
    if (problem) {
      toast.error(problem);
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match. Please try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await acceptInviteAndCreateAccountAction(token, firstName, lastName, password);

      if (result.success) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email,
          password: password,
        });

        if (signInError) throw signInError;

        toast.success("Welcome to the team!");
        router.push("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to accept invitation.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 sm:p-8 font-sans">
      
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white font-black shadow-md shadow-blue-500/20">
          W
        </div>
        <span className="text-2xl font-black tracking-tight text-slate-900">WAWPROFI</span>
      </div>

      <div className="w-full max-w-[440px] rounded-[2rem] border border-slate-200/60 bg-white p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] sm:p-10">
        
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50/50 px-3 py-1.5 text-xs font-bold text-blue-700">
            <Building2 className="size-3.5" />
            Workspace Invitation
          </div>
          
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Join the team</h1>
          <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed">
            You've been invited to collaborate in <strong className="text-slate-900">{invite.organization.name}</strong>. Set up your credentials to get started.
          </p>
        </div>

        <form onSubmit={handleSeamlessSignup} className="space-y-5">
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Assigned Email
              <span className="flex items-center gap-1 text-emerald-600 capitalize tracking-normal text-[10px]">
                <CheckCircle2 className="size-3" /> Email Verified
              </span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 size-4 text-slate-400" />
              <input
                type="email"
                disabled
                value={invite.email}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-sm text-slate-500 font-semibold shadow-sm cursor-not-allowed select-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500">First Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 size-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder=""
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 font-medium shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder=""
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 font-medium shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-300"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500">Secure Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 size-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm text-slate-900 font-medium shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {/* Same rules the server enforces, shown as they type rather than
                as an error after the attempt. */}
            <PasswordRequirements password={password} className="pt-1" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 size-4 text-slate-400" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm text-slate-900 font-medium shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="m-0 pt-1 text-[11px] font-semibold text-red-600">
                Passwords do not match.
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !passwordValid || !passwordsMatch}
            className="group mt-4 w-full rounded-xl bg-orange-500 py-6 text-sm font-bold text-white shadow-md transition-all hover:bg-orange-600 hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {isSubmitting ? "Authenticating..." : (
              <span className="flex items-center gap-2">
                Create Account & Join Workspace
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}