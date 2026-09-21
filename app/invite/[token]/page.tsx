import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { runAsSystem } from "@/lib/tenancy/context"; // 🚀 Added to bypass tenant firewall
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { InviteSignupForm } from "./invite-signup-form";

// 🚀 FIXED: Next.js 15 requires params to be a Promise
export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  // 🚀 FIXED: Await the params before extracting the token
  const resolvedParams = await params;
  const token = resolvedParams.token;

  // 1. VERIFY THE TOKEN EXISTS IN THE DATABASE (Wrapped in runAsSystem)
  const invite = await runAsSystem(async () => {
    return await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { organization: true },
    });
  });

  // Handle Invalid Token
  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-12 text-red-500 mb-4" />
          <h1 className="text-xl font-black text-slate-900">Invalid Invitation Link</h1>
          <p className="mt-2 text-sm text-slate-500">This link may have been copied incorrectly or has already been used.</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  // Handle Expired Token
  if (invite.expiresAt < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-12 text-orange-500 mb-4" />
          <h1 className="text-xl font-black text-slate-900">Invitation Expired</h1>
          <p className="mt-2 text-sm text-slate-500">This secure link expired on {invite.expiresAt.toLocaleDateString()}. Please ask your administrator for a new invitation.</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  // Make sure to add this import at the very top of page.tsx:
  // import { InviteSignupForm } from "./invite-signup-form";

  // 2. CHECK IF THE USER IS CURRENTLY LOGGED IN
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // 🚀 NEW: Render the locked-down Invite Signup form! No public registration needed.
    return <InviteSignupForm invite={invite} token={token} />;
  }

  // 3. ENFORCE EMAIL MATCH SECURITY
  if (user.email !== invite.email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto size-12 text-red-500 mb-4" />
          <h1 className="text-xl font-black text-slate-900">Email Mismatch</h1>
          <p className="mt-2 text-sm text-slate-500">
            You are logged in as <strong>{user.email}</strong>, but this invite was sent to <strong>{invite.email}</strong>.
          </p>
          <p className="mt-2 text-xs text-slate-400">Please sign out and log in with the correct account to accept this workspace invitation.</p>
        </div>
      </div>
    );
  }

  // 4. CONSUME THE INVITE & GRANT ACCESS (Wrapped in runAsSystem)
  await runAsSystem(async () => {
    // Ensure they aren't already in the workspace somehow
    const existingRole = await prisma.userRole.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId: invite.organizationId },
      },
    });

    if (!existingRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          organizationId: invite.organizationId,
          role: invite.role,
        },
      });
    }

    // Delete the pending invitation so it can never be used again
    await prisma.workspaceInvitation.delete({
      where: { id: invite.id },
    });
  });

  // Redirect them directly into their new workspace!
  redirect("/dashboard");
}