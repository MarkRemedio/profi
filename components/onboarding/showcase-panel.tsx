"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Diameter of the moving light, in pixels. */
const GLOW_SIZE = 560;

/**
 * How far past the panel's edges the light is allowed to travel.
 *
 * The cursor spends most of onboarding in the form on the left, well outside
 * this panel. Left unclamped the light would sit hundreds of pixels off-screen
 * and never be seen at all. Clamped, it rests against whichever edge the cursor
 * is nearest and leans towards them as they work — which is the point.
 */
const EDGE_SLACK = 140;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The dark panel beside the wizard, lit by a glow that follows the cursor.
 *
 * The light is moved by writing a transform straight onto the element inside a
 * single animation frame, not by holding the pointer in React state. A mousemove
 * fires far more often than the screen redraws, and re-rendering this subtree —
 * which contains the image showcase and every step's preview — on each one would
 * cost far more than the effect is worth.
 */
export function ShowcasePanel({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Somebody who has asked for less movement keeps the still glow below.
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    const draw = () => {
      frame.current = null;
      const glow = glowRef.current;
      if (!glow) return;
      const half = GLOW_SIZE / 2;
      glow.style.transform = `translate3d(${point.current.x - half}px, ${point.current.y - half}px, 0)`;
      glow.style.opacity = "1";
    };

    const onMove = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      // The panel is hidden below the lg breakpoint, where it measures zero.
      if (rect.width === 0) return;

      point.current = {
        x: clamp(event.clientX - rect.left, -EDGE_SLACK, rect.width + EDGE_SLACK),
        y: clamp(event.clientY - rect.top, -EDGE_SLACK, rect.height + EDGE_SLACK),
      };
      if (frame.current === null) frame.current = window.requestAnimationFrame(draw);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      className="relative hidden w-[480px] shrink-0 flex-col overflow-hidden border-l border-slate-800 bg-[#0B0F19] lg:flex"
    >
      {/* Still glow in the corner. It is what the panel looks like before the
          cursor has moved, and all it looks like under reduced motion. */}
      <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-blue-600/10 blur-[100px]" />

      {/* The cursor light. Blue at the core with an orange fringe, the two
          accent colours the marketing site already uses. */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity duration-700"
        style={{
          width: GLOW_SIZE,
          height: GLOW_SIZE,
          background:
            "radial-gradient(circle, rgba(59,130,246,0.22) 0%, rgba(237,106,44,0.10) 40%, rgba(59,130,246,0) 68%)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col justify-center p-12">{children}</div>
    </div>
  );
}
