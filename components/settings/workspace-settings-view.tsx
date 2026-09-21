"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Check, Coins, ImageIcon, Loader2, PanelLeft, Receipt, ShieldCheck, Trash2, Upload } from "lucide-react";

import { CurrencyPicker } from "@/components/currency/currency-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VatSettingsSection, type VatDraft } from "@/components/accounting/vat-settings-section";
import {
  TaxProfileSection,
  type TaxProfileDraft,
} from "@/components/accounting/tax-profile-section";
import { saveTaxProfile } from "@/app/(dashboard)/tax-profile-actions";
import { saveVatSettings } from "@/app/(dashboard)/vat-actions";
import { updateOrganizationSettings } from "@/app/(dashboard)/accounting/chart-of-accounts/actions";
import { saveOrganizationLogo } from "@/app/(dashboard)/workspace-settings-actions";
import { createClient } from "@/lib/supabase/client";
import { setOrgLogo } from "@/components/accounting/use-org-logo";
import { setWorkspaceCurrency } from "@/components/accounting/use-workspace-currency";
import { MenuLayoutCard } from "@/components/settings/menu-layout-card";
import type { WorkspaceSettingsBundle } from "@/app/(dashboard)/workspace-settings-actions";
import type { NotificationPreferences } from "@/app/(dashboard)/notification-preference-actions";
import { NotificationSettingsSection } from "@/components/settings/notification-settings-section";
import { HmrcConnectionSection } from "@/components/settings/hmrc-connection-section";
import type { HmrcPanelState } from "@/app/(dashboard)/hmrc-actions";
import { queryKeys } from "@/lib/query-keys";
import {
  WORKSPACE_DATE_FORMAT_OPTIONS,
  type WorkspaceDateFormat,
} from "@/lib/workspace-date-format";

/**
 * Workspace settings, one section at a time.
 *
 * Each card saves on its own. The dialog this replaces had a single Save that
 * ran all three in sequence and stopped at the first refusal — so a mistyped
 * VAT number also discarded a corrected year end, with nothing on screen to say
 * which half had been applied.
 *
 * Values come from the server already resolved, so every field is initialised
 * on mount and nothing arrives late to overwrite what has been typed.
 */
export function WorkspaceSettingsView({
  settings,
  notificationPreferences,
  hmrc,
}: {
  settings: WorkspaceSettingsBundle;
  notificationPreferences: NotificationPreferences;
  hmrc: HmrcPanelState;
}) {
  const { canManage } = settings;

  return (
    /* Full width, matching the other settings pages. The controls inside each
       card stay narrow — a text input stretched across a wide monitor is
       harder to read, not easier. */
    <div className="w-full space-y-6 pb-16">
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          Workspace Settings
        </h1>
        <p className="mt-1 text-slate-600">
          {/* Reads in the order the cards appear — a summary that lists them in
              a different order is a worse map than no summary. */}
          Your logo, date format and notifications, then the currency, VAT
          registration and tax profile for {settings.organization.name}.
        </p>
      </div>

      {!canManage && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <p className="m-0 text-sm text-slate-700">
              You can see these settings but not change them. Ask an owner or the accountant on
              this workspace.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ordered lightest first. The top three change how the workspace looks
          and sounds and can be undone by changing them back; everything below
          reaches into the books, where a wrong answer relabels posted figures
          or misfiles a return. Somebody arriving to set up their workspace
          should meet the harmless decisions before the consequential ones. */}

      {/* First of all: the only setting here whose effect the reader can see
          the moment they save it. */}
      <CompanyLogoCard settings={settings} />

      <DateFormatCard settings={settings} />

      <MenuLayoutCard />

      {/* Personal rather than workspace-wide — no canManage gate, because these
          are the signed-in user's own preferences. Grouped with the two above
          because all three are presentation; it also means the one card every
          viewer can actually change is not buried under four they cannot. */}
      <NotificationSettingsSection initial={notificationPreferences} />

      {/* Currency and VAT sit side by side once there is room; the tax profile
          has twice as many fields and keeps the full width to itself.
          Deliberately stretched rather than top-aligned: the currency card is
          much the taller of the two, and letting each take its natural height
          left the VAT card floating with a ragged gap beneath it. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CurrencyCard settings={settings} />
        <VatCard settings={settings} />
      </div>

      {/* Directly after the VAT card, because that is where the number it
          needs is entered — the panel's own empty state says so, and sending
          somebody back past a long form to find it made the instruction worse
          than useless. */}
      <HmrcConnectionSection state={hmrc} />

      {/* Last, as the longest form on the page and the one least likely to be
          filled in during a first visit. */}
      <TaxProfileCard settings={settings} />
    </div>
  );
}

