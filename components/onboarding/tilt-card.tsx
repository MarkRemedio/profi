"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

/**
 * The same numbers the marketing site tilts by.
 *
 * Taken from the hero and feature cards rather than picked again here, so a
 * card in onboarding moves exactly like a card on the homepage: six degrees at
 * the edges, eased out over 0.4s, and a slower 0.7s settle back to flat.
 * Changing these means the two no longer match.
 */
const MAX_TILT_DEGREES = 6;
const TILT_DURATION = 0.4;
const RESET_DURATION = 0.7;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * A panel card that leans towards the cursor.
 *
 * The perspective is set once on mount rather than on first hover. Applying it
 * at the same moment as the first rotation makes the card jump, because the
 * browser has to adopt a new transform origin and a rotation in one frame —
 * the same reason the homepage hero sets it up front.
 */
export function TiltCard({ className, children }: { className?: string; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    if (reducedMotion.current) return;
    gsap.set(cardRef.current, { transformPerspective: 1000 });
  }, []);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || reducedMotion.current) return;

    const rect = card.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    gsap.to(card, {
      // Away from the cursor vertically, towards it horizontally, which is what
      // reads as the card facing you.
      rotateX: ((event.clientY - rect.top - centerY) / centerY) * -MAX_TILT_DEGREES,
      rotateY: ((event.clientX - rect.left - centerX) / centerX) * MAX_TILT_DEGREES,
      ease: "power2.out",
      duration: TILT_DURATION,
    });
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card || reducedMotion.current) return;
    gsap.to(card, { rotateX: 0, rotateY: 0, ease: "power3.out", duration: RESET_DURATION });
  };

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} className={className}>
      {children}
    </div>
  );
}
