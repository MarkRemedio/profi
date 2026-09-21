"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Expand, PanelBottom, PanelLeft, Play, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavPosition } from "./use-nav-position";

/**
 * What each menu layout actually looks like.
 *
 * Two places ask this question — the onboarding wizard and Workspace Settings —
 * and they share this component so the same question cannot drift between them.
 *
 * They do not show the same thing, though, and that is deliberate. The wizard
 * gets screenshots and a video, because somebody choosing for the first time has
 * never seen either layout and the abstract sketch tells them almost nothing.
 * Settings gets the sketch, because by then they are looking at the real menu
 * on the real page behind the card — a screenshot of the thing you are already
 * using is noise, and 1.7 MB of it on a settings page is rude.
 */

const BUCKET = "https://rxjsvpddsfmghvgjpgwg.supabase.co/storage/v1/object/public/assets";

type LayoutMedia = { image: string; video: string | null };

export const NAV_LAYOUT_MEDIA: Record<NavPosition, LayoutMedia> = {
  side: {
    image: `${BUCKET}/side-menu.png`,
    video: `${BUCKET}/video2-side-menu.mp4`,
  },
  bottom: {
    image: `${BUCKET}/bottom-menu.png`,
    video: `${BUCKET}/video-bottom-menu.mp4`,
  },
};

/**
 * The preview box's shape, taken from the videos rather than the screenshots.
 *
 * The two do not match — the screenshots are 1779x1284 (1.39) and the videos
 * are 1920x1080 (1.78) — and one of them has to give. The video wins because it
 * is the thing worth watching: at the screenshot's ratio a 16:9 recording was
 * being squeezed into a narrower box and cropped at the sides on top of the
 * padding already baked into the file. The still is only the resting state, and
 * loses a little top and bottom instead.
 */
const MEDIA_RATIO = "16/9";

const OPTIONS: {
  value: NavPosition;
  label: string;
  hint: string;
  icon: typeof PanelLeft;
}[] = [
  {
    value: "side",
    label: "Side menu",
    hint: "A column down the left. Every section visible at once.",
    icon: PanelLeft,
  },
  {
    value: "bottom",
    label: "Bottom menu",
    hint: "A floating bar with every section. Minimise it to icons alone.",
    icon: PanelBottom,
  },
];

/**
 * A single preview: the screenshot where one is wanted, otherwise a sketch.
 *
 * The sketch is not an apology. It renders instantly, costs no request, reads
 * at 56 pixels tall where a screenshot is a grey smudge, and survives a
 * redesign of the real chrome without anybody having to retake it.
 */
export function NavLayoutPreview({
  layout,
  showMedia = false,
  className = "h-16",
}: {
  layout: NavPosition;
  /** Screenshot rather than sketch. Onboarding only — see the note above. */
  showMedia?: boolean;
  className?: string;
}) {
  if (showMedia) return <HoverPreview layout={layout} />;

  if (layout === "side") {
    return (
      <div className={`flex gap-1.5 ${className}`}>
        <div className="flex w-1/4 flex-col gap-1 rounded-md bg-slate-300 p-1.5">
          <div className="h-1 w-full rounded-full bg-white/70" />
          <div className="h-1 w-3/4 rounded-full bg-white/70" />
          <div className="h-1 w-full rounded-full bg-white/70" />
          <div className="h-1 w-2/3 rounded-full bg-white/70" />
        </div>
        <div className="flex-1 rounded-md bg-slate-100" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex-1 rounded-md bg-slate-100" />
      <div className="flex h-4 items-center justify-center gap-1 rounded-md bg-slate-300 px-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="size-1.5 rounded-sm bg-white/70" />
        ))}
      </div>
    </div>
  );
}

/**
 * The screenshot, which starts moving when you point at it.
 *
 * preload="none" is what makes this affordable. The two videos are about
 * 1.7 MB together, and nothing is fetched until somebody actually hovers — a
 * reader who scrolls straight past this card pays for two images and no video
 * at all.
 *
 * onPointerEnter rather than onMouseEnter so a tap starts it too. A phone has
 * no hover, and without this the video would be desktop-only.
 *
 * No controls attribute, deliberately: a <video controls> is interactive
 * content, and this sits inside the button that selects the option. Interactive
 * content nested in a button is invalid, and browsers resolve it by dropping
 * one of the two — usually the wrong one.
 */
