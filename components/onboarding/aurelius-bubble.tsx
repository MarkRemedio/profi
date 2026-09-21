"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Loader2, ArrowRight } from "lucide-react";
import { askAureliusAction, generateSetupPlan } from "@/app/onboarding/plan-actions";
import type { SetupPlan } from "@/lib/onboarding/setup-plan";
import { cn } from "@/lib/utils";

/**
 * Aurelius, available on every step of setup.
 *
 * One floating bubble rather than a panel per step. The right-hand side of the
 * wizard already shows what each choice does; what it cannot do is answer the
 * question somebody actually has — "does it matter if I get this wrong?", "what
 * even is a UTR?" — and a panel that tried would be five panels to maintain and
 * still be in the way of the ones that work.
 *
 * Top right, because the support widget already owns the bottom right. Two
 * assistants stacked in one corner is a choice nobody should have to make.
 *
 * Nothing here can block signup: the action never throws, an unreachable model
 * returns a sentence rather than an error, and the bubble is never in the tab
 * order of the form it sits beside.
 */

const STEP_OPENERS: Record<number, string> = {
  1: "Naming your workspace. Ask me about the base currency — it is the one choice here that is awkward to change later.",
  2: "Your legal structure and tax references. Ask me what a UTR is, or which of these you can safely skip.",
  3: "VAT. Ask me whether you need to register, or what the threshold actually is.",
  4: "Tell me what you want to fix and I will write your first week. Or just ask me anything.",
  5: "Nearly there. Ask me what you would be skipping if you take the standard setup.",
};

const STEP_PROMPTS: Record<number, string[]> = {
  1: ["Can I change my currency later?", "What does multicurrency do?"],
  2: ["What is a Company UTR?", "Do I need a PAYE reference?"],
  3: ["Do I have to register for VAT?", "What is the VAT threshold?"],
  4: ["Build my first-week plan", "I am moving from spreadsheets"],
  5: ["What does the standard setup give me?", "Can I change branding later?"],
};

type Turn = { role: "you" | "aurelius"; text: string };

/** Remembers that Aurelius has already introduced himself. */
const GREETED_KEY = "waw-aurelius-greeted-v1";

export function AureliusBubble({
  step,
  planInput,
}: {
  step: number;
  planInput: {
    businessName: string;
    businessStructure: string;
    focusAreas: string[];
    booksToday: string;
    notes: string;
    vatRegistered: boolean;
    currency: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  /*
   * Aurelius introducing himself, once.
   *
   * A circle in a corner is not self-explanatory — it reads as decoration, or
   * as the support widget they already ignored. Somebody stuck on "do I need a
   * UTR?" will not click an unlabelled icon on the off-chance. He says who he
   * is, and then never mentions it again.
   *
   * Delayed so it arrives after the step has settled rather than competing
   * with it, and remembered across reloads: a greeting that repeats every
   * refresh stops being a greeting and becomes a nag.
   */
  const [greeting, setGreeting] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(GREETED_KEY) === "1";
    } catch {
      /* Storage unavailable. Greeting once per session is close enough. */
    }
    if (seen) return;

    const timer = setTimeout(() => setGreeting(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  const dismissGreeting = () => {
    setGreeting(false);
    try {
      window.localStorage.setItem(GREETED_KEY, "1");
    } catch {
      /* Nothing to remember it with. It will greet again next time. */
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, plan, busy]);

  const buildPlan = async () => {
    setBusy(true);
    setTurns((previous) => [...previous, { role: "you", text: "Build my first-week plan" }]);
    try {
      setPlan(await generateSetupPlan(planInput));
    } finally {
      setBusy(false);
    }
  };

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    /* The plan is a different shape of answer, so the phrase that asks for it
       routes to the generator rather than to a sentence about planning. */
    if (/first[- ]week plan|build my plan/i.test(trimmed)) {
      setDraft("");
      await buildPlan();
      return;
    }

    setDraft("");
    setTurns((previous) => [...previous, { role: "you", text: trimmed }]);
    setBusy(true);
    try {
      const answer = await askAureliusAction(step, trimmed);
      setTurns((previous) => [...previous, { role: "aurelius", text: answer }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* The bubble. Fixed, above everything, and out of the form's tab order —
          it is a companion to the page, not a field in it. */}
      <motion.button
        type="button"
        tabIndex={-1}
        onClick={() => {
          dismissGreeting();
          setOpen((value) => !value);
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        aria-label={open ? "Close Aurelius" : "Ask Aurelius"}
        className="fixed bottom-5 right-5 z-[80] grid size-14 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95"
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
        {!open && turns.length === 0 ? (
          <span className="absolute -left-0.5 -top-0.5 flex size-3.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-60" />
            <span className="relative inline-flex size-3.5 rounded-full border-2 border-white bg-blue-500" />
          </span>
        ) : null}
      </motion.button>

      {/* Points at the bubble it is describing, and closes on either the X or
          the first click of the bubble itself. */}
      <AnimatePresence>
        {greeting && !open ? (
          <motion.div
            initial={{ opacity: 0, x: 12, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.94 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 right-24 z-[80] w-[min(17rem,calc(100vw-7.5rem))] rounded-2xl rounded-br-sm border border-slate-200 bg-white px-4 py-3 pr-8 shadow-xl shadow-slate-900/10"
          >
            <span className="absolute -right-1.5 bottom-4 size-3 rotate-45 border-b border-r border-slate-200 bg-white" />
            <p className="m-0 text-[13px] font-bold text-slate-900">Hello — I am Aurelius.</p>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-slate-600">
              I am here for the whole of setup. Stuck on a question, or not sure whether something
              matters? Click me and ask.
            </p>
            <button
              type="button"
              onClick={dismissGreeting}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-md p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-24 right-5 z-[80] flex max-h-[min(34rem,calc(100dvh-9rem))] w-[min(23rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                <Sparkles className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">Aurelius</span>
                <span className="block text-[11px] text-slate-500">Your setup guide · Step {step} of 5</span>
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 custom-scrollbar">
              <p className="m-0 rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[13px] leading-relaxed text-slate-700">
                {STEP_OPENERS[step] ?? "Ask me anything about setting this up."}
              </p>

              {turns.map((turn, index) => (
                <p
                  key={`${index}-${turn.text.slice(0, 12)}`}
                  className={cn(
                    "m-0 max-w-[92%] px-3 py-2 text-[13px] leading-relaxed",
                    turn.role === "you"
                      ? "ml-auto rounded-xl rounded-br-sm bg-blue-600 text-white"
                      : "rounded-xl rounded-tl-sm bg-slate-100 text-slate-700",
                  )}
                >
                  {turn.text}
                </p>
              ))}

              {plan ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"
                >
                  <p className="m-0 text-[13px] font-bold text-slate-900">{plan.headline}</p>
                  <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-slate-600">{plan.summary}</p>
                  <ol className="m-0 mt-2.5 list-none space-y-1.5 p-0">
                    {plan.steps.map((entry, index) => (
                      <li key={entry.title} className="flex gap-2 rounded-lg bg-white/80 p-2">
                        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold text-slate-900">{entry.title}</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">{entry.detail}</span>
                          <span className="mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-600">
                            <ArrowRight className="size-2.5" /> {entry.where}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </motion.div>
              ) : null}

              {busy ? (
                <p className="m-0 flex items-center gap-2 px-1 text-[12px] text-slate-400">
                  <Loader2 className="size-3 animate-spin" /> Thinking…
                </p>
              ) : null}

              {/* Offered rather than left blank. Somebody who does not know what
                  to ask is exactly the person who most needs the answer. */}
              {!busy ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(STEP_PROMPTS[step] ?? []).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              <div ref={endRef} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
              className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-3 py-2.5"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about this step…"
                maxLength={300}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none placeholder:text-slate-400 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={busy || draft.trim().length < 3}
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
