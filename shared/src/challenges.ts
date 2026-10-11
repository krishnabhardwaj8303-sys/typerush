import { dailyScore } from './daily';
import { quickRaceChars } from './levels';
import type { Difficulty } from './types';

// Weekly Cup and Classroom assignments: like the Daily Challenge, the text is re-created from a seed
// so the server can check a submitted run. Shared so client and server always agree.

export interface AssignmentInfo {
  key: string;
  difficulty: Difficulty;
  chars: number;
  seed: number;
  tier: number;
}

export const ASSIGNMENT_TIER = 3;
export const CUP_MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function assignmentInfo(key: string, difficulty: Difficulty): AssignmentInfo {
  return { key, difficulty, chars: quickRaceChars(difficulty), seed: hashText(`typerush-assignment-${key}`), tier: ASSIGNMENT_TIER };
}

/** The Monday (UTC) that starts the week of `at`, as YYYY-MM-DD. */
export function weekStartDay(at: number): string {
  const d = new Date(at);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

export interface CupInfo extends AssignmentInfo {
  week: string;
  startsAt: number;
  endsAt: number;
}

/** The Weekly Cup: one hard or expert text for everybody from Monday to Sunday (UTC). */
export function cupInfo(at: number): CupInfo {
  const week = weekStartDay(at);
  const startsAt = Date.parse(`${week}T00:00:00Z`);
  const difficulty: Difficulty = hashText(`cup-${week}`) % 2 === 0 ? 'hard' : 'expert';
  return { ...assignmentInfo(`cup-${week}`, difficulty), week, startsAt, endsAt: startsAt + 7 * DAY_MS };
}

/** The current text of a classroom: the teacher starts a new round to hand out a new text. */
export function classInfo(classId: string, round: number, difficulty: Difficulty): AssignmentInfo {
  return assignmentInfo(`class-${classId}-${round}`, difficulty);
}

export const assignmentScore = dailyScore;
