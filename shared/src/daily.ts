import { calculateScore } from './scoring';
import { quickRaceChars } from './levels';
import type { Difficulty, ScoreBreakdown } from './types';

// The Daily Challenge: everybody gets the same difficulty, text and track on the same calendar day.
// This file is shared so that the server can re-create the challenge when it checks a submitted result.

export interface DailyInfo {
  day: string;
  difficulty: Difficulty;
  chars: number;
  seed: number;
}

/** Difficulty for each weekday (0 = Sunday). */
export const DAILY_BY_WEEKDAY: Difficulty[] = ['medium', 'easy', 'medium', 'hard', 'medium', 'hard', 'expert'];

/** Text "tier" used when the daily text is generated. */
export const DAILY_TIER = 3;

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hashDay(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Weekday of a YYYY-MM-DD string, independent of the time zone of the machine. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function dailyInfo(day: string): DailyInfo {
  const difficulty = DAILY_BY_WEEKDAY[weekdayOf(day)];
  return { day, difficulty, chars: quickRaceChars(difficulty), seed: hashDay(`typerush-${day}`) };
}

/** Score used on the Daily Challenge board: the same formula as races, without a placement bonus. */
export function dailyScore(wpm: number, accuracy: number, difficulty: Difficulty): ScoreBreakdown {
  return calculateScore({ position: 1, totalRacers: 1, wpm, accuracy, finished: true, progress: 1, difficulty });
}

export interface KeyLogLimits {
  /** Average characters per second that no human can sustain. */
  maxAvgCps: number;
  /** Same limit over any window of 10 characters (short bursts are allowed to be faster). */
  maxBurstCps: number;
}

export const DEFAULT_KEYLOG_LIMITS: KeyLogLimits = { maxAvgCps: 20, maxBurstCps: 30 };

export type KeyLogCheck = { ok: true; durationMs: number } | { ok: false; reason: string };

/**
 * Plausibility check for a recorded typing run: `times[i]` is the time in milliseconds (since the
 * race started) at which character i was typed correctly. It cannot prove a person typed it, but it
 * rejects impossible speeds, wrong lengths and timestamps that go backwards.
 */
export function checkKeyLog(times: unknown, expectedLength: number, limits: KeyLogLimits = DEFAULT_KEYLOG_LIMITS): KeyLogCheck {
  if (!Array.isArray(times) || times.length !== expectedLength) return { ok: false, reason: 'wrong length' };
  let prev = 0;
  for (const t of times) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t < prev || t > 3_600_000) return { ok: false, reason: 'bad timestamps' };
    prev = t;
  }
  const total = times[times.length - 1] as number;
  if (total < 500) return { ok: false, reason: 'too fast' };
  if (expectedLength / (total / 1000) > limits.maxAvgCps) return { ok: false, reason: 'too fast' };
  const w = 10;
  for (let i = w; i < times.length; i++) {
    const span = (times[i] as number) - (times[i - w] as number);
    if (span <= 0 || w / (span / 1000) > limits.maxBurstCps) return { ok: false, reason: 'too fast' };
  }
  return { ok: true, durationMs: total };
}
