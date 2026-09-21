"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ImagePlus, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  FEEDBACK_MODULES,
  FEEDBACK_MODULE_LABELS,
  FEEDBACK_SUB_MODULES,
  MAX_FEEDBACK_ATTACHMENTS,
  moduleFromPathname,
  subModuleFromPathname,
  type FeedbackModule,
} from "@/lib/feedback/feedback";

import {
  getFeedbackEnabledModulesAction,
  getUserFeedbackReportsAction,
  submitFeedbackAction,
} from "./actions";
import { MAX_IMAGE_BYTES, uploadFeedbackImages } from "./upload-feedback-images";
import { AiAssistantPanel } from "@/components/ai-assistant/ai-assistant-panel";

export function FeedbackBubble() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<FeedbackModule>("other");
  const [subModule, setSubModule] = useState<string>("");
  const [customModule, setCustomModule] = useState("");
  const [customSubModule, setCustomSubModule] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  // Opens on Aurelius, the first tab. Support is a step away rather than the
  // landing place: most of what people open this for is a question, and the
  // assistant answers it without anybody waiting on a reply.
  const [panelMode, setPanelMode] = useState<"support" | "ai">("ai");
  const [hasUnread, setHasUnread] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Routes where this widget is not rendered (see the early return below).
  // The check has to live here too: an early return stops the render, NOT the
  // hooks — without this the poll below still fires getUserFeedbackReportsAction
  // on admin pages, and that action's requireAccountingWorkspace() bounces any
  // account with no organization (i.e. every platform admin) to /onboarding.
  const isHiddenRoute = pathname.startsWith("/admin") || pathname.startsWith("/print");

  const fetchReports = useCallback(async () => {
    if (!userId || isHiddenRoute) return;
    const res = await getUserFeedbackReportsAction();
    if (res.ok && res.reports) {
      setReports(res.reports);

      const lastSeenStr = typeof window !== "undefined" ? localStorage.getItem("wawprofi-feedback-last-seen") : null;
      if (lastSeenStr) {
        const lastSeen = new Date(lastSeenStr).getTime();
        const unread = res.reports.some(
          (r: any) => new Date(r.updatedAt).getTime() > lastSeen
        );
        setHasUnread(unread);
      } else if (res.reports.length > 0) {
        setHasUnread(true);
      }
    }
  }, [userId, isHiddenRoute]);

  // Fetch reports on load and periodic poll every 60 seconds
  useEffect(() => {
    if (isHiddenRoute) return;
    fetchReports();
    const interval = setInterval(fetchReports, 60000);
    return () => clearInterval(interval);
  }, [fetchReports, isHiddenRoute]);

  // Automatically validate and set sub-module when parent module changes
  useEffect(() => {
    const subs = FEEDBACK_SUB_MODULES[module] || [];
    if (!subs.some((s) => s.id === subModule)) {
      setSubModule(subs[0]?.id ?? "");
    }
    setCustomSubModule("");
  }, [module]);

  useEffect(() => {
    if (module !== "other") {
      setCustomModule("");
    }
  }, [module]);

  useEffect(() => {
    if (subModule !== "other") {
      setCustomSubModule("");
    }
  }, [subModule]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // Seeded from the session already in storage, which is read locally.
    // getUser() was used here instead, and it validates the token against the
    // auth server over the network: fast on a warm reload, slow on a cold one,
    // and capable of answering null while an expired token is still being
    // refreshed. That null was assigned unconditionally, so it overwrote a
    // userId the listener below had already set, and nothing re-ran until a
    // reload — the widget missing on first load but present after a refresh.
    //
    // The seed may therefore only reveal the widget. Hiding it belongs to the
    // listener, which is continuous and fires SIGNED_OUT. Presentation either
    // way: every action behind this widget authenticates on the server.
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user?.id ?? null;
      if (!cancelled && id) setUserId(id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserId(session?.user?.id ?? null)
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // A sign-in that happened on the server leaves this client unaware of it.
  // The login action calls signInWithPassword() server-side, so the session
  // arrives as a Set-Cookie and the browser SDK — which never performed the
  // sign-in — emits no SIGNED_IN for the listener above to hear. That listener
  // and its seed both ran back on /login, where there was nobody yet, and the
  // redirect into the app is a client-side navigation that keeps this widget
  // mounted. So userId stayed null for the whole session and the widget only
  // turned up after a hard reload.
  //
  // Re-read on navigation, and only while nobody is known: one local cookie
  // read on the first route change after signing in, then never again.
  useEffect(() => {
    if (userId) return;
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        const id = data.session?.user?.id ?? null;
        if (!cancelled && id) setUserId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, userId]);

  const [allowedFeatures, setAllowedFeatures] = useState<string[] | null>(null);

  useEffect(() => {
    // Same reason as the poll above: this action is workspace-scoped, so it
    // must not run on routes where the widget is hidden.
    if (!userId || isHiddenRoute) {
      setAllowedFeatures(null);
      return;
    }

    const cached = typeof window !== "undefined" ? sessionStorage.getItem("wawprofi-features") : null;
    if (cached) {
      try {
        setAllowedFeatures(JSON.parse(cached));
        return;
      } catch (e) {
        console.error("Failed to parse cached features", e);
      }
    }

    getFeedbackEnabledModulesAction().then((res) => {
      if (res.ok && res.features) {
        setAllowedFeatures(res.features);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("wawprofi-features", JSON.stringify(res.features));
        }
      } else {
        setAllowedFeatures([]);
      }
    });
  }, [userId, isHiddenRoute]);

  const filteredModules = useMemo(() => {
    if (allowedFeatures === null) {
      return FEEDBACK_MODULES;
    }

    return FEEDBACK_MODULES.filter((m) => {
      if (m === "dashboard" || m === "settings" || m === "other") {
        return true;
      }
      return allowedFeatures.some((f) => f.toLowerCase() === m.toLowerCase());
    });
  }, [allowedFeatures]);

  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files]
  );
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  // Hidden for anonymous visitors, in the admin area, and on print views.
  if (!userId || isHiddenRoute) {
    return null;
  }

  function openPanel() {
    const defaultModule = moduleFromPathname(pathname);
    const isAllowed = defaultModule === "dashboard" || defaultModule === "settings" || defaultModule === "other" || (
      allowedFeatures && allowedFeatures.some((f) => f.toLowerCase() === defaultModule.toLowerCase())
    );
    const resolvedMod = isAllowed ? defaultModule : "other";
    setModule(resolvedMod);
    setSubModule(subModuleFromPathname(pathname, resolvedMod));
    setCustomModule("");
    setCustomSubModule("");
    setSubmitted(false);
    setOpen(true);
    setPanelMode("ai");
    setActiveTab("new");

    // Clear unread status and save last seen timestamp
    if (typeof window !== "undefined") {
      localStorage.setItem("wawprofi-feedback-last-seen", new Date().toISOString());
    }
    setHasUnread(false);
    fetchReports();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FEEDBACK_ATTACHMENTS) {
        toast.error(`Up to ${MAX_FEEDBACK_ATTACHMENTS} images allowed.`);
        break;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 5 MB.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!details.trim()) {
      toast.error("Please describe the issue.");
      return;
    }
    setSubmitting(true);
    try {
      const { urls, failedCount } = await uploadFeedbackImages(files, userId!);
      if (failedCount > 0) {
        toast.warning(
          `${failedCount} image${failedCount > 1 ? "s" : ""} failed to attach — sending report without ${failedCount > 1 ? "them" : "it"}.`
        );
      }
      const resolvedModuleValue = module === "other" && customModule.trim()
        ? customModule.trim()
        : module;

      const resolvedSubModuleValue = module !== "other" && subModule === "other" && customSubModule.trim()
        ? customSubModule.trim()
        : (module === "other" ? "" : subModule);

      const result = await submitFeedbackAction({
        module: resolvedModuleValue,
        subModule: resolvedSubModuleValue,
        details,
        attachments: urls,
        pageUrl: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSubmitted(true);
      setDetails("");
      setFiles([]);
      fetchReports();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* Not during signup. Aurelius already occupies this corner there, and two
     unlabelled circles stacked on top of each other makes the reader choose
     between them before knowing what either does. Feedback on a product
     nobody has used yet is not worth that cost. */
  if (pathname?.startsWith("/onboarding")) return null;

  return (
    /* The offset tracks the bottom menu rather than assuming it. In sidebar
       mode --wawprofi-nav-inset is unset and the fallback of 0 leaves this
       exactly where it was; with the bottom menu on, the bar publishes its
       measured height and the bubble rides above it. A fixed number would have
       been wrong three ways over — the bar is shorter with the labels hidden,
       taller on a phone with a home indicator, and absent entirely half the
       time. */
    <div
      /* Animated rather than jumped. The inset changes whenever the bottom
         menu appears, disappears or is minimised, and without a transition the
         bubble teleported between two positions — which reads as a glitch
         rather than as the menu having moved. Eased out, and matched to the
         menu's own 220ms so the two look like one movement.

         motion-reduce turns it off: this is decoration, and somebody who has
         asked their system for less of it should still get the bubble in the
         right place, just instantly. */
      className="fixed right-5 z-50 transition-[bottom] duration-300 ease-out motion-reduce:transition-none print:hidden"
      style={{ bottom: "calc(1.25rem + var(--wawprofi-nav-inset, 0px))" }}
    >
      {/* Grown from the bubble rather than appearing over it.
          It was a bare conditional, so the panel blinked in at full size with
          no relationship to the thing that opened it — which reads as a popup
          the page threw at you. Anchored bottom right and scaled from there,
          it reads as the bubble unfolding. */}
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "bottom right" }}
          className="mb-3 flex h-[min(34rem,calc(100dvh-8rem))] min-h-[22rem] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPanelMode("ai")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  panelMode === "ai"
                    ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <Sparkles className="size-3.5" /> Aurelius
              </button>
              <button
                type="button"
                onClick={() => setPanelMode("support")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  panelMode === "support" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <MessageCircle className="size-3.5" /> Support
              </button>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)} aria-label="Close chat panel">
              <X className="size-4" />
            </Button>
          </div>

          {/* Keyed on the tab, so switching reads as one panel changing its
              mind rather than two panels swapping places. The panel above holds
              the height for both tabs, so nothing resizes on the way across —
              each one fills it and scrolls its own content.

              mode="wait" so only one is mounted at a time: the two hold very
              different content and crossfading them reads as a smear. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={panelMode}
              initial={{ opacity: 0, x: panelMode === "ai" ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: panelMode === "ai" ? 8 : -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-0 flex-1 flex-col"
            >
            {panelMode === "support" && reports.length > 0 && (
              <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("new")}
                    className={cn(
                      "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors",
                      activeTab === "new"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    New Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    className={cn(
                      "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1",
                      activeTab === "history"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    My Reports
                    {reports.some((r) => r.status === "NEW" || r.status === "IN_PROGRESS") && (
                      <span className="size-1.5 rounded-full bg-teal-500" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {panelMode === "ai" && <AiAssistantPanel active={open && panelMode === "ai"} pagePath={pathname} />}

            {panelMode === "support" && activeTab === "history" && (
              <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2">
                {reports.map((report) => (
                  <div key={report.id} className="p-2 rounded-xl border bg-muted/30 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize text-foreground truncate max-w-[150px]">
                        {FEEDBACK_MODULE_LABELS[report.module as keyof typeof FEEDBACK_MODULE_LABELS] ?? report.module}
                        {report.subModule && (
                          <span className="text-[10px] text-muted-foreground font-normal lowercase block">
                            ↳ {
                              (FEEDBACK_SUB_MODULES[report.module as FeedbackModule] || [])
                                .find(s => s.id === report.subModule)?.label ?? report.subModule
                            }
                          </span>
                        )}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase",
                        report.status === "NEW" && "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                        report.status === "IN_PROGRESS" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                        report.status === "DONE" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      )}>
                        {report.status === "NEW" ? "New" : report.status === "IN_PROGRESS" ? "In Progress" : "Done"}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 break-words">
                      {report.details}
                    </p>
                    <p className="text-[9px] text-muted-foreground/85 flex items-center justify-between">
                      <span>
                        {new Date(report.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </p>
                  </div>
                ))}
                <Link href="/help/contact" onClick={() => setOpen(false)} className="block pt-1 text-center text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Open Support Requests
                </Link>
              </div>
            )}

            {panelMode === "support" && activeTab === "new" && (
              submitted ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                  <CheckCircle2 className="size-10 text-teal-500" />
                  <p className="text-sm font-semibold">Thanks for the report!</p>
                  <p className="text-xs text-muted-foreground">
                    Our team will look into it.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setSubmitted(false)}
                  >
                    Report another issue
                  </Button>
                </div>
              ) : (
                <>
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="feedback-module" className="text-xs">Where is the issue?</Label>
                    <Select
                      value={module}
                      onValueChange={(v) => setModule(v as FeedbackModule)}
                    >
                      <SelectTrigger id="feedback-module" className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredModules.map((m) => (
                          <SelectItem key={m} value={m}>
                            {FEEDBACK_MODULE_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {module === "other" && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <Label htmlFor="feedback-custom-module" className="text-xs">Specify category</Label>
                      <input
                        id="feedback-custom-module"
                        type="text"
                        value={customModule}
                        onChange={(e) => setCustomModule(e.target.value)}
                        placeholder="e.g. Mobile App, Billing..."
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  )}

                  {module !== "other" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="feedback-submodule" className="text-xs">Sub-feature (optional)</Label>
                      <Select
                        value={subModule}
                        onValueChange={(v) => setSubModule(v)}
                      >
                        <SelectTrigger id="feedback-submodule" className="h-8 w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(FEEDBACK_SUB_MODULES[module] || []).map((sm) => (
                            <SelectItem key={sm.id} value={sm.id}>
                              {sm.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {module !== "other" && subModule === "other" && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <Label htmlFor="feedback-custom-submodule" className="text-xs">Specify sub-feature</Label>
                      <input
                        id="feedback-custom-submodule"
                        type="text"
                        value={customSubModule}
                        onChange={(e) => setCustomSubModule(e.target.value)}
                        placeholder="e.g. PDF Export, Invoice History..."
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="feedback-details" className="text-xs">What happened?</Label>
                    <Textarea
                      id="feedback-details"
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="Describe the error, what you expected, and the steps to reproduce it…"
                      rows={3}
                      className="resize-none text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => addFiles(e.target.files)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {previews.map((src, i) => (
                        <div key={src} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={`Attachment ${i + 1}`}
                            className="size-10 rounded-md border object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFiles(files.filter((_, idx) => idx !== i))
                            }
                            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background"
                            aria-label={`Remove attachment ${i + 1}`}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                      {files.length < MAX_FEEDBACK_ATTACHMENTS && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <ImagePlus className="size-3.5" />
                          Add image
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Up to {MAX_FEEDBACK_ATTACHMENTS} images, 5 MB each.
                    </p>
                  </div>

                </div>

                {/* Pinned, like the Aurelius composer opposite it. The fields
                    above scroll; the action that finishes the task stays where
                    it is rather than floating in the middle of a panel whose
                    height no longer depends on how long the form happens to
                    be. */}
                <div className="shrink-0 border-t px-3.5 py-2.5">
                  <Button
                    className="h-9 w-full text-xs"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    <Send className="size-3.5" />
                    {submitting ? "Sending…" : "Send report"}
                  </Button>
                </div>
                </>
              )
            )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Close support and Aurelius" : "Open support and Aurelius"}
        className={cn(
          "relative ml-auto flex size-14 items-center justify-center rounded-full text-white shadow-lg shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95",
          "bg-gradient-to-br from-blue-500 to-indigo-600"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
          </motion.span>
        </AnimatePresence>
        {hasUnread && !open && (
          <span className="absolute top-0.5 right-0.5 flex size-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full size-3.5 bg-red-500 border-2 border-white dark:border-slate-900"></span>
          </span>
        )}
      </button>
    </div>
  );
}
