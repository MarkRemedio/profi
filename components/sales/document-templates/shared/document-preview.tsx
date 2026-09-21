"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A document scaled to the width it has been given.
 *
 * The print stylesheet sizes a sheet in millimetres and shrinks it for preview
 * with `zoom: 0.62` — about 492px for A4, a fixed number that has nothing to do
 * with the column it is dropped into. Anywhere narrower than that simply cut
 * the right-hand side off the page, which is what the onboarding wizard's
 * preview column did: the totals, the amounts and the whole right margin were
 * off the edge.
 *
 * This measures what the container actually offers and scales the rendered
 * document to fit it, so the sheet is whole at any width.
 */
export function FitPreview({
  children,
  className,
  maxHeight,
  fitHeight = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Cap in pixels, so a tall sheet stays inside the viewport when pinned. */
  maxHeight?: number;
  /**
   * Fit the container's height as well as its width, and centre what is left
   * over. Without it a portrait sheet scaled to a wide column runs off the
   * bottom; with it the document is as large as the box can hold, which is
   * what a pinned preview wants.
   */
  fitHeight?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; width: number; height: number } | null>(null);

  /*
   * The scale currently applied, readable from inside measure().
   *
   * measure() divides the transform back out of the measured rect to recover
   * the document's natural size. Reading that from state would make it an
   * effect dependency, which would tear down and rebuild the observer on every
   * single measurement.
   */
  const fitRef = useRef<{ scale: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        /* getBoundingClientRect rather than offsetWidth: the document is sized
           with CSS `zoom`, which the two report differently between engines,
           and only the rect describes what is on screen. */
        const rect = content.getBoundingClientRect();
        const applied = fitRef.current?.scale ?? 1;
        const naturalWidth = rect.width / (applied || 1);
        const naturalHeight = rect.height / (applied || 1);
        if (naturalWidth < 2 || naturalHeight < 2) return;

        const availableWidth = box.clientWidth;
        /* Bail out rather than inventing a width. Flooring this at 1px once
           produced a valid-looking scale of 1/794 — a preview one pixel wide —
           and stored it as a successful measurement, so nothing corrected it. */
        if (availableWidth < 2) return;

        let scale = availableWidth / naturalWidth;
        const heightCap = maxHeight ?? (fitHeight ? box.clientHeight : 0);
        if (heightCap > 1 && naturalHeight * scale > heightCap) scale = heightCap / naturalHeight;

        const next = { scale, width: naturalWidth * scale, height: naturalHeight * scale };
        fitRef.current = next;
        setFit(next);
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [maxHeight, fitHeight]);

  return (
    <div ref={boxRef} className={cn("w-full", fitHeight && "h-full", className)}>
      {/* The transform is off the layout, so the outer box is told the scaled
          height explicitly — otherwise it reserves the unscaled sheet and
          leaves a screenful of blank space underneath. */}
      <div
        style={{
          height: fit ? `${fit.height}px` : undefined,
          width: fit ? `${fit.width}px` : undefined,
          overflow: "hidden",
          margin: "0 auto",
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: fit ? `scale(${fit.scale})` : undefined,
            transformOrigin: "top left",
            width: "max-content",
            // Hidden until measured, so nobody sees the unscaled sheet flash.
            opacity: fit ? 1 : 0,
            transition: "opacity 120ms ease-out",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type LogoSpot = "left" | "center" | "right";

/**
 * A letterhead at thumbnail size, showing where the logo lands.
 *
 * The position control on the form says "Left", "Center", "Right", which tells
 * you the words but not the result — and the full document preview is on the
 * other side of the wizard by the time you are choosing. Three of these side by
 * side answer it at a glance: the mark, two rules for the company details, and
 * a block for the document title on the far side.
 *
 * Drawn rather than rendered from the real template. The real one is an A4
 * sheet; at 60px tall nothing on it would be legible, and the only question
 * being asked here is which end the logo sits at.
 */
function LetterheadMock({
  spot,
  logo,
  fallback,
  brandColor,
}: {
  spot: LogoSpot;
  logo: string | null;
  fallback: string;
  brandColor: string;
}) {
  const mark = (
    <span
      className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-[3px]"
      style={{ background: logo ? undefined : brandColor }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-full object-contain" />
      ) : (
        <span className="text-[5px] font-bold leading-none text-white">{fallback.slice(0, 2)}</span>
      )}
    </span>
  );

  const rules = (
    <span className={cn("flex min-w-0 flex-col gap-[3px]", spot === "center" && "items-center")}>
      <span className="block h-[3px] w-8 rounded-full bg-slate-300" />
      <span className="block h-[3px] w-6 rounded-full bg-slate-200" />
    </span>
  );

  /* The document title, on the side the logo is not. Centred layouts put it
     underneath instead, which is what the printed template does too. */
  const title = <span className="block h-[5px] w-7 shrink-0 rounded-full bg-slate-700" />;

  if (spot === "center") {
    return (
      <span className="flex h-[42px] flex-col items-center justify-center gap-[5px] rounded-md border border-slate-200 bg-white px-2">
        {mark}
        {rules}
        {title}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex h-[42px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2",
        spot === "right" && "flex-row-reverse"
      )}
    >
      <span className={cn("flex min-w-0 items-center gap-1.5", spot === "right" && "flex-row-reverse")}>
        {mark}
        {rules}
      </span>
      {title}
    </span>
  );
}

/**
 * The emblem on its own, at the size it is actually looked at.
 *
 * Shown while the logo is being chosen. A whole invoice at a third of its size
 * cannot tell you whether a mark reads at the top of a page — the thing being
 * decided is a 40px square, and the preview should be showing that rather than
 * everything around it.
 */
export function EmblemPreview({
  logo,
  initials,
  companyName,
  brandColor,
  logoPosition,
  inherited = false,
}: {
  logo: string | null;
  initials: string;
  companyName: string;
  brandColor: string;
  /** Given, the panel also shows where on the page the mark lands. */
  logoPosition?: LogoSpot;
  /** The mark shown is the company logo, not one uploaded for this document. */
  inherited?: boolean;
}) {
  const fallback = (initials || companyName || "Co").slice(0, 3).toUpperCase();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
        <div
          className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl"
          style={logo ? undefined : { background: brandColor }}
        >
          {logo ? (
            // A user-uploaded data URL, previewed directly.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Your emblem" className="size-full object-contain" />
          ) : (
            <span className="text-lg font-bold tracking-wide text-white">{fallback}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-slate-900">{companyName || "Your company"}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {/* Named, because the card on the left says "No Emblem" for this
                document and a panel showing one without explanation reads as a
                contradiction rather than as the setting working. */}
            {inherited
              ? "Your company logo"
              : logo
                ? "Your emblem, as it prints"
                : "No emblem yet"}
          </p>
        </div>
      </div>

      {/* The three places it appears, at the sizes it appears at, because a
          mark that reads at 64px can be unreadable as a favicon. */}
      <p className="mb-2.5 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Also appears as</p>
      <div className="flex items-end gap-6">
        {[
          { size: 40, label: "Header" },
          { size: 24, label: "Email" },
          { size: 16, label: "Tab" },
        ].map((spot) => (
          <div key={spot.label} className="flex flex-col items-center gap-2">
            <div
              className="grid shrink-0 place-items-center overflow-hidden rounded-md"
              style={{ width: spot.size, height: spot.size, background: logo ? undefined : brandColor }}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="size-full object-contain" />
              ) : (
                <span
                  className="font-bold text-white"
                  style={{ fontSize: Math.max(6, spot.size * 0.34) }}
                >
                  {fallback}
                </span>
              )}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{spot.label}</span>
          </div>
        ))}
      </div>

      {logoPosition ? (
        <>
          <p className="mb-2.5 mt-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            On the page
          </p>
          {/* All three, not just the chosen one. Seeing the alternatives beside
              it is what makes the choice legible — one thumbnail on its own
              only confirms what the buttons already said. */}
          <div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as LogoSpot[]).map((spot) => {
              const active = spot === logoPosition;
              return (
                <div
                  key={spot}
                  className={cn(
                    "rounded-lg border p-1.5 transition",
                    active ? "border-blue-500 bg-blue-50/60" : "border-slate-200 bg-slate-50/40"
                  )}
                >
                  <LetterheadMock
                    spot={spot}
                    logo={logo}
                    fallback={fallback}
                    brandColor={brandColor}
                  />
                  <p
                    className={cn(
                      "m-0 mt-1.5 text-center text-[9px] font-bold uppercase tracking-wider",
                      active ? "text-blue-700" : "text-slate-400"
                    )}
                  >
                    {spot}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {inherited ? (
        <p className="mt-4 rounded-lg bg-blue-50/60 p-2.5 text-[11px] leading-relaxed text-slate-600">
          This is the logo you uploaded for the workspace. Upload one on the left to use a different
          mark on this document.
        </p>
      ) : !logo ? (
        <p className="mt-4 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500">
          Nothing uploaded yet, so your initials print in your brand colour. Upload an image on the
          left and it appears here straight away.
        </p>
      ) : null}
    </div>
  );
}
