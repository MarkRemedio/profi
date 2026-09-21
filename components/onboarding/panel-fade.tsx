"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Cross-fades panel content when the answer behind it changes.
 *
 * The step-to-step transition was already animated, but choosing a different
 * answer *within* a step swapped the panel instantly — pick Partnership and
 * "Corporation Tax ledgers built" became "Self Assessment ledgers built" between
 * one frame and the next, with nothing to say the two were related. Read as a
 * flicker rather than as a consequence of what had just been clicked.
 *
 * `mode="wait"` so the outgoing content finishes leaving before the incoming
 * arrives; overlapping them in a panel this narrow reads as two things fighting
 * over the same space.
 *
 * `initial={false}` because the first render is not a change. Without it every
 * card would fade in a second time on top of the step transition that just
 * brought the whole panel in.
 */
export function PanelFade({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        // Shorter than the step transition on purpose. This is a correction to
        // something already on screen, not an arrival, and the same 450ms would
        // make a click feel like it had not registered.
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * A card that appears or disappears with the answer, rather than blinking.
 *
 * For the ones that are conditional outright — the CIS row, the VAT worked
 * example — where there is nothing to cross-fade against.
 */
export function PanelReveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          // Height animates from zero, so anything spilling out mid-flight has
          // to be clipped or the card below is briefly overlapped.
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
