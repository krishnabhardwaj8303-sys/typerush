import { quickRaceChars, quickRaceOpponents, levelsFor, type Difficulty, type LevelDef } from '@typerush/shared';
import { dailyInfo, dailyOpponents, dayKey } from '../lib/rewards';
import type { SoloConfig } from './SoloRace';

export function levelToConfig(level: LevelDef, seed: number): SoloConfig {
  return {
    mode: 'level',
    levelId: level.id,
    difficulty: level.difficulty,
    tier: level.tier,
    chars: level.chars,
    minAccuracy: level.minAccuracy,
    opponents: level.opponents,
    seed,
    title: `Level ${level.id}: ${level.name}`,
  };
}

export function quickConfig(difficulty: Difficulty, opponentCount: number, seed: number): SoloConfig {
  return {
    mode: 'quick',
    difficulty,
    tier: 3,
    chars: quickRaceChars(difficulty),
    minAccuracy: null,
    opponents: quickRaceOpponents(difficulty, opponentCount),
    seed,
    title: `Practice: ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`,
  };
}

export function nextLevelOf(levelId: number): LevelDef | undefined {
  for (const d of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const levels = levelsFor(d);
    const idx = levels.findIndex((l) => l.id === levelId + 1);
    if (idx >= 0) return levels[idx];
  }
  return undefined;
}

/** Today's Daily Challenge: same text, difficulty, track and opponents for everybody. */
export function dailyConfig(day: string = dayKey()): SoloConfig {
  const info = dailyInfo(day);
  return {
    mode: 'daily',
    difficulty: info.difficulty,
    tier: 3,
    chars: info.chars,
    minAccuracy: null,
    opponents: dailyOpponents(info.difficulty),
    seed: info.seed,
    title: `Daily Challenge (${info.day})`,
    day: info.day,
  };
}
