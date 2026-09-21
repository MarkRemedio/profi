/**
 * Notification sounds, synthesised in the browser.
 *
 * Built from oscillators rather than audio files: nothing to host, nothing to
 * download, no licence to track, and they work offline. Each is a few notes
 * with an envelope, which is all a notification chime is.
 *
 * Kept deliberately short and quiet. A sound that plays whenever the bell finds
 * an overdue invoice will be heard many times a day by somebody working in the
 * ledger all afternoon, and the fastest way to have it muted permanently is to
 * make it loud.
 */

export type NotificationSound = "chime" | "ping" | "marimba" | "pop" | "none";

export const NOTIFICATION_SOUNDS: Array<{
  value: NotificationSound;
  label: string;
  description: string;
}> = [
  { value: "chime", label: "Chime", description: "Two soft bell notes" },
  { value: "ping", label: "Ping", description: "A single clean tone" },
  { value: "marimba", label: "Marimba", description: "Warm and wooden" },
  { value: "pop", label: "Pop", description: "Very short, barely there" },
  { value: "none", label: "Silent", description: "No sound, badge only" },
];

export function isNotificationSound(value: unknown): value is NotificationSound {
  return NOTIFICATION_SOUNDS.some((sound) => sound.value === value);
}

/** One note: a frequency, when it starts, how long it rings, and how loud. */
type Note = { freq: number; at: number; length: number; gain: number; type: OscillatorType };

const RECIPES: Record<Exclude<NotificationSound, "none">, Note[]> = {
  // C6 into E6 — a rising third, which reads as "something arrived" rather
  // than "something is wrong".
  chime: [
    { freq: 1046.5, at: 0, length: 0.5, gain: 0.16, type: "sine" },
    { freq: 1318.5, at: 0.09, length: 0.55, gain: 0.14, type: "sine" },
  ],
  ping: [{ freq: 880, at: 0, length: 0.35, gain: 0.18, type: "sine" }],
  // A triangle wave with a fast decay is close enough to struck wood.
  marimba: [
    { freq: 659.3, at: 0, length: 0.32, gain: 0.2, type: "triangle" },
    { freq: 987.8, at: 0.05, length: 0.28, gain: 0.12, type: "triangle" },
  ],
  pop: [{ freq: 440, at: 0, length: 0.12, gain: 0.12, type: "sine" }],
};

/**
 * Plays a sound, if the browser will allow it.
 *
 * Never throws. Autoplay policies block audio until the user has interacted
 * with the page, so the first attempt after a cold load may legitimately do
 * nothing — that is not worth surfacing as an error, and certainly not worth
 * breaking the notification panel over.
 */
export async function playNotificationSound(sound: NotificationSound): Promise<void> {
  if (sound === "none" || typeof window === "undefined") return;

  const notes = RECIPES[sound];
  if (!notes) return;

  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = new AudioCtor();
    // Suspended until a gesture has happened; resuming is a no-op if it is
    // already running and rejects harmlessly if the policy still forbids it.
    if (ctx.state === "suspended") await ctx.resume();

    const start = ctx.currentTime;
    let end = start;

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.value = note.freq;

      const noteStart = start + note.at;
      const noteEnd = noteStart + note.length;

      // A short attack then an exponential fall. Ramping to a small positive
      // value rather than zero: exponentialRampToValueAtTime rejects zero, and
      // a linear fall to silence sounds like the note was cut off.
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      osc.connect(gain).connect(ctx.destination);
      osc.start(noteStart);
      osc.stop(noteEnd);
      if (noteEnd > end) end = noteEnd;
    }

    // Contexts are a limited resource — browsers cap how many a page may hold
    // open, so one per sound must be closed or the audio stops after a few
    // dozen notifications.
    window.setTimeout(() => void ctx.close().catch(() => {}), (end - start) * 1000 + 200);
  } catch {
    // Blocked, unsupported, or no output device. Silence is an acceptable
    // outcome for a notification chime.
  }
}
