import { Suspense } from "react";
import { SignupView } from "@/components/marketing/signup-view";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Sign Up | Wawprofi Cloud Engine",
  description: "Create your ledger account to launch your workspace engine.",
};

export default function SignupPage() {
  return (
    // 🚀 FIX: Wrap in a Suspense boundary to allow useSearchParams() to compile on Vercel
    <Suspense 
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <SignupView />
    </Suspense>
  );
}