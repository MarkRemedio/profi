"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Save, Eye, Palette, FileText, Layout, Maximize, PanelRightClose, PanelRightOpen, X, ZoomIn } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandingFields } from "../shared/branding-fields";
import { useTemplateBranding } from "../shared/use-template-branding";
import { uploadTemplateLogo } from "../shared/upload-template-logo";
import {
  STATEMENT_DEFAULTS,
  mergeStatementDefaults,
  type StatementTemplateConfig,
} from "./statement-config";
import { StatementPreview } from "./statement-preview";

/*
 * The label is what the section is; the hint is what leaving it off costs.
 *
 * A row of bare checkboxes made every section look equally optional, when
 * turning the activity ledger off leaves a statement with no transactions on it
 * at all.
 */
const SECTION_TOGGLES: {
  key: keyof StatementTemplateConfig;
  label: string;
  hint: string;
}[] = [
  {
    key: "showSummaryTiles",
    label: "Summary tiles",
    hint: "Opening, invoiced, paid and closing totals across the top.",
  },
  {
    key: "showActivityLedger",
    label: "Activity ledger",
    hint: "Every document and payment in date order, with the running balance.",
  },
  {
    key: "showLineBreakdown",
    label: "Per-invoice line breakdown",
    hint: "Expands each invoice to its own lines. Longer, but answers what a charge was for.",
  },
  {
    key: "showAgingSummary",
    label: "Aging summary",
    hint: "How overdue the balance is, bucketed by 30 days.",
  },
  {
    key: "showOutstandingTable",
    label: "Outstanding invoices",
    hint: "What is still unpaid, with due dates — the part a customer acts on.",
  },
  {
    key: "showDisclosures",
    label: "Disclosures",
    hint: "Notes that credit notes and receipts are shown for reference and do not move the balance.",
  },
];

