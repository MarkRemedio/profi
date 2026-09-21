import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? ""; // 🚀 Reads where the user needs to go next

  if (code) {
    const supabase = await createClient();
    
    // 1. Exchange the code for a secure user session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      
      // 🛡️ PIPELINE A: PASSWORD RECOVERY
      // If the link is meant for updating their password, send them straight there!
      if (next.includes("update-password")) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // 🚀 PIPELINE B: YOUR SIGN-UP FLOWCHART COMPLIANCE 
      // For normal registrations, sign them out immediately to force a fresh login
      await supabase.auth.signOut();

      return NextResponse.redirect(`${origin}/login?message=Email verified successfully! Please log in.`);
    }
  }

  // ❌ Fallback if the link is expired or invalid
  return NextResponse.redirect(`${origin}/login?error=Verification failed or link expired.`);
}