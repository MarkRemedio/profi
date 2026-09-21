"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  getInvoiceTrackingSettings,
  saveInvoiceTrackingSettings,
} from "@/app/(dashboard)/sales/tracking-actions";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/documents/document-form-chrome";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/lib/query-keys";
import {
  TRACKING_DIMENSION_KEYS,
  type InvoiceTrackingSettingsDto,
  type TrackingDimensionKey,
} from "@/lib/accounting/tracking-types";

type DraftDimension = {
  key: TrackingDimensionKey;
  label: string;
  optionsText: string;
};

function draftDimensions(settings: InvoiceTrackingSettingsDto): DraftDimension[] {
  const byKey = new Map(settings.dimensions.map((dimension) => [dimension.key, dimension]));
  return TRACKING_DIMENSION_KEYS.map((key) => {
    const dimension = byKey.get(key);
    return {
      key,
      label:
        dimension && dimension.isActive
          ? dimension.label
          : key === "class"
            ? "Class"
            : key === "location"
              ? "Location"
              : "",
      optionsText: dimension?.options.filter((option) => option.isActive).map((option) => option.name).join("\n") ?? "",
    };
  });
}

function customSlotLabel(key: TrackingDimensionKey) {
  return `Custom ${key.slice("custom_".length)}`;
}

function TrackingSettingsEditor({ initial }: { initial: InvoiceTrackingSettingsDto }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [dimensions, setDimensions] = useState(() => draftDimensions(initial));
  // Custom slots start hidden: only the ones the user has actually created
  // (a label or values on file) render, the rest sit behind "Add custom field".
  const [visibleCustomKeys, setVisibleCustomKeys] = useState<TrackingDimensionKey[]>(() =>
    draftDimensions(initial)
      .filter((dimension) => dimension.key !== "class" && dimension.key !== "location")
      .filter((dimension) => dimension.label.trim() !== "" || dimension.optionsText.trim() !== "")
      .map((dimension) => dimension.key)
  );
  const [saving, setSaving] = useState(false);
  const [showFieldConfiguration, setShowFieldConfiguration] = useState(false);

  const update = (key: TrackingDimensionKey, patch: Partial<DraftDimension>) => {
    setDimensions((current) => current.map((dimension) => dimension.key === key ? { ...dimension, ...patch } : dimension));
  };

  // Configuring a field while tracking is hidden is the clearest possible
  // signal the user wants tracking — flip the switch for them and say so,
  // rather than letting them save fields that never appear. Removing a field
  // deliberately does NOT trigger this.
  const enableOnConfigure = () => {
    if (enabled) return;
    setEnabled(true);
    toast.info("Show Tracking turned on", {
      description: "Fields you configure appear on invoices after you save.",
    });
  };

  const visibleDimensions = dimensions.filter(
    (dimension) => dimension.key === "class" || dimension.key === "location" || visibleCustomKeys.includes(dimension.key)
  );
  const hiddenCustomKeys = dimensions
    .map((dimension) => dimension.key)
    .filter((key) => key !== "class" && key !== "location" && !visibleCustomKeys.includes(key));

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-4 text-blue-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Invoice Tracking</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Configure Class, Location, and up to three custom reporting fields without leaving invoice creation.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
          Show Tracking
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Show Tracking" />
        </label>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-800 sm:flex-row sm:items-center sm:justify-between">
          <p>Turning this off hides tracking inputs only. Existing invoice and ledger tracking is preserved.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowFieldConfiguration((current) => !current)}
            aria-expanded={showFieldConfiguration}
            className="h-8 shrink-0 justify-between gap-2 text-blue-700 hover:bg-blue-100 hover:text-blue-800 sm:justify-center"
          >
            Configure fields
            <ChevronDown className={`size-3.5 transition-transform ${showFieldConfiguration ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {/* Height animated rather than mounted and unmounted, so the panel
            closes as visibly as it opens — and a half-typed field list is
            still there when it reopens. */}
        <CollapsibleSection open={showFieldConfiguration}>
          <div className="grid gap-4 pt-1 lg:grid-cols-2">
            {visibleDimensions.map((dimension) => {
              const builtIn = dimension.key === "class" || dimension.key === "location";
              const slot = builtIn ? dimension.label : customSlotLabel(dimension.key);
              return (
                <div key={dimension.key} className="rounded-lg border border-slate-200 p-4">
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Field name
                      {!builtIn ? (
                        <button
                          type="button"
                          onClick={() => {
                            update(dimension.key, { label: "", optionsText: "" });
                            setVisibleCustomKeys((current) => current.filter((key) => key !== dimension.key));
                          }}
                          className="flex items-center gap-1 rounded px-1 py-0.5 font-bold normal-case tracking-normal text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-3" /> Remove
                        </button>
                      ) : null}
                    </span>
                    <input
                      value={dimension.label}
                      disabled={builtIn}
                      placeholder={slot}
                      maxLength={40}
                      onChange={(event) => {
                        enableOnConfigure();
                        update(dimension.key, { label: event.target.value });
                      }}
                      className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Selectable values</span>
                    <textarea
                      value={dimension.optionsText}
                      rows={4}
                      placeholder={builtIn ? `One ${dimension.label.toLowerCase()} per line` : "Name the field above, then add one value per line"}
                      onChange={(event) => {
                        enableOnConfigure();
                        update(dimension.key, { optionsText: event.target.value });
                      }}
                      className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500"
                    />
                  </label>
                </div>
              );
            })}
          </div>
          {hiddenCustomKeys.length > 0 ? (
            <div className="pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  enableOnConfigure();
                  const nextKey = hiddenCustomKeys[0];
                  setVisibleCustomKeys((current) => [...current, nextKey]);
                }}
                className="gap-2 bg-white font-bold text-blue-700"
              >
                <Plus className="size-3.5" />
                Add custom field
              </Button>
              <span className="ml-3 text-[11px] text-slate-400">
                Up to three custom reporting fields.
              </span>
            </div>
          ) : null}
        </CollapsibleSection>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveInvoiceTrackingSettings({
                  enabled,
                  dimensions: dimensions.map((dimension) => ({
                    key: dimension.key,
                    label: dimension.label,
                    options: dimension.optionsText.split(/\r?\n/),
                  })),
                });
                await queryClient.invalidateQueries({ queryKey: queryKeys.invoiceWorkspace });
                toast.success("Invoice tracking settings saved.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Tracking settings could not be saved.");
              } finally {
                setSaving(false);
              }
            }}
            className="gap-2 bg-blue-600 font-bold hover:bg-blue-700"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Tracking
          </Button>
        </div>
      </div>
    </section>
  );
}

export function InvoiceTrackingSettings() {
  const [settings, setSettings] = useState<InvoiceTrackingSettingsDto | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getInvoiceTrackingSettings()
      .then((result) => {
        if (!cancelled) setSettings(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings && !error) {
    /* Shaped like the panel it stands in for, not a grey slab. A placeholder of
       the wrong shape is worse than none: the page settles once for the block
       and again for the real thing, so the form below jumps twice. */
    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 size-4 text-slate-300" />
            <div className="space-y-2">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-9 animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
            <div className="h-3 w-80 max-w-full animate-pulse rounded bg-blue-100" />
            <div className="h-7 w-28 shrink-0 animate-pulse rounded-md bg-blue-100" />
          </div>
          <div className="flex justify-end">
            <div className="h-9 w-32 animate-pulse rounded-md bg-slate-200" />
          </div>
        </div>
      </section>
    );
  }
  if (error || !settings) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Tracking settings could not be loaded.</div>;
  }
  return <TrackingSettingsEditor initial={settings} />;
}
