import { createRng, type Rng } from './rng';
import { computeAccuracy, computeWpm } from './typing';
import type { CarId } from './types';

export interface AiProfile {
  id: string;
  name: string;
  car: CarId;
  /** Target NET words per minute (what a result screen would show). */
  wpm: number;
  /** 0..100: share of keystrokes that are correct. */
  accuracy: number;
  /** 0..1: how uneven the rhythm is. 0 = metronome, 0.5 = very bursty. */
  jitter: number;
}

/**
 * A keystroke-level simulation of a human typist.
 *
 * - Every key press happens at a simulated time. A wrong key does NOT advance
 *   progress and costs recovery time, exactly like the human rules.
 * - The base interval is calibrated so that the NET speed matches `profile.wpm`
 *   even after mistakes are paid for.
 * - Tempo drifts smoothly (fast stretches, slow stretches) for realism.
 *
 * Call update(raceMs) with the elapsed race time; it advances deterministically.
 */
export class AiTypist {
  readonly profile: AiProfile;
  readonly textLength: number;
  correct = 0;
  errors = 0;
  finishMs: number | null = null;

  private rng: Rng;
  private baseInterval: number;
  private nextKeyAt: number;
  private tempo = 1;
  private tempoTarget = 1;
  private tempoCharsLeft = 0;

  constructor(profile: AiProfile, textLength: number, seed: number) {
    this.profile = profile;
    this.textLength = textLength;
    this.rng = createRng(seed);

    const target = 60000 / (Math.max(1, profile.wpm) * 5); // ms per net char
    const errorRate = Math.min(0.5, Math.max(0, 1 - profile.accuracy / 100));
    const errorsPerCorrect = errorRate / (1 - errorRate);
    // time per correct char = base + errorsPerCorrect * (1.5 * base + 120)
    const base = (target - 120 * errorsPerCorrect) / (1 + 1.5 * errorsPerCorrect);
    this.baseInterval = Math.max(target * 0.3, base);

    // Human reaction time before the first key.
    this.nextKeyAt = 350 + this.rng() * 350;
  }

  get progress(): number {
    return this.textLength <= 0 ? 0 : Math.min(1, this.correct / this.textLength);
  }

  get finished(): boolean {
    return this.finishMs !== null;
  }

  get wpm(): number {
    return computeWpm(this.correct, this.finishMs ?? this.lastTime);
  }

  get accuracy(): number {
    return computeAccuracy(this.correct, this.errors);
  }

  private lastTime = 0;

  update(raceMs: number): void {
    this.lastTime = raceMs;
    while (this.finishMs === null && this.nextKeyAt <= raceMs) {
      this.pressKey(this.nextKeyAt);
    }
  }

  private pressKey(at: number): void {
    // Drift the tempo toward a new target every few characters.
    if (this.tempoCharsLeft <= 0) {
      const spread = this.profile.jitter;
      this.tempoTarget = 1 + (this.rng() - 0.5) * 2 * spread * 0.6;
      this.tempoCharsLeft = 4 + Math.floor(this.rng() * 8);
    }
    this.tempoCharsLeft--;
    this.tempo += (this.tempoTarget - this.tempo) * 0.35;

    const keyJitter = 1 + (this.rng() - 0.5) * 2 * this.profile.jitter * 0.5;
    const interval = this.baseInterval * this.tempo * keyJitter;

    const errorRate = Math.min(0.5, Math.max(0, 1 - this.profile.accuracy / 100));
    if (this.rng() < errorRate) {
      this.errors++;
      this.nextKeyAt = at + interval * 1.5 + 120;
      return;
    }

    this.correct++;
    if (this.correct >= this.textLength) {
      this.finishMs = at;
      return;
    }
    this.nextKeyAt = at + interval;
  }
}
