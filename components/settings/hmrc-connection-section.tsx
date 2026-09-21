"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Landmark, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { disconnectHmrcAction, type HmrcPanelState } from "@/app/(dashboard)/hmrc-actions";

/**
 * Messages for the `?hmrc=` marker the OAuth routes redirect back with.
 *
 * Every failure the journey can end in is named. A silent return to settings
 * with nothing changed is the worst outcome: the business cannot tell whether
 * it worked, and tries again with the same result.
 */
const OUTCOMES: Record<string, { tone: "success" | "error"; message: string }> = {
  connected: { tone: "success", message: "Connected to HMRC." },
  declined: { tone: "error", message: "Authorisation was declined at HMRC." },
  forbidden: { tone: "error", message: "You do not have permission to connect HMRC." },
  not_configured: { tone: "error", message: "HMRC credentials are not configured on this server." },
  no_key: { tone: "error", message: "HMRC_TOKEN_KEY is not set, so the authorisation could not be stored." },
  no_vat_number: {
    tone: "error",
    message: "Add and save your VAT number above before connecting to HMRC.",
  },
  bad_state: {
    tone: "error",
    message: "That authorisation could not be verified. Start the connection again.",
  },
  wrong_workspace: {
    tone: "error",
    message: "The workspace changed during authorisation. Start again from this workspace.",
  },
  exchange_failed: { tone: "error", message: "HMRC would not issue a token. Try again shortly." },
};

/**
 * How long HMRC honours one authorisation, in months.
 *
 * Set per application on HMRC's Developer Hub as "Application grant length",
 * and not discoverable at runtime — the token response carries expires_in for
 * the four-hour access token, never the life of the grant itself. So it is
 * stated here, in one place, rather than repeated as a number inside a
 * sentence. If HMRC changes the grant on the application, change it here.
 *
 * Refreshing does not extend it: the window runs from the original
 * authorisation, after which the business has to authorise again.
 */
const GRANT_LENGTH_MONTHS = 18;