function HoverPreview({ layout }: { layout: NavPosition }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const media = NAV_LAYOUT_MEDIA[layout];

  const start = () => {
    const video = videoRef.current;
    if (!video || !media.video) return;
    setPlaying(true);
    // play() rejects when the browser declines — a data-saver mode, a policy
    // this gesture did not satisfy. Fall back to the still rather than leaving
    // a transparent video over it.
    video.play().catch(() => setPlaying(false));
  };

  const stop = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    // Rewound, so the next hover starts the demonstration from the beginning
    // rather than halfway through a menu opening.
    video.currentTime = 0;
    setPlaying(false);
  };

  return (
    <div
      onPointerEnter={start}
      onPointerLeave={stop}
      /* No width cap. It had one to stop a wide settings card blowing the
         screenshot up, but Settings shows the sketch now — this only ever
         renders in the wizard, where the card is the width of the column and a
         320px box made the video too small to read. */
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900"
      style={{ aspectRatio: MEDIA_RATIO }}
    >
      {/* A plain img rather than next/image: the allowed remote host is a
          single hardcoded Supabase project, so the optimiser would reject this
          on any deployment pointing elsewhere. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.image}
        alt=""
        width={1779}
        height={1284}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />

      {media.video && (
        <video
          ref={videoRef}
          src={media.video}
          muted
          loop
          playsInline
          preload="none"
          /* Layered over the still and faded in, rather than swapped for it.
             Swapping flashes the container's grey background in the frame
             between the two. */
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-200",
            playing ? "opacity-100" : "opacity-0"
          )}
        />
      )}

      {/* Says the still is not the whole story. Hidden while playing, because
          by then it is saying something the reader can already see. */}
      {media.video && !playing && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-slate-900/70 px-1.5 py-1 text-[9px] font-bold text-white backdrop-blur-sm">
          <Play className="size-2.5 fill-current" /> Hover to play
        </span>
      )}
    </div>
  );
}

/**
 * The whole menu-layout choice: both options, their previews, and a way to see
 * one properly.
 *
 * The expand button is a sibling of the selecting button, never a child of it:
 * a button inside a button is invalid, and browsers resolve it by dropping one
 * of them — usually not the one you wanted.
 */
export function NavLayoutChooser({
  value,
  onChange,
  expanded,
  onExpandedChange,
  showMedia = false,
}: {
  value: NavPosition;
  onChange: (next: NavPosition) => void;
  /** Which preview is open full screen, if any. Lifted so the caller owns it. */
  expanded: NavPosition | null;
  onExpandedChange: (next: NavPosition | null) => void;
  showMedia?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = value === option.value;

          return (
            <div
              key={option.value}
              className={cn(
                "relative rounded-xl border-2 transition",
                active
                  ? "border-blue-600 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <button
                type="button"
                onClick={() => onChange(option.value)}
                aria-pressed={active}
                className="w-full p-3 text-left"
              >
                <NavLayoutPreview layout={option.value} showMedia={showMedia} />

                <div className="mt-2.5 flex items-center gap-2">
                  <option.icon
                    className={cn("size-4 shrink-0", active ? "text-blue-600" : "text-slate-400")}
                  />
                  <span className="text-sm font-bold text-slate-900">{option.label}</span>
                  {active && <Check className="ml-auto size-4 shrink-0 text-blue-600" />}
                </div>
                <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">{option.hint}</p>
              </button>

              {/* Only where there is something worth enlarging. The sketch has
                  no detail a bigger version would reveal. */}
              {showMedia && (
                <button
                  type="button"
                  onClick={() => onExpandedChange(option.value)}
                  aria-label={`See the ${option.label.toLowerCase()} full screen`}
                  className="absolute right-5 top-5 flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 backdrop-blur transition hover:bg-white hover:text-blue-600"
                >
                  <Expand className="size-3" /> View
                </button>
              )}
            </div>
          );
        })}
      </div>

      <NavLayoutLightbox layout={expanded} onClose={() => onExpandedChange(null)} />
    </>
  );
}

/**
 * One layout, full screen and still.
 *
 * Deliberately not the video: that plays under the pointer on the card itself,
 * and what full screen is for here is reading the labels in the chrome — which
 * a moving picture makes harder, not easier.
 *
 * Portalled to the body rather than rendered in place: the onboarding wizard
 * animates its phase container with a transform, and any ancestor transform
 * silently turns position: fixed into position: absolute — the overlay would
 * have been trapped inside a scrolling card instead of covering the window.
 */
function NavLayoutLightbox({
  layout,
  onClose,
}: {
  layout: NavPosition | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!layout) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // The page behind must not scroll under the overlay. Restored to what it
    // was rather than to a fixed value, so a page already locked for another
    // reason is left as it was found.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [layout, onClose]);

  if (!layout) return null;

  const media = NAV_LAYOUT_MEDIA[layout];
  const label = OPTIONS.find((option) => option.value === layout)?.label ?? "";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div className="flex w-full max-w-6xl items-center justify-between gap-4">
        <span className="text-sm font-bold text-white">{label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* The still, not the video. The video already plays under the pointer on
          the card itself; what full screen adds is the chance to read the
          labels, and a moving picture is the worse surface for that. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.image}
        alt={label}
        width={1779}
        height={1284}
        /* Stops a click on the image closing the overlay — somebody leaning in
           to read a label should not lose the thing they are reading. */
        onClick={(event) => event.stopPropagation()}
        className="max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
      />

      <p className="m-0 text-xs text-white/60">Click anywhere, or press Escape, to close.</p>
    </div>,
    document.body
  );
}
