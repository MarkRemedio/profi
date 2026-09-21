"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { revalidatePath } from "next/cache";
import { MemberRole } from "@prisma/client";
import { passwordProblemMessage } from "@/lib/auth/password-rules";
import crypto from "crypto"; // 🚀 Added to generate secure invitation tokens
import nodemailer from "nodemailer"; // 🚀 Added for real SMTP email delivery

// 🚀 1. INVITE / ADD TEAM MEMBER WITH SEAT ENFORCEMENT & PENDING INVITES
export async function inviteTeamMemberAction(organizationId: string, email: string, role: MemberRole, customFeatures: string[] = []) {
  if (!organizationId || !email) throw new Error("Missing required fields.");
  const cleanEmail = email.toLowerCase().trim();

  // A. Fetch organization along with subscription plan seats, current members, AND pending invites
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      subscriptionPlan: true,
      members: true,
      invitations: true, // 🚀 Pulls in pending invites for accurate seat calculation
    },
  });

  if (!org) throw new Error("Organization not found.");

  const maxSeats = org.subscriptionPlan?.seats ?? 3; // Default fallback to 3 seats
  // 🚀 The true seat count is Active Members + Pending Invites
  const currentSeatUsage = org.members.length + org.invitations.length;

  // B. Enforce Seat Limit Constraints (Skip check if maxSeats is -1/Unlimited)
  if (maxSeats !== -1 && currentSeatUsage >= maxSeats) {
    return {
      success: false,
      error: "Plan Limit Reached",
      message: `Your plan only allows up to ${maxSeats} user seats (including pending invites). Please upgrade your plan.`
    };
  }

  // C. Find the user by email in the auth/public users tracking table
  const targetUser = await prisma.users.findFirst({
    where: { email: cleanEmail },
  });

  if (targetUser) {
    // 🟢 SCENARIO 1: THE USER ALREADY HAS AN ACCOUNT ON YOUR APP
    const existingRole = await prisma.userRole.findFirst({
      where: {
        userId: targetUser.id,
        organizationId: organizationId,
      },
    });

    if (existingRole) {
      return { success: false, error: "Duplicate User", message: "This user is already an active member of your organization." };
    }

    // Grant access instantly inside this organization space
    await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: organizationId,
        role: role,
        customFeatures: customFeatures, // 🚀 SAVE CUSTOM MODULES FOR EXISTING USER
      },
    });
  } else {
    // 🟠 SCENARIO 2: THE USER IS BRAND NEW (Create a Pending Invitation)
    // findFirst (not findUnique): WorkspaceInvitation is org-scoped, and the
    // tenancy extension rejects findUnique on scoped models. The explicit
    // organizationId keeps the lookup tenant-bounded.
    const existingInvite = await prisma.workspaceInvitation.findFirst({
      where: { email: cleanEmail, organizationId }
    });

    if (existingInvite) {
      return { success: false, error: "Duplicate Invite", message: "An invitation has already been sent to this email address." };
    }

    // Generate a secure 64-character random token
    const token = crypto.randomUUID() + crypto.randomUUID(); 
    
    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); 

    // Create the pending invitation row in the new table
    await prisma.workspaceInvitation.create({
      data: {
        email: cleanEmail,
        role,
        customFeatures: customFeatures, // 🚀 SAVE CUSTOM MODULES TO PENDING INVITE
        organizationId,
        token,
        expiresAt,
      }
    });

    // 🚀 SEND REAL EMAIL VIA NODEMAILER
    const appUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://waw-profi.vercel.app";
    const inviteLink = `${appUrl.replace(/\/$/, "")}/invite/${token}`;

   const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // false for port 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // 🚀 ADD THIS TLS BLOCK TO FIX THE CERTIFICATE ERROR:
      tls: {
        rejectUnauthorized: false,
      },
    });
    await transporter.sendMail({
      from: `"WAWPROFI Cloud" <${process.env.SMTP_USER}>`,
      to: cleanEmail,
      subject: `Invitation: Join ${org.name} on WAWPROFI`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; min-height: 100vh;">
          
          <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
            
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 900; font-size: 24px; width: 50px; height: 50px; line-height: 50px; border-radius: 14px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);">
                W
              </div>
              <div style="color: #0f172a; font-size: 18px; font-weight: 900; margin-top: 16px; letter-spacing: -0.5px;">WAWPROFI</div>
            </div>
            
            <h2 style="color: #0f172a; font-size: 24px; font-weight: 800; text-align: center; margin-top: 0; margin-bottom: 24px; letter-spacing: -0.5px;">Join the team</h2>
            
            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 20px; text-align: center;">
              You've been invited to collaborate in <strong style="color: #0f172a;">${org.name}</strong> with <strong>${role}</strong> access.
            </p>
            
            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 35px; text-align: center;">
              Set up your secure credentials to access the workspace dashboard and begin working with your team.
            </p>
            
            <div style="text-align: center; margin-bottom: 10px;">
              <a href="${inviteLink}" style="background-color: #f97316; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(249, 115, 22, 0.25);">
                Accept Invitation
              </a>
            </div>
            
          </div>
          
          <div style="text-align: center; margin-top: 32px; max-width: 500px; margin-left: auto; margin-right: auto;">
            <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">
              This is a secure invitation sent via WAWPROFI Cloud Administration.<br>
              If you did not expect this invitation, you can safely ignore this email.
            </p>
          </div>
          
        </div>
      `,
    });
  }

  revalidatePath("/settings/profile-access");
  return { success: true };
}

// 🚀 2. CHANGE AN EXISTING USER'S ROLE ACCESS PRIVILEGES
export async function updateUserRoleAction(roleId: string, nextRole: MemberRole, customFeatures: string[] = []) {
  await prisma.userRole.update({
    where: { id: roleId },
    data: { 
      role: nextRole,
      // 🚀 If they switch back to an Employee, wipe the custom array. Otherwise, save the new checkboxes!
      customFeatures: nextRole === "CUSTOM" ? customFeatures : [] 
    },
  });
  
  revalidatePath("/settings/profile-access");
}

// 🚀 3. REMOVE / REVOKE A USER'S ACCESS (AND NUKE THEIR AUTH ACCOUNT)
export async function removeTeamMemberAction(roleId: string) {
  const { runAsSystem } = await import("@/lib/tenancy/context");
  
  await runAsSystem(async () => {
    // 1. Fetch the userRole record so we know exactly WHICH user ID to destroy
    const roleRecord = await prisma.userRole.findUnique({
      where: { id: roleId },
      select: { userId: true },
    });

    if (!roleRecord) throw new Error("Role record not found.");
    const targetUserId = roleRecord.userId;

    // 2. Spin up the Supabase Admin Client
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // 🔒 Required to bypass standard user permissions
    );

    // 3. NUKE FROM SUPABASE AUTH: This destroys their ability to log in forever.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    
    if (authDeleteError) {
      throw new Error(`Failed to delete authentication profile: ${authDeleteError.message}`);
    }

    // 4. NUKE FROM YOUR DATABASE: Ensure they are wiped from your public tracking tables
    await prisma.users.delete({
      where: { id: targetUserId }
    }).catch(() => {
      // Catch in case Supabase cascade already deleted them
    });
  });

  revalidatePath("/settings/profile-access");
}

// 🚀 4. UPDATE PERSONAL USER PROFILE METADATA
export async function updateProfileMetadataAction(userId: string, firstName: string, lastName: string) {
  if (!userId) throw new Error("Authentication context invalid.");

  // Fetch existing metadata to merge changes safely without losing other keys
  const targetUser = await prisma.users.findUnique({
    where: { id: userId },
  });

  const currentMeta = (targetUser?.raw_user_meta_data as Record<string, any>) || {};

  await prisma.users.update({
    where: { id: userId },
    data: {
      raw_user_meta_data: {
        ...currentMeta,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        display_name: `${firstName} ${lastName}`.trim(),
      },
    },
  });

  revalidatePath("/settings/profile-access");
  return { success: true };
}

// 🚀 5. TRIGGER SECURE PASSWORD RESET TRANSACT EMAIL
export async function triggerPasswordResetAction(email: string) {
  // We import dynamically to avoid initialization ordering problems on compilation
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
  });

  if (error) throw new Error(error.message);
  return { success: true };
}

// 🚀 6. SECURELY ACCEPT INVITE & AUTO-CONFIRM ACCOUNT
export async function acceptInviteAndCreateAccountAction(token: string, firstName: string, lastName: string, password: string) {
  // Checked here, not only in the form. This action is reachable directly over
  // HTTP, and it previously handed the password straight to Supabase — so a
  // teammate joining an existing workspace could set a weaker password than
  // anyone signing up for their own, which is backwards: they are being given
  // access to somebody else's books.
  const problem = passwordProblemMessage(password);
  if (problem) throw new Error(problem);

  // We use the Supabase Admin client to bypass email confirmation since they already clicked the secure link!
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // 🔒 Requires your Service Role Key from .env.local
  );

  const { runAsSystem } = await import("@/lib/tenancy/context");

  return await runAsSystem(async () => {
    // 1. Verify the token is still valid
    const invite = await prisma.workspaceInvitation.findUnique({ where: { token } });
    if (!invite) throw new Error("Invalid or expired invitation token.");
    if (invite.expiresAt < new Date()) throw new Error("This invitation has expired.");

    // 2. Create the user with Auto-Confirm turned ON
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password: password,
      email_confirm: true, // 🚀 MAGIC: Skips the confirmation email entirely!
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        display_name: `${firstName} ${lastName}`.trim(),
      }
    });

    if (authError || !authData.user) throw new Error(authError?.message || "Failed to create user.");

    // 3. Grant them access to the Workspace
    await prisma.userRole.create({
      data: {
        userId: authData.user.id,
        organizationId: invite.organizationId,
        role: invite.role,
        customFeatures: invite.customFeatures, // 🚀 TRANSFER CUSTOM CHECKBOXES TO ACTIVE ROLE
      },
    });

    // 4. Delete the invite so it can't be reused
    await prisma.workspaceInvitation.delete({ where: { id: invite.id } });

    // Return the email so the client can automatically log them in!
    return { success: true, email: invite.email };
  });
}
// 🚀 7. REVOKE A PENDING INVITATION
export async function revokeInvitationAction(inviteId: string) {
  // Authenticate and resolve the caller's org. Without this, any signed-in user
  // could delete any org's invitation by id (cross-tenant IDOR). `delete` is a
  // UNIQUE_PASSTHROUGH op in the tenancy extension — it is NOT auto-scoped — so
  // the org boundary must be enforced explicitly in the `where` here.
  const { organizationId } = await requireAccountantRole();

  const { count } = await prisma.workspaceInvitation.deleteMany({
    where: { id: inviteId, organizationId },
  });

  if (count === 0) {
    throw new Error("Invitation not found.");
  }

  revalidatePath("/settings/profile-access");
}