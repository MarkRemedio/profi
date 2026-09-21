"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { CalendarDays, ChevronLeft, ChevronRight, Coins, Expand, Globe2, X } from "lucide-react";

import { TiltCard } from "./tilt-card";

/**
 * The three settings on step one, shown rather than described.
 *
 * Each image answers one of the questions beside it — which currency the books
 * are kept in, whether documents may be raised in another, and how dates are
 * written. They are in that order deliberately: it is the order the form asks
 * them in, so somebody working down the fields sees the matching picture as
 * they arrive.
 */
const SLIDES = [
  {
    src: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/BaseCurrency.png",
    alt: "Choosing a base currency in WAW-Profi",
    title: "Base currency",
    icon: Coins,
    caption: "The currency your books are kept in.",
  },
  {
    src: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/Multicurrency.png",
    alt: "Raising a document in another currency",
    title: "Multicurrency",
    icon: Globe2,
    caption: "Invoice and bill in other currencies when you need to.",
  },
  {
    src: "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets/DateFormat.png",
    alt: "Date format shown on a document",
    title: "Date format",
    icon: CalendarDays,
    caption: "How dates appear across every document and report.",
  },
];

/** How long each slide holds before advancing, in milliseconds. */
const SLIDE_MS = 5000;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether this person has asked for less movement.
 *
 * useSyncExternalStore rather than reading matchMedia into state from an
 * effect: matchMedia is an external store, and subscribing to it properly
 * avoids the render-then-correct that setting state on mount produces. The
 * third argument is the server snapshot — there is no media query during SSR.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange: () => void) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function StepOneShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const slide = SLIDES[index];
  const SlideIcon = slide.icon;

  // Escape closes the enlarged view, which is what anyone will reach for
  // before hunting for a close button.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [index, paused, reducedMotion]);

  const go = (next: number) => setIndex((next + SLIDES.length) % SLIDES.length);

  return (
    <div
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Names the setting the picture is of. Without it a screenshot of a form
          is just a screenshot of a form — the reader has to work out which of
          the three questions it belongs to. */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
          <SlideIcon className="size-4" />
        </span>
        <span className="text-sm font-bold text-white">{slide.title}</span>
        <span className="ml-auto text-[11px] font-medium text-slate-500">
          {index + 1} of {SLIDES.length}
        </span>
      </div>

      {/* Tilts with the cursor like the cards on the other steps, and like the
          marketing site. The wrapper does the leaning so the button keeps its
          own hover and focus behaviour untouched. */}
      <TiltCard className="rounded-2xl">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Enlarge: ${slide.title}`}
        className="group relative block aspect-16/10 w-full cursor-zoom-in overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-0 shadow-xl">
        {SLIDES.map((slide, slideIndex) => (
          // Every slide stays mounted and cross-fades. Swapping a single src
          // would show a blank frame while the next image loads, which on a
          // five second rotation is a visible flash each time.
          <Image
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 420px"
            priority={slideIndex === 0}
            className={`object-cover object-top transition-opacity duration-700 ${
              slideIndex === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {/* Arrows appear on hover on a pointer device, and are always present
            for keyboard users via focus-visible. */}
        {/* Says the image can be opened, rather than leaving it to be
            discovered by clicking. */}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-slate-900/75 px-2 py-1 text-[10px] font-semibold text-slate-200 opacity-0 transition group-hover:opacity-100">
          <Expand className="size-3" /> Click to enlarge
        </span>

        <span
          role="button"
          tabIndex={0}
          aria-label="Previous image"
          onClick={(event) => { event.stopPropagation(); go(index - 1); }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); go(index - 1); } }}
          className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-md transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ChevronLeft className="size-4" />
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label="Next image"
          onClick={(event) => { event.stopPropagation(); go(index + 1); }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); go(index + 1); } }}
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-md transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ChevronRight className="size-4" />
        </span>
      </button>
      </TiltCard>

      {/* Segmented progress. Each bar is also the control for its own slide, so
          there is no separate row of dots doing the same job. */}
      <div className="mt-3 flex items-center gap-2">
        {SLIDES.map((slide, slideIndex) => {
          const done = slideIndex < index;
          const active = slideIndex === index;
          return (
            <button
              key={slide.src}
              type="button"
              onClick={() => go(slideIndex)}
              aria-label={`${slide.caption} — image ${slideIndex + 1} of ${SLIDES.length}`}
              aria-current={active}
              className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full border-none bg-slate-700 p-0 transition hover:bg-slate-600"
            >
              <span
                // Keyed so the fill restarts each time this slide becomes
                // active rather than resuming part-way through.
                key={`${slideIndex}-${index}-${paused}-${reducedMotion}`}
                className="block h-full rounded-full bg-blue-500"
                style={
                  done || (active && (reducedMotion || paused))
                    ? { width: "100%" }
                    : active
                      ? { animation: `payroll-slide-fill ${SLIDE_MS}ms linear forwards` }
                      : { width: "0%" }
                }
              />
            </button>
          );
        })}
      </div>

      <p className="m-0 mt-3 text-sm leading-relaxed text-slate-400">{slide.caption}</p>

      {/* Full size, because these are screenshots of a real interface and the
          420px panel renders their text too small to read. */}
      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={slide.title}
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-[9999] flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:p-8"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="size-5" />
          </button>

          <figure
            onClick={(event) => event.stopPropagation()}
            className="m-0 w-full max-w-5xl cursor-default"
          >
            {/* A plain img rather than next/image, deliberately.
                next/image needs either fixed dimensions or a parent of known
                aspect to fill, and these three screenshots are not the same
                shape — letterboxing them to one ratio would crop or pad the
                thing somebody just asked to see properly. The file is already
                in the browser cache from the panel above, so there is nothing
                left to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.src}
              alt={slide.alt}
              className="max-h-[80vh] w-full rounded-xl object-contain shadow-2xl"
            />
            <figcaption className="mt-3 text-center text-sm text-slate-300">
              <span className="font-bold text-white">{slide.title}</span> — {slide.caption}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
