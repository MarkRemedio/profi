"use server";

import { prisma } from "@/lib/prisma"; // 🚀 Import your custom tenancy-extended Prisma!
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin (Bypasses RLS to update passwords)
// Make sure you have SUPABASE_SERVICE_ROLE_KEY in your .env.local!
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function fetchSecurityQuestions(email: string) {
// ... rest of your code stays exactly the same!
  try {
    // 1. Securely find the user by email using Prisma
    const user = await prisma.users.findFirst({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return { error: "If this email is registered, we will display your security questions next." };
    }

    // 2. Fetch their security questions
    const sq = await prisma.user_security_questions.findUnique({
      where: { user_id: user.id },
    });

    if (!sq) {
      return { error: "No security questions have been set up for this account. Please contact support." };
    }

    // 3. Return ONLY the questions and the User ID (Never return the answers!)
    return {
      success: true,
      userId: user.id,
      q1: sq.question_1,
      q2: sq.question_2,
    };
  } catch (error: any) {
    console.error("Fetch Questions Error:", error);
    return { error: "An unexpected error occurred while fetching your security profile." };
  }
}

export async function verifyAnswersAndReset(userId: string, a1: string, a2: string, newPassword: string) {
  try {
    // 1. Fetch the encrypted/normalized answers from the database
    const sq = await prisma.user_security_questions.findUnique({
      where: { user_id: userId },
    });

    if (!sq) return { error: "Security profile not found." };

    // 2. Normalize the user's input to match the database exactly
    const normalizedA1 = a1.trim().toLowerCase();
    const normalizedA2 = a2.trim().toLowerCase();

    // 3. Verify
    if (normalizedA1 !== sq.answer_1 || normalizedA2 !== sq.answer_2) {
      return { error: "One or more answers are incorrect. Please try again." };
    }

    // 4. Success! Use the Supabase Admin API to instantly set their new password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return { error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Reset Password Error:", error);
    return { error: "An unexpected error occurred while resetting your password." };
  }
}