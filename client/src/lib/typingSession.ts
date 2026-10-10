import { computeAccuracy, computeWpm, progressFraction } from '@typerush/shared';

export type PressResult = 'correct' | 'wrong' | 'done' | 'ignored';

/**
 * Pure typing rules (no timers, no DOM):
 *  - only the next expected character advances the cursor
 *  - a wrong key never advances progress; it is counted as an error
 *  - no backspace is needed (nothing wrong is ever entered)
 *
 * Time is passed in by the caller so pausing and server-synced clocks are easy.
 */
export class TypingSession {
  pos = 0;
  correct = 0;
  errors = 0;
  finishedAtMs: number | null = null;

  constructor(readonly text: string) {}

  get done(): boolean {
    return this.pos >= this.text.length;
  }

  get expected(): string {
    return this.text[this.pos] ?? '';
  }

  /** Rebuilds the session after a reconnect, from the server's validated counts. */
  restore(correct: number, errors: number): void {
    const safe = Math.max(0, Math.min(this.text.length, Math.floor(correct)));
    this.pos = safe;
    this.correct = safe;
    this.errors = Math.max(0, Math.floor(errors));
  }

  press(key: string, raceMs: number): PressResult {
    if (this.done || key.length !== 1) return 'ignored';
    if (key === this.text[this.pos]) {
      this.pos++;
      this.correct++;
      if (this.done) {
        this.finishedAtMs = Math.max(1, raceMs);
        return 'done';
      }
      return 'correct';
    }
    this.errors++;
    return 'wrong';
  }

  wpm(raceMs: number): number {
    return computeWpm(this.correct, this.finishedAtMs ?? raceMs);
  }

  /** Live WPM that does not explode in the first second of the race. */
  liveWpm(raceMs: number): number {
    if (this.finishedAtMs !== null) return computeWpm(this.correct, this.finishedAtMs);
    return computeWpm(this.correct, Math.max(raceMs, 2000));
  }

  accuracy(): number {
    return computeAccuracy(this.correct, this.errors);
  }

  progress(): number {
    return progressFraction(this.correct, this.text.length);
  }
}
