export const dynamic = "force-dynamic";

import Link from "next/link";
import { CheckCircle2, ShieldAlert } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { ClientActivation } from "@/components/invite/client-activation";
import { confirmClientPaymentAction } from "./actions";

function Shell({
  tone = "error",
  title,
  children,
}: {
  tone?: "error" | "warning" | "success";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : ShieldAlert;
  const color =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-orange-500"
        : "text-red-500";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Icon className={`mx-auto mb-4 size-12 ${color}`} />
        <h1 className="text-xl font-black text-slate-900">{title}</h1>
        <div className="mt-2 text-sm text-slate-500">{children}</div>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white no-underline hover:bg-slate-800"
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}

/**
 * Resumable activation for an accountant-invited client.
 *
 * The token is not consumed on arrival — only when the workspace is actually
 * provisioned. That makes the link safe to re-open: this page reads the
 * invitation's progress markers and drops the client back at the right step, so
 * closing the browser mid-flow (especially after paying) loses nothing.
 */
export default async function ClientActivationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const sessionId = typeof query.session_id === "string" ? query.session_id : null;

  // Stripe has just returned the client here — record the payment before deciding
  // which step to show, so a successful payment is never shown as unpaid.
  if (sessionId) {
    await confirmClientPaymentAction(token, sessionId);
  }

  const invite = await prisma.clientInvitation.findUnique({
    where: { token },
    select: {
      email: true,
      companyName: true,
      planCode: true,
      status: true,
      paidAt: true,
      expiresAt: true,
      onboardingMode: true,
    },
  });

  if (!invite) {
    return (
      <Shell title="Invalid Invitation Link">
        <p>This link may have been copied incorrectly, or the invitation was cancelled.</p>
      </Shell>
    );
  }

  if (invite.status === "established") {
    return (
      <Shell tone="success" title="Workspace Already Active">
        <p>
          <strong>{invite.companyName}</strong> is already set up. Sign in with{" "}
          <strong>{invite.email}</strong> to continue.
        </p>
      </Shell>
    );
  }

  // Expiry only blocks *starting*. Someone who already paid must always be able
  // to finish, or they would be charged with no way to reach their workspace.
  if (invite.expiresAt < new Date() && !invite.paidAt) {
    return (
      <Shell tone="warning" title="Invitation Expired">
        <p>
          This link expired on {invite.expiresAt.toLocaleDateString()}. Ask your accountant
          to resend the invitation.
        </p>
      </Shell>
    );
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { planCode: invite.planCode },
    select: { name: true, price: true, interval: true, trialDays: true },
  });

  // Mark the email as verified: reaching this page proves control of the mailbox,
  // since the tokenized link was only ever sent there.
  if (invite.status === "invited") {
    await prisma.clientInvitation.update({
      where: { token },
      data: { status: "verified", verifiedAt: new Date() },
    });
  }

  return (
    <ClientActivation
      token={token}
      email={invite.email}
      companyName={invite.companyName}
      planName={plan?.name ?? invite.planCode}
      planPrice={plan ? Number(plan.price) : 0}
      planInterval={plan?.interval ?? "month"}
      trialDays={plan?.trialDays ?? 0}
      alreadyPaid={Boolean(invite.paidAt)}
    />
  );
}