/** The largest file worth accepting for something drawn at 32 pixels. */
const MAX_LOGO_MB = 2;

/**
 * The customer's own logo, shown in the sidebar beside their workspace name.
 *
 * Saved as soon as it is chosen rather than behind a Save button like the rest
 * of this page. The other cards hold a value somebody might want to reconsider
 * before committing; a picked image is already the decision, and the preview
 * beside it is the confirmation a Save button would otherwise be asking for.
 *
 * The file goes straight from the browser to storage, and only the resulting
 * URL is sent to the server — see saveOrganizationLogo for why.
 */
function CompanyLogoCard({ settings }: { settings: WorkspaceSettingsBundle }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState(settings.organization.logoUrl);

  const { canManage } = settings;
  const initial = settings.organization.name.charAt(0).toUpperCase() || "?";

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared straight away so choosing the same file twice — after a failed
    // upload, say — still fires a change event.
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("That is not an image. Try a PNG, SVG or JPG.");
      return;
    }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      toast.error(
        `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_LOGO_MB} MB.`
      );
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const extension = (file.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
      // Keyed by organisation so a workspace can only ever overwrite its own,
      // and suffixed with the clock so a replacement is not served from cache
      // under the old file's name.
      const path = `org-logos/${settings.organization.name
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .slice(0, 40)}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("workspace_assets")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("workspace_assets").getPublicUrl(path);

      await saveOrganizationLogo(publicUrl);
      setLogoUrl(publicUrl);
      setOrgLogo(publicUrl);
      toast.success("Logo saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That logo could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      // The stored file is left in place. Deleting it would break any older
      // render still pointing at it, and it costs a few kilobytes to keep.
      await saveOrganizationLogo(null);
      setLogoUrl(null);
      setOrgLogo(null);
      toast.success("Logo removed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The logo could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="company-logo">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ImageIcon className="size-5 text-blue-600" />
          <CardTitle className="text-base">Company logo</CardTitle>
        </div>
        <CardDescription>
          Optional. Shown in the sidebar next to your workspace name, under the WAWPROFI mark
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* Drawn at the size the sidebar draws it, on the same background,
              so what is shown here is what will be there. */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-xl font-extrabold text-white shadow-md">
              W
            </div>
            {/* Same treatment as the sidebar, chip and all — a preview that
                frames the logo differently from the real thing is not a
                preview. */}
            <div
              className={
                logoUrl
                  ? "grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-transparent"
                  : "grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700 shadow-sm"
              }
            >
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="" className="size-full object-contain" />
              ) : (
                initial
              )}
            </div>
            <span className="max-w-[10rem] truncate text-sm font-bold text-slate-700">
              {settings.organization.name || "Your workspace"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={pick}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!canManage || busy}
                onClick={() => fileInput.current?.click()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Working…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 size-3.5" />
                    {logoUrl ? "Replace" : "Upload logo"}
                  </>
                )}
              </Button>

              {logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canManage || busy}
                  onClick={remove}
                  className="text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Remove
                </Button>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              PNG, SVG or JPG, up to {MAX_LOGO_MB} MB. A square image on a transparent background
              works best — it is drawn small and sits on the sidebar with nothing behind it.
              Replacing or removing a logo deletes the old file. Leave it empty and we will use
              the first letter of your name instead.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** How supported accounting screens present stored ISO dates. */
function DateFormatCard({ settings }: { settings: WorkspaceSettingsBundle }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [dateFormat, setDateFormat] = useState<WorkspaceDateFormat>(
    settings.organization.dateFormat
  );
  const dirty = dateFormat !== settings.organization.dateFormat;

  function save() {
    startSaving(async () => {
      try {
        await updateOrganizationSettings({ dateFormat });
        toast.success("Date format saved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the date format.");
      }
    });
  }

  return (
    <Card id="date-format">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-blue-600" />
          <CardTitle className="text-base">Date format</CardTitle>
        </div>
        <CardDescription>How dates are displayed on supported accounting screens</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <label
            className="mb-1.5 block text-xs font-medium text-slate-600"
            htmlFor="date-format-select"
          >
            Display format
          </label>
          <Select
            value={dateFormat}
            onValueChange={(value) => setDateFormat(value as WorkspaceDateFormat)}
            disabled={!settings.canManage}
          >
            <SelectTrigger id="date-format-select" className="h-10 w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKSPACE_DATE_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} — {option.example}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            This changes presentation only. Accounting dates remain stored in the same safe,
            unambiguous format.
          </p>
        </div>

        <SaveRow saving={saving} dirty={dirty} canManage={settings.canManage} onSave={save} />
      </CardContent>
    </Card>
  );
}

/** Base currency and whether foreign-currency documents are allowed. */
function CurrencyCard({ settings }: { settings: WorkspaceSettingsBundle }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [baseCurrency, setBaseCurrency] = useState(settings.organization.baseCurrency);
  const [multicurrencyEnabled, setMulticurrencyEnabled] = useState(
    settings.organization.multicurrencyEnabled
  );

  const lock = settings.currencyLock;
  const dirty =
    baseCurrency !== settings.organization.baseCurrency ||
    multicurrencyEnabled !== settings.organization.multicurrencyEnabled;

  function save() {
    startSaving(async () => {
      try {
        await updateOrganizationSettings({ baseCurrency, multicurrencyEnabled });
        /* Published before the refresh, and the reason a refresh alone was not
           enough: the shell reads the organisation from a hook that fetches
           once on mount, and the shell lives in the layout so it never
           remounts. router.refresh() re-renders the server tree without
           touching that client state, so every other page kept the old
           currency until a hard reload. */
        setWorkspaceCurrency({ currency: baseCurrency, multicurrencyEnabled });
        toast.success("Currency settings saved");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save your currency settings."
        );
      }
    });
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Coins className="size-5 text-blue-600" />
          <CardTitle className="text-base">Currency</CardTitle>
        </div>
        <CardDescription>What your books are kept in, and what you may invoice in</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">Base currency</label>
          {/* Searchable, not a flat list. This was a Select over every
              supported code, which was fine at five and unusable at a hundred
              and one — and it could not answer the question somebody with an
              unsupported currency actually has. The picker searches on country
              too, so "Australia" finds AUD. */}
          <div className="max-w-sm">
            <CurrencyPicker
              value={baseCurrency}
              onChange={setBaseCurrency}
              disabled={!settings.canManage || lock.locked}
              size="field"
            />
          </div>
          {lock.locked ? (
            <p className="mt-1.5 text-xs leading-relaxed text-amber-700">
              {lock.reason} Converting existing figures is a migration rather than a settings
              change — talk to support if you need it.
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Every transaction uses this. It can only be changed while the workspace has no
              recorded transactions, because existing amounts are relabelled rather than converted.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
          <Checkbox
            checked={multicurrencyEnabled}
            disabled={!settings.canManage}
            onCheckedChange={(checked) => setMulticurrencyEnabled(checked === true)}
            className="mt-0.5"
          />
          <div className="text-sm">
            <p className="m-0 font-medium text-slate-800">Enable multicurrency</p>
            <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
              Raise invoices and bills in another currency. Each one records the exchange rate it
              was issued at, and your books stay in the base currency above. When a foreign
              document is settled at a different rate, the difference is posted to Foreign Exchange
              Gain or Loss.
            </p>
          </div>
        </div>

        <SaveRow saving={saving} dirty={dirty} canManage={settings.canManage} onSave={save} />
      </CardContent>
    </Card>
  );
}

/** VAT registration, verified against HMRC where possible. */
function VatCard({ settings }: { settings: WorkspaceSettingsBundle }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [vat, setVat] = useState<VatDraft>({
    vatRegistered: settings.vat.vatRegistered,
    vatNumber: settings.vat.vatNumber ?? "",
  });

  const dirty =
    vat.vatRegistered !== settings.vat.vatRegistered ||
    vat.vatNumber !== (settings.vat.vatNumber ?? "");

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveVatSettings(vat);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Every screen offering VAT reads it from a cached workspace query, so
      // without this the invoice and bill dialogs keep the old answer until the
      // page is reloaded — the setting appeared to save and do nothing.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace }),
        queryClient.invalidateQueries({ queryKey: queryKeys.billWorkspace }),
        queryClient.invalidateQueries({ queryKey: queryKeys.salesReceiptWorkspace }),
        queryClient.invalidateQueries({ queryKey: queryKeys.refundReceiptWorkspace }),
      ]);

      toast.success("VAT settings saved");
      router.refresh();
    });
  }

  return (
    <Card id="vat" className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="size-5 text-blue-600" />
          <CardTitle className="text-base">VAT registration</CardTitle>
        </div>
        <CardDescription>Decides whether your documents carry VAT at all</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-5">
        {/* Keyed on the saved number so a successful save clears the previous
            check result. It was left on screen afterwards, and a red "HMRC has
            no registration for this number" sitting under a number that just
            saved reads as the save having failed. The key is stable while
            typing — only a save changes it. */}
        <VatSettingsSection
          key={settings.vat.vatNumber ?? ""}
          value={vat}
          onChange={setVat}
          canManage={settings.canManage}
          error={error}
        />
        <SaveRow saving={saving} dirty={dirty} canManage={settings.canManage} onSave={save} />
      </CardContent>
    </Card>
  );
}

/** Structure, year end and the references a return is filed under. */
function TaxProfileCard({ settings }: { settings: WorkspaceSettingsBundle }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial: TaxProfileDraft = {
    structure: settings.taxProfile.structure ?? "",
    financialYearEnd: settings.taxProfile.financialYearEnd ?? "",
    isCisContractor: settings.taxProfile.isCisContractor,
    companyNumber: settings.taxProfile.companyNumber ?? "",
    taxReference: settings.taxProfile.taxReference ?? "",
    industry: settings.taxProfile.industry ?? "",
  };
  const [profile, setProfile] = useState<TaxProfileDraft>(initial);

  const dirty = (Object.keys(initial) as Array<keyof TaxProfileDraft>).some(
    (key) => profile[key] !== initial[key]
  );

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveTaxProfile({
        structure: profile.structure || null,
        financialYearEnd: profile.financialYearEnd || null,
        isCisContractor: profile.isCisContractor,
        companyNumber: profile.companyNumber,
        taxReference: profile.taxReference,
        industry: profile.industry,
        // payeReference is deliberately not sent. saveTaxProfile only writes a
        // field it is given, so any value already stored is left untouched
        // rather than blanked by a form that no longer asks for it.
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Tax profile saved");
      router.refresh();
    });
  }

  return (
    <Card id="tax-profile">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-blue-600" />
          <CardTitle className="text-base">Tax profile</CardTitle>
        </div>
        <CardDescription>
          Which taxes apply to this business, when its year ends, and the references it files under
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <TaxProfileSection
          value={profile}
          onChange={setProfile}
          canManage={settings.canManage}
          error={error}
        />
        <SaveRow saving={saving} dirty={dirty} canManage={settings.canManage} onSave={save} />
      </CardContent>
    </Card>
  );
}

/**
 * A section's save button.
 *
 * Disabled until something actually changes, so it is obvious which sections
 * have edits outstanding when several are open at once.
 */
function SaveRow({
  saving,
  dirty,
  canManage,
  onSave,
}: {
  saving: boolean;
  dirty: boolean;
  canManage: boolean;
  onSave: () => void;
}) {
  return (
    // mt-auto so the button sits on the bottom edge of a stretched card rather
    // than floating directly under content that ran short.
    <div className="mt-auto flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
      {!saving && !dirty && (
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Check className="size-3.5" />
          Saved
        </span>
      )}
      <Button size="sm" onClick={onSave} disabled={saving || !dirty || !canManage}>
        {saving ? (
          <>
            <Loader2 className="mr-2 size-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          "Save"
        )}
      </Button>
    </div>
  );
}
