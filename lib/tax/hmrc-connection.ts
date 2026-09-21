import "server-only";

import { prisma } from "@/lib/prisma";
import {
  refreshAccessToken,
  TOKEN_SAFETY_MARGIN_MS,
  type HmrcTokens,
} from "@/lib/tax/hmrc-mtd";
import { decryptToken, encryptToken } from "@/lib/tax/token-crypto";

/**
 * Storage and lifecycle of a workspace's HMRC authorisation.
 *
 * The access token lasts four hours, so any call more than a few hours after
 * the last one needs a refresh first. That is handled here rather than at each
 * call site, because forgetting it produces a 401 that looks like a revoked
 * grant and would wrongly prompt a business to reconnect.
 *
 * HMRC rotates the refresh token on every use, so a refresh must persist both
 * halves. Dropping the new refresh token would strand the connection at the
 * next renewal.
 *
 * Note the reads use findFirst, not findUnique: this model is org-scoped, and
 * the tenancy firewall refuses findUnique because it cannot inject an
 * organizationId into a unique-only where clause.
 */

export type HmrcConnectionStatus =
  | { state: "not_connected" }
  | { state: "needs_reauthorisation"; vrn: string; since: Date }
  /** Authorised, but for a different VAT number than the workspace now holds. */
  | { state: "vrn_changed"; vrn: string; currentVrn: string | null }
  | { state: "connected"; vrn: string; connectedAt: Date; expiresAt: Date };

export async function getHmrcConnectionStatus(
  organizationId: string,
): Promise<HmrcConnectionStatus> {
  const [connection, organization] = await Promise.all([
    prisma.hmrcConnection.findFirst({
      where: { organizationId },
      select: { vrn: true, createdAt: true, expiresAt: true, invalidatedAt: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vatRegistrationNo: true },
    }),
  ]);

  if (!connection) return { state: "not_connected" };
  if (connection.invalidatedAt) {
    return {
      state: "needs_reauthorisation",
      vrn: connection.vrn,
      since: connection.invalidatedAt,
    };
  }

  /*
   * The grant is tied to the VAT number it was issued for.
   *
   * HMRC authorises a specific enrolment, so calling for a different VRN than
   * the one consented to is refused with a 403 — and read as "the connection
   * broke" rather than "the VAT number changed underneath it". Caught here so
   * the settings page can say which of the two actually happened.
   */
  const currentVrn = organization?.vatRegistrationNo ?? null;
  if (currentVrn && currentVrn !== connection.vrn) {
    return { state: "vrn_changed", vrn: connection.vrn, currentVrn };
  }

  return {
    state: "connected",
    vrn: connection.vrn,
    connectedAt: connection.createdAt,
    expiresAt: connection.expiresAt,
  };
}

/** Replace any previous grant for this workspace. */
export async function saveHmrcConnection({
  organizationId,
  vrn,
  tokens,
  connectedBy,
}: {
  organizationId: string;
  vrn: string;
  tokens: HmrcTokens;
  connectedBy: string | null;
}): Promise<void> {
  const data = {
    vrn,
    accessToken: encryptToken(tokens.accessToken),
    refreshToken: encryptToken(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    connectedBy,
    // Reconnecting is precisely how a business clears a refused grant.
    invalidatedAt: null,
  };

  const existing = await prisma.hmrcConnection.findFirst({
    where: { organizationId },
    select: { id: true },
  });

  if (existing) {
    await prisma.hmrcConnection.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.hmrcConnection.create({ data: { ...data, organizationId } });
}

export async function disconnectHmrc(organizationId: string): Promise<void> {
  await prisma.hmrcConnection.deleteMany({ where: { organizationId } });
}

export type AccessTokenResult =
  | { ok: true; accessToken: string; vrn: string }
  | { ok: false; error: string; reauthorise: boolean };

/**
 * A usable access token for this workspace, refreshed if it is close to expiry.
 *
 * A grant HMRC has refused is marked rather than deleted: the business should
 * see "reconnect" on the settings page instead of the connection quietly
 * vanishing with no explanation of where it went.
 */
export async function getValidAccessToken(organizationId: string): Promise<AccessTokenResult> {
  const connection = await prisma.hmrcConnection.findFirst({
    where: { organizationId },
    select: {
      id: true,
      vrn: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      invalidatedAt: true,
    },
  });

  if (!connection) {
    return { ok: false, error: "This workspace is not connected to HMRC.", reauthorise: true };
  }
  if (connection.invalidatedAt) {
    return { ok: false, error: "The HMRC authorisation was refused.", reauthorise: true };
  }

  /*
   * A token sealed under a different key cannot be opened.
   *
   * Happens whenever the encryption key differs from the one that wrote the
   * row — a deployment configured with its own key, or a rotation. Decryption
   * throws by design (GCM authenticates the ciphertext), so it is caught here
   * and reported as "reconnect" rather than surfacing as a crash on the
   * settings and VAT pages. The row is marked so the reason is visible instead
   * of the connection appearing healthy and failing on every use.
   */
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptToken(connection.accessToken);
    refreshToken = decryptToken(connection.refreshToken);
  } catch {
    await prisma.hmrcConnection.update({
      where: { id: connection.id },
      data: { invalidatedAt: new Date() },
    });
    return {
      ok: false,
      error: "The stored HMRC authorisation could not be read on this server. Reconnect it.",
      reauthorise: true,
    };
  }

  if (connection.expiresAt.getTime() - TOKEN_SAFETY_MARGIN_MS > Date.now()) {
    return { ok: true, accessToken, vrn: connection.vrn };
  }

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.ok) {
    if (refreshed.reauthorise) {
      await prisma.hmrcConnection.update({
        where: { id: connection.id },
        data: { invalidatedAt: new Date() },
      });
    }
    return { ok: false, error: refreshed.error, reauthorise: refreshed.reauthorise };
  }

  // Both halves persisted: HMRC rotates the refresh token on every exchange.
  await prisma.hmrcConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptToken(refreshed.tokens.accessToken),
      refreshToken: encryptToken(refreshed.tokens.refreshToken),
      expiresAt: refreshed.tokens.expiresAt,
      scope: refreshed.tokens.scope,
    },
  });

  return { ok: true, accessToken: refreshed.tokens.accessToken, vrn: connection.vrn };
}