export function StatementEditor({ activeOrgId }: { activeOrgId: string }) {
  const { config, setConfig, save, saving, loading } = useTemplateBranding<StatementTemplateConfig>(
    activeOrgId,
    "statement",
    mergeStatementDefaults
  );
  const [savingLogo, setSavingLogo] = useState(false);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    /*
     * The page behind must hold still.
     *
     * Without this, scrolling inside the fullscreen statement carried on into
     * the settings form once it reached its end, so closing the modal left the
     * form somewhere else than where it was opened from.
     */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  const current = config ?? STATEMENT_DEFAULTS;
  const patch = (p: Partial<StatementTemplateConfig>) => setConfig({ ...current, ...p });

  const onSave = async () => {
    if (!activeOrgId) {
      toast.error("Active organization context is missing.");
      return;
    }
    setSavingLogo(true);
    try {
      const finalLogo = await uploadTemplateLogo(current.logo, activeOrgId, "statement");
      const next = { ...current, logo: finalLogo };
      await save(next);
      setConfig(next);
      toast.success("Statement template saved.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save statement template.");
    } finally {
      setSavingLogo(false);
    }
  };

  if (loading) return <StatementEditorSkeleton />;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Editor column.
          `layoutDependency` so the widening animates on the collapse toggle and
          nowhere else — a plain `layout` also fires on every tick of a window
          resize, which sets the whole column bouncing. */}
      <motion.div
        layout
        layoutDependency={isPreviewCollapsed}
        transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
        /*
         * 11, not 12, when collapsed.
         *
         * The restore button beside this is one column wide, so a 12-column
         * editor came to 13 in a 12-column grid — the button wrapped onto a new
         * row and appeared underneath the whole form. It had nothing to do with
         * how it was positioned, which is why moving it kept failing.
         */
        className={isPreviewCollapsed ? "space-y-6 lg:col-span-11" : "space-y-6 lg:col-span-7"}
      >
        {/* Headed like the invoice, credit note and quote cards. This one was a
            bare box, which read as a different screen rather than the same one
            with a different document in it. */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="size-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Branding &amp; Identity</h2>
              </div>
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Sender
              </span>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <BrandingFields value={current} onPatch={patch} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Statement Content</h2>
            </div>
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Statement Title
              </label>
              <input
                type="text"
                value={current.statementTitle}
                onChange={(e) => patch({ statementTitle: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Intro Text (optional)
              </label>
              <textarea
                rows={2}
                value={current.introText}
                onChange={(e) => patch({ introText: e.target.value })}
                placeholder="e.g. Please find your statement of account below."
                className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layout className="size-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Statement Sections</h2>
              </div>
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                {SECTION_TOGGLES.filter((section) => Boolean(current[section.key])).length} of{" "}
                {SECTION_TOGGLES.length} on
              </span>
            </div>
          </div>
          {/* Switches, not checkboxes. Each of these turns a whole block of the
              document on or off, which is a setting rather than an item being
              ticked off a list — and a switch shows its state from across the
              room, which matters when six of them decide what a customer
              receives. */}
          <div className="divide-y divide-slate-100">
            {SECTION_TOGGLES.map((section) => {
              const on = Boolean(current[section.key]);
              return (
                <label
                  key={section.key}
                  className="flex cursor-pointer select-none items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/60 sm:px-6"
                >
                  <span className="min-w-0">
                    <span
                      className={`block text-xs font-bold ${on ? "text-slate-900" : "text-slate-500"}`}
                    >
                      {section.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                      {section.hint}
                    </span>
                  </span>
                  <Switch
                    checked={on}
                    onCheckedChange={(checked) =>
                      patch({ [section.key]: checked } as Partial<StatementTemplateConfig>)
                    }
                    aria-label={section.label}
                    className="mt-0.5 shrink-0"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={onSave}
            disabled={saving || savingLogo}
            className="h-9 gap-2 bg-blue-600 px-6 text-xs font-bold text-white hover:bg-blue-700"
          >
            <Save className="size-4" />
            {saving || savingLogo ? "Saving…" : "Save Statement Template"}
          </Button>
        </div>
      </motion.div>

      {/* Preview column, headed the same way as the other tabs: the label on the
          left, the sheet size on the right. It read as a loose heading over a
          panel before, rather than as the panel's own header. */}
      {isPreviewCollapsed ? (
        // Put away, with the way back left on screen. Without this the only way
        // to bring it back would be a reload.
        /*
         * At the top of the column, where the preview it restores was.
         *
         * It was pinned to the bottom corner, which put it a long way from the
         * thing it brings back and on top of the support bubble. Sticky rather
         * than fixed so it stays in view as the form scrolls without depending
         * on an ancestor's transform, which is what stopped `fixed` behaving.
         */
        <div className="lg:sticky lg:top-24 lg:col-span-1 lg:flex lg:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsPreviewCollapsed(false)}
            className="h-auto w-full flex-row justify-center gap-2 border-slate-300 py-3 text-[11px] font-bold text-slate-600 shadow-sm lg:h-32 lg:w-12 lg:flex-col lg:py-4"
            aria-label="Restore statement preview"
            title="Restore statement preview"
          >
            <PanelRightOpen className="size-4" />
            <span className="lg:[writing-mode:vertical-rl]">Preview</span>
          </Button>
        </div>
      ) : (
        /* Follows the scroll and scrolls inside itself, so a long statement stays
           beside the fields that change it instead of running off the page. */
        <motion.div
          layout
          layoutDependency={isPreviewCollapsed}
          transition={{ layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
          className="space-y-3 lg:sticky lg:top-24 lg:col-span-5 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-slate-700">
              <Eye className="size-4 text-slate-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Live Statement Preview</h3>
            </div>
            {/* Collapse, size, fullscreen — the order the other tabs use, so the
                same control is under the same finger on every tab. */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setIsPreviewCollapsed(true)}
                className="h-6 w-6 rounded-full p-0 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                aria-label="Minimize statement preview"
                title="Minimize"
              >
                <PanelRightClose className="size-3.5" />
              </Button>
              <span className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-600">
                {current.paperSize}
              </span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="h-6 w-6 rounded-full p-0 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                aria-label="Open fullscreen statement preview"
                title="Fullscreen"
              >
                <Maximize className="size-3.5" />
              </Button>
            </div>
          </div>
          {/* Clickable, with the dim-and-label hover the invoice preview has —
              there the whole sheet is the button, and a statement that behaved
              differently would teach the wrong habit. */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Open fullscreen statement preview"
            onClick={() => setIsFullscreen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsFullscreen(true);
              }
            }}
            className="group relative cursor-zoom-in rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <StatementPreview config={current} />
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-slate-900/0 transition-colors group-hover:bg-slate-900/10" />
            <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 scale-95 items-center gap-2 rounded-full bg-slate-900/80 px-4 py-2 text-xs font-extrabold text-white opacity-0 shadow-lg backdrop-blur-sm transition group-hover:scale-100 group-hover:opacity-100">
              <ZoomIn className="size-4" />
              Open preview
            </span>
          </div>
        </motion.div>
      )}

      {/* Fullscreen, portalled so no ancestor's overflow can clip it. Scrolls
          rather than scaling to fit: the statement has no fixed page count, so
          there is no single size that always fits. */}
      {isFullscreen &&
        createPortal(
          <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[99999] flex flex-col bg-slate-900/60 p-3 backdrop-blur-sm sm:p-8"
                role="dialog"
                aria-modal="true"
                aria-label="Fullscreen statement preview"
                onClick={() => setIsFullscreen(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(event) => event.stopPropagation()}
                  className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Eye className="size-4 text-blue-600" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Fullscreen Statement Preview
                      </h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setIsFullscreen(false)}
                      className="h-7 w-7 rounded-full p-0 text-slate-400 hover:bg-slate-100"
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto bg-slate-500/5 p-3 sm:p-6">
                    <StatementPreview config={current} />
                  </div>
                </motion.div>
          </motion.div>,
          document.body,
        )}
    </div>
  );
}

/**
 * The shape of the editor, not a sentence about it.
 *
 * A line of text on an otherwise blank page gives no sense of what is arriving
 * or how long to wait; blocks in the right places make the wait read as the page
 * assembling itself. Mirrors the real layout — three cards on the left, a
 * preview beside them — so nothing jumps when the content lands.
 */
function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/70 ${className}`} />;
}

function SkeletonCard({ rows, badge = false }: { rows: number; badge?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <SkeletonBar className="size-4 rounded-md" />
          <SkeletonBar className="h-3 w-36" />
        </div>
        {badge ? <SkeletonBar className="h-4 w-14 rounded" /> : null}
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="space-y-1.5">
            <SkeletonBar className="h-2.5 w-24" />
            <SkeletonBar className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatementEditorSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        <SkeletonCard rows={3} badge />
        <SkeletonCard rows={2} />
        {/* The sections card is rows of label plus switch, not inputs. */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <SkeletonBar className="size-4 rounded-md" />
              <SkeletonBar className="h-3 w-40" />
            </div>
            <SkeletonBar className="h-4 w-16 rounded" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, row) => (
              <div key={row} className="flex items-start justify-between gap-4 px-5 py-3.5 sm:px-6">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkeletonBar className="h-2.5 w-32" />
                  <SkeletonBar className="h-2 w-3/4" />
                </div>
                <SkeletonBar className="h-5 w-9 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <SkeletonBar className="h-9 w-48 rounded-md" />
        </div>
      </div>

      <div className="space-y-3 lg:col-span-5">
        <div className="flex items-center justify-between px-1">
          <SkeletonBar className="h-3 w-40" />
          <div className="flex items-center gap-2">
            <SkeletonBar className="size-5 rounded-full" />
            <SkeletonBar className="h-4 w-8 rounded" />
            <SkeletonBar className="size-5 rounded-full" />
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-md">
          <div className="flex items-start justify-between gap-6">
            <SkeletonBar className="h-6 w-52" />
            <div className="w-40 space-y-1.5">
              <SkeletonBar className="h-2.5 w-full" />
              <SkeletonBar className="h-2.5 w-4/5" />
              <SkeletonBar className="h-2.5 w-3/5" />
            </div>
          </div>
          <SkeletonBar className="h-0.5 w-full" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, tile) => (
              <SkeletonBar key={tile} className="h-14 rounded-lg" />
            ))}
          </div>
          <div className="space-y-2.5 pt-2">
            {Array.from({ length: 7 }).map((_, row) => (
              <SkeletonBar key={row} className="h-3 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-6 gap-2 pt-2">
            {Array.from({ length: 6 }).map((_, bucket) => (
              <SkeletonBar key={bucket} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
