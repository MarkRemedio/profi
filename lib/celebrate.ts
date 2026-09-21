import confetti from "canvas-confetti";

// Brand tokens: invoice blue, accent orange, success emerald.
const BRAND_COLORS = ["#2563eb", "#f97316", "#10b981"];

/**
 * Short confetti burst marking an invoice being settled in full.
 *
 * Deliberately a plain function rather than the <Confetti> component: both call
 * sites unmount on success (the invoice dialog closes, the bulk sheet closes),
 * which would kill a ref-held <canvas> mid-animation. canvas-confetti's global
 * export mounts its own canvas on document.body and cleans up after itself.
 *
 * Origin sits just under the top-center toast so the two read as one beat.
 * Fire-and-forget: never awaited, never gates the toast or the ledger write.
 */
export function celebrateSettlement() {
  confetti({
    particleCount: 60,
    spread: 70,
    startVelocity: 35,
    ticks: 120,
    origin: { x: 0.5, y: 0.2 },
    colors: BRAND_COLORS,
    disableForReducedMotion: true,
  });
}
