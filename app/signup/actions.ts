"use server";

import { createClient } from "@/lib/supabase/server";

export async function signUpUser(formData: any) {
  const supabase = await createClient();
  // 🚀 FIXED: Changed to NEXT_PUBLIC_BASE_URL to match your Vercel environment variables perfectly!
  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  // Synthesis of full name for global layout checks
  const computedFullName = `${formData.firstName || ""} ${formData.lastName || ""}`.trim();

  const { data, error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`, // Now points to Vercel!
      data: {
        // Standardizes naming fields for layout engines globally!
        full_name: computedFullName || "User Profile",
        display_name: computedFullName || "User Profile",
        name: computedFullName || "User Profile",
        
        // Retain your individual custom form entries below:
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        location: formData.location,
        business_type: formData.businessType,
        language: formData.language, 
        plan_code: formData.plan,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}