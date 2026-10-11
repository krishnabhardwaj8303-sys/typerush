import { TEXT_LANG_LABEL, quickRaceChars, quickRaceOpponents, levelsFor, type Difficulty, type LevelDef, type TextLang } from '@typerush/shared';
import { dailyInfo, dailyOpponents, dayKey } from '../lib/rewards';
import type { AssignmentSpec, SubmitTarget } from '../lib/cloud';
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

export function quickConfig(difficulty: Difficulty, opponentCount: number, seed: number, lang: TextLang = 'en'): SoloConfig {
  return {
    mode: 'quick',
    difficulty,
    tier: 3,
    chars: quickRaceChars(difficulty),
    minAccuracy: null,
    opponents: quickRaceOpponents(difficulty, opponentCount),
    seed,
    title: `Practice: ${difficulty[0].toUpperCase()}${difficulty.slice(1)}${lang === 'en' ? '' : ` (${TEXT_LANG_LABEL[lang]})`}`,
    ...(lang === 'en' ? {} : { lang }),
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

/** A text handed out by the server (Weekly Cup or a class): same text, track and opponents for everyone. */
export function assignmentConfig(spec: AssignmentSpec, title: string, submit: SubmitTarget): SoloConfig {
  return {
    mode: 'quick',
    difficulty: spec.difficulty,
    tier: spec.tier,
    chars: spec.chars,
    minAccuracy: null,
    opponents: dailyOpponents(spec.difficulty),
    seed: spec.seed,
    title,
    submit,
    ...(spec.lang && spec.lang !== 'en' ? { lang: spec.lang } : {}),
  };
}
