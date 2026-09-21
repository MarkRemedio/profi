import "server-only";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import type { HmrcTokens } from "@/lib/tax/hmrc-mtd";
import { encryptToken } from "@/lib/tax/token-crypto";

/**
 * HMRC authorisations granted before their workspace exists.
 *
 * Onboarding lets somebody connect while still in the wizard. At that moment
 * there is no organisation for the grant to belong to — the workspace is only
 * created once checkout completes — so the tokens wait here against the person
 * who granted them and are adopted at provisioning.
 *
 * These are filing credentials with no business attached, which is a thing
 * worth being uncomfortable about. Two rules follow from it:
 *
 *  - they expire on their own, whether or not anyone ever claims them, so an
 *    abandoned signup cannot leave one lying about;
 *  - they are only ever read by the id of the person in the current session,
 *    never searched by VAT number or anything else a caller could guess.
 *
 * Not org-scoped, so the tenancy firewall cannot inject an organisation and
 * every call runs as system. The guard is the session, checked by the caller.
 */

/** How long an unclaimed grant survives. Long enough to finish checkout, no longer. */
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

export async function savePendingConnection({
  userId,
  vrn,
  tokens,
}: {
  userId: string;
  vrn: string;
  tokens: HmrcTokens;
}): Promise<void> {
  const data = {
    vrn,
    accessToken: encryptToken(tokens.accessToken),
    refreshToken: encryptToken(tokens.refreshToken),
    tokenExpires: tokens.expiresAt,
    scope: tokens.scope,
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  };

  await runAsSystem(async () => {
    await prisma.hmrcPendingConnection.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  });
}

export type PendingConnection = { vrn: string; createdAt: Date };

/** What this person has authorised and not yet had adopted, if anything. */
export async function getPendingConnection(userId: string): Promise<PendingConnection | null> {
  return runAsSystem(async () => {
    const row = await prisma.hmrcPendingConnection.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { vrn: true, createdAt: true },
    });
    return row ?? null;
  });
}

/**
 * Move a pending grant onto a workspace.
 *
 * Refuses when the VAT number does not match the one the workspace ended up
 * with: HMRC authorised one specific registration, and adopting it against a
 * different number would produce a connection that looks healthy and is refused
 * by HMRC on every call. The row is cleared either way — a grant for the wrong
 * number is no more use later than it is now.
 *
 * Returns whether a connection was actually created, so the caller can decide
 * whether to send the person to HMRC after all.
 */
export async function adoptPendingConnection({
  userId,
  organizationId,
  vrn,
}: {
  userId: string;
  organizationId: string;
  vrn: string | null;
}): Promise<boolean> {
  return runAsSystem(async () => {
    const pending = await prisma.hmrcPendingConnection.findFirst({ where: { userId } });
    if (!pending) return false;

    const usable = Boolean(vrn) && pending.vrn === vrn && pending.expiresAt > new Date();

    if (usable) {
      // The tokens are already sealed; they move across as they are rather than
      // being decrypted and re-encrypted for no reason.
      await prisma.hmrcConnection.upsert({
        where: { organizationId },
        update: {
          vrn: pending.vrn,
          accessToken: pending.accessToken,
          refreshToken: pending.refreshToken,
          expiresAt: pending.tokenExpires,
          scope: pending.scope,
          connectedBy: userId,
          invalidatedAt: null,
        },
        create: {
          organizationId,
          vrn: pending.vrn,
          accessToken: pending.accessToken,
          refreshToken: pending.refreshToken,
          expiresAt: pending.tokenExpires,
          scope: pending.scope,
          connectedBy: userId,
        },
      });
    }

    await prisma.hmrcPendingConnection.delete({ where: { id: pending.id } });
    return usable;
  });
}

/** Delete grants nobody claimed. Called by the nightly sweep. */
export async function purgeExpiredPendingConnections(): Promise<number> {
  return runAsSystem(async () => {
    const result = await prisma.hmrcPendingConnection.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  });
}