/** The date this authorisation stops being renewable, as "14 February 2028". */
function grantExpiryLabel(connectedAt: string): string {
  const expiry = new Date(connectedAt);
  expiry.setMonth(expiry.getMonth() + GRANT_LENGTH_MONTHS);
  return expiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function HmrcConnectionSection({ state }: { state: HmrcPanelState }) {
  const router = useRouter();
  const params = useSearchParams();
  const [disconnecting, startDisconnect] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const outcome = params.get("hmrc");
  const result = outcome ? OUTCOMES[outcome] : null;

  /*
   * The outcome is rendered inline below, not only as a toast.
   *
   * A failed journey redirects back to this same page, so a message that fades
   * after a few seconds is indistinguishable from the button having done
   * nothing at all — which is exactly how the first failures were reported.
   * The banner stays until the next attempt.
   */
  useEffect(() => {
    if (!result) return;
    if (result.tone === "success") toast.success(result.message);
    else toast.error(result.message);
  }, [result]);

  function handleDisconnect() {
    startDisconnect(async () => {
      const result = await disconnectHmrcAction();
      if (result.ok) {
        toast.success("Disconnected from HMRC.");
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const connected = state.status.state === "connected";
  const needsReauth = state.status.state === "needs_reauthorisation";
  const vrnChanged = state.status.state === "vrn_changed";

  /** HMRC addresses a business by VAT number, so one has to be saved first. */
  const canConnect = Boolean(state.vatNumber) && state.available;
  const connectLabel = connected
    ? "Reconnect"
    : needsReauth || vrnChanged
      ? "Reconnect to HMRC"
      : "Connect to HMRC";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="size-5 text-blue-600" />
          <CardTitle className="text-base">HMRC connection</CardTitle>
        </div>
        <CardDescription>
          Links this business to HMRC Making Tax Digital so your VAT return periods and deadlines
          come from HMRC rather than being worked out here.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {result && result.tone === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
            <div>
              <p className="m-0 text-sm font-bold text-red-900">Connection did not complete</p>
              <p className="m-0 mt-0.5 text-xs text-red-800">{result.message}</p>
              {/* The raw marker, so a report of "it did not work" can name which
                  step gave up rather than describing a page that looked idle. */}
              <p className="m-0 mt-1 font-mono text-[10px] text-red-500">reason: {outcome}</p>
            </div>
          </div>
        )}

        {!state.available && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="m-0 text-sm text-amber-900">{state.unavailableReason}</p>
          </div>
        )}

        {connected && state.status.state === "connected" && (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="m-0 text-sm font-bold text-emerald-900">
                  Connected · VAT {state.status.vrn}
                </p>
                <p className="m-0 mt-0.5 text-xs text-emerald-800">
                  Authorised{" "}
                  {new Date(state.status.connectedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  . Renews on its own until {grantExpiryLabel(state.status.connectedAt)}, then
                  needs authorising again.
                </p>
              </div>
            </div>
          </div>
        )}

        {needsReauth && state.status.state === "needs_reauthorisation" && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
            <div>
              <p className="m-0 text-sm font-bold text-red-900">
                HMRC no longer accepts this authorisation
              </p>
              <p className="m-0 mt-0.5 text-xs text-red-800">
                The grant for VAT {state.status.vrn} expired or was revoked at HMRC. Reconnect to
                carry on.
              </p>
            </div>
          </div>
        )}

        {vrnChanged && state.status.state === "vrn_changed" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="m-0 text-sm font-bold text-amber-900">Your VAT number has changed</p>
              <p className="m-0 mt-0.5 text-xs text-amber-800">
                HMRC authorised this software for VAT {state.status.vrn}, but this workspace now
                holds {state.status.currentVrn}. HMRC refuses a request for a number it did not
                grant, so reconnect to authorise the new one.
              </p>
            </div>
          </div>
        )}

        {/* Said before the button rather than after it. HMRC addresses VAT by
            registration number, so without one the journey can only end back
            here — and being sent to a government sign-in only to be returned
            with an error reads as the software being broken. */}
        {!state.vatNumber && !connected && (
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-slate-800">
                Add your VAT registration number first
              </p>
              <p className="m-0 mt-0.5 text-xs leading-relaxed text-slate-600">
                HMRC identifies a business by that number, so there is nothing to connect without
                it. Enter it in VAT registration above and save.
              </p>
            </div>
          </div>
        )}

        {state.canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Two branches rather than a toggled asChild: Slot passes its
                child straight through, so the disabled form needs the label and
                icon as direct children of the button. Wrapping them in a span
                left that span laid out inline, which pushed the icon onto a
                second line inside the button. */}
            {canConnect ? (
              // A plain link, not fetch: HMRC's consent screen is a full
              // navigation the person has to see and sign in to.
              <Button asChild variant={connected ? "outline" : "default"}>
                <a href="/api/hmrc/connect">
                  {connectLabel}
                  <ExternalLink className="size-4 opacity-70" />
                </a>
              </Button>
            ) : (
              <Button disabled variant={connected ? "outline" : "default"}>
                {connectLabel}
                <ExternalLink className="size-4 opacity-70" />
              </Button>
            )}

            {(connected || needsReauth || vrnChanged) &&
              (confirming ? (
                <>
                  <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Confirm disconnect
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirming(true)}>
                  <Unplug className="mr-2 size-4" />
                  Disconnect
                </Button>
              ))}
          </div>
        ) : (
          <p className="m-0 text-sm text-slate-500">
            Only an owner or the accountant on this workspace can change the HMRC connection.
          </p>
        )}

        {/* Only the half that applies. Explaining what disconnecting does to
            somebody with nothing connected is noise on an already busy card. */}
        <p className="m-0 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          {connected || needsReauth || vrnChanged
            ? "Disconnecting here removes our copy of the authorisation — to withdraw it at HMRC as well, remove this software from the authorised list in your own HMRC account."
            : "You will be sent to HMRC to sign in with your Government Gateway account. Nothing is shared with HMRC until you grant permission there."}
        </p>

        {/* No callback URL shown here.
            It belonged to whoever set this application up on HMRC's Developer
            Hub — one registration covering every workspace — not to the
            businesses authorising it. On a customer's settings page it read as
            a step they had to perform. */}
      </CardContent>
    </Card>
  );
}
