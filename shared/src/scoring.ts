import type { Difficulty, ScoreBreakdown } from './types';

/**
 * TYPERUSH SCORING FORMULA
 * ------------------------
 * If the player FINISHED the text:
 *   completion = 50
 *   placement  = 100 / 60 / 35 / 15 for 1st / 2nd / 3rd / 4th+   (0 when racing alone)
 *   speed      = round(min(WPM, 200) * 2)                         (0..400)
 *   accuracy   = clamp(round((accuracy% - 80) * 5), 0, 100)       (0 at <=80%, 100 at 100%)
 *   subtotal   = completion + placement + speed + accuracy
 *   total      = round(subtotal * difficultyMultiplier)
 *   multiplier = easy 1.0, medium 1.25, hard 1.5, expert 2.0
 *
 * If the player did NOT finish (left, timed out, disqualified):
 *   participation = round(progress * 20)   (0..20, never multiplied)
 *   total         = participation, or 0 when disqualified
 *
 * Totals are always whole numbers >= 0.
 */

export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.25,
  hard: 1.5,
  expert: 2,
};

const PLACEMENT_POINTS = [100, 60, 35];
const PLACEMENT_DEFAULT = 15;

export interface ScoreInput {
  /** 1-based finishing position (or rank among all racers). */
  position: number;
  /** Everyone who started the race, humans and bots. */
  totalRacers: number;
  wpm: number;
  /** 0..100 */
  accuracy: number;
  finished: boolean;
  /** 0..1 fraction of the text typed correctly. */
  progress: number;
  difficulty: Difficulty;
  disqualified?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const multiplier = DIFFICULTY_MULTIPLIER[input.difficulty] ?? 1;
  const progress = clamp(input.progress, 0, 1);

  if (input.disqualified) {
    return { completion: 0, placement: 0, speed: 0, accuracy: 0, participation: 0, multiplier, total: 0 };
  }

  if (!input.finished) {
    const participation = Math.round(progress * 20);
    return {
      completion: 0,
      placement: 0,
      speed: 0,
      accuracy: 0,
      participation,
      multiplier,
      total: participation,
    };
  }

  const position = Math.max(1, Math.floor(input.position) || 1);
  const completion = 50;
  const placement =
    input.totalRacers > 1 ? (PLACEMENT_POINTS[position - 1] ?? PLACEMENT_DEFAULT) : 0;
  const speed = Math.round(clamp(input.wpm, 0, 200) * 2);
  const accuracy = clamp(Math.round((clamp(input.accuracy, 0, 100) - 80) * 5), 0, 100);
  const subtotal = completion + placement + speed + accuracy;
  const total = Math.max(0, Math.round(subtotal * multiplier));

  return { completion, placement, speed, accuracy, participation: 0, multiplier, total };
}

/** Human readable one-liner of the formula, shown in the Results / Settings help. */
export const SCORING_EXPLANATION = [
  'Finish the race: +50',
  'Placement: 1st +100, 2nd +60, 3rd +35, others +15 (not awarded when racing alone)',
  'Speed: +2 points per WPM (up to 200 WPM)',
  'Accuracy: 0 points at 80% or lower, up to +100 at 100%',
  'Then multiplied by difficulty: Easy x1, Medium x1.25, Hard x1.5, Expert x2',
  'Did not finish: up to 20 points for how far you got. Disqualified: 0.',
];
