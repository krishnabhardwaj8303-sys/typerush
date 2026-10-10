// Pure typing metric helpers. Used by the client HUD, the AI simulation,
// and the server when it validates results.

/** Standard typing-test convention: 5 characters = 1 word. */
export const CHARS_PER_WORD = 5;

/** Net WPM based on correctly typed characters only. */
export function computeWpm(correctChars: number, elapsedMs: number): number {
  if (!Number.isFinite(correctChars) || !Number.isFinite(elapsedMs)) return 0;
  if (correctChars <= 0 || elapsedMs <= 0) return 0;
  const minutes = elapsedMs / 60000;
  return Math.round((correctChars / CHARS_PER_WORD / minutes) * 10) / 10;
}

/** Accuracy percentage = correct keystrokes / all keystrokes. 100 when nothing typed. */
export function computeAccuracy(correctKeystrokes: number, errorKeystrokes: number): number {
  const correct = Math.max(0, correctKeystrokes);
  const errors = Math.max(0, errorKeystrokes);
  const total = correct + errors;
  if (total === 0) return 100;
  return Math.round((correct / total) * 1000) / 10;
}

export function progressFraction(correctChars: number, textLength: number): number {
  if (textLength <= 0) return 0;
  return Math.min(1, Math.max(0, correctChars / textLength));
}

export function formatTime(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safe % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
