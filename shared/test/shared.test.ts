import { describe, expect, it } from 'vitest';
import {
  AiTypist,
  LEVELS,
  calculateScore,
  computeAccuracy,
  computeWpm,
  generateText,
  isLevelUnlocked,
  isTypableText,
  levelsFor,
  quickRaceOpponents,
  DIFFICULTIES,
  TRACK_THEME_NAMES,
} from '../src';

describe('typing metrics', () => {
  it('computes WPM with the 5-chars-per-word convention', () => {
    expect(computeWpm(250, 60000)).toBe(50);
    expect(computeWpm(0, 1000)).toBe(0);
    expect(computeWpm(100, 0)).toBe(0);
    expect(computeWpm(Number.NaN, 1000)).toBe(0);
  });

  it('computes accuracy as correct / all keystrokes', () => {
    expect(computeAccuracy(90, 10)).toBe(90);
    expect(computeAccuracy(0, 0)).toBe(100);
    expect(computeAccuracy(-5, 5)).toBe(0);
  });
});

describe('scoring', () => {
  const base = {
    totalRacers: 4,
    wpm: 60,
    accuracy: 96,
    finished: true,
    progress: 1,
    difficulty: 'medium' as const,
  };

  it('matches the documented formula', () => {
    const s = calculateScore({ ...base, position: 1 });
    // 50 + 100 + 120 + 80 = 350 * 1.25 = 437.5 -> 438
    expect(s.completion).toBe(50);
    expect(s.placement).toBe(100);
    expect(s.speed).toBe(120);
    expect(s.accuracy).toBe(80);
    expect(s.total).toBe(438);
  });

  it('rewards earlier positions more', () => {
    const totals = [1, 2, 3, 4].map((position) => calculateScore({ ...base, position }).total);
    expect(totals[0]).toBeGreaterThan(totals[1]);
    expect(totals[1]).toBeGreaterThan(totals[2]);
    expect(totals[2]).toBeGreaterThan(totals[3]);
  });

  it('gives no placement bonus when racing alone', () => {
    expect(calculateScore({ ...base, totalRacers: 1, position: 1 }).placement).toBe(0);
  });

  it('never returns negative or non-integer totals, even for hostile input', () => {
    const weird = [
      { wpm: -50, accuracy: -10 },
      { wpm: 99999, accuracy: 500 },
      { wpm: Number.NaN, accuracy: Number.NaN },
      { wpm: Infinity, accuracy: Infinity },
    ];
    for (const w of weird) {
      for (const difficulty of DIFFICULTIES) {
        const s = calculateScore({ ...base, ...w, position: 0, difficulty });
        expect(Number.isInteger(s.total)).toBe(true);
        expect(s.total).toBeGreaterThanOrEqual(0);
        // theoretical maximum: (50 + 100 + 400 + 100) * 2 = 1300
        expect(s.total).toBeLessThanOrEqual(1300);
      }
    }
  });

  it('gives small participation points for DNF and zero for disqualification', () => {
    const dnf = calculateScore({ ...base, finished: false, progress: 0.5, position: 4 });
    expect(dnf.total).toBe(10);
    const dq = calculateScore({ ...base, disqualified: true, position: 4 });
    expect(dq.total).toBe(0);
  });

  it('gives low accuracy no accuracy bonus', () => {
    expect(calculateScore({ ...base, accuracy: 75, position: 1 }).accuracy).toBe(0);
  });
});

describe('text generation', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = generateText('hard', 180, 42);
    expect(generateText('hard', 180, 42)).toBe(a);
    expect(generateText('hard', 180, 43)).not.toBe(a);
  });

  it('only produces typable ASCII and respects the target length roughly', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 25; seed++) {
        const text = generateText(difficulty, 120, seed, 3);
        expect(text.length).toBeGreaterThan(20);
        expect(text.length).toBeLessThanOrEqual(Math.ceil(120 * 1.25));
        expect(isTypableText(text)).toBe(true);
        expect(text).toBe(text.trim());
      }
    }
  });

  it('really changes the content with difficulty', () => {
    const easy = generateText('easy', 100, 7, 3);
    const medium = generateText('medium', 100, 7);
    const hard = generateText('hard', 200, 7);
    const expert = generateText('expert', 250, 7);
    expect(/[^a-z ]/.test(easy)).toBe(false); // lowercase letters + spaces only
    expect(/[.,?]/.test(medium)).toBe(true);
    expect(/[A-Z]/.test(hard)).toBe(true);
    expect(/[0-9]/.test(expert)).toBe(true);
    const avgWord = (t: string) => t.split(' ').reduce((n, w) => n + w.length, 0) / t.split(' ').length;
    expect(avgWord(easy)).toBeLessThan(avgWord(hard));
  });

  it('keeps easy levels 1-2 on the home row', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(/^[asdfghjkl ]+$/.test(generateText('easy', 40, seed, 1))).toBe(true);
    }
  });
});

describe('AI typists', () => {
  it('reach the target net WPM within a reasonable tolerance', () => {
    for (const level of LEVELS) {
      for (const bot of level.opponents) {
        const speeds: number[] = [];
        for (let seed = 1; seed <= 12; seed++) {
          const ai = new AiTypist(bot, 600, seed * 977);
          ai.update(120 * 60 * 1000);
          expect(ai.finished).toBe(true);
          speeds.push(ai.wpm);
        }
        const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        expect(mean).toBeGreaterThan(bot.wpm * 0.85);
        expect(mean).toBeLessThan(bot.wpm * 1.15);
      }
    }
  });

  it('makes mistakes in line with the configured accuracy and never advances on them', () => {
    const ai = new AiTypist(
      { id: 't', name: 't', car: 'wave', wpm: 40, accuracy: 90, jitter: 0.2 },
      2000,
      5,
    );
    ai.update(60 * 60 * 1000);
    expect(ai.correct).toBe(2000);
    expect(ai.accuracy).toBeGreaterThan(86);
    expect(ai.accuracy).toBeLessThan(94);
    expect(ai.errors).toBeGreaterThan(100);
  });

  it('is deterministic per seed and advances monotonically', () => {
    const profile = LEVELS[3].opponents[1];
    const a = new AiTypist(profile, 80, 11);
    const b = new AiTypist(profile, 80, 11);
    let last = 0;
    for (let t = 0; t <= 20000; t += 100) {
      a.update(t);
      expect(a.correct).toBeGreaterThanOrEqual(last);
      last = a.correct;
    }
    b.update(20000);
    expect(b.correct).toBe(a.correct);
  });
});

describe('levels', () => {
  it('defines 100 levels, 25 per difficulty, with rising difficulty', () => {
    expect(LEVELS).toHaveLength(100);
    for (const d of DIFFICULTIES) expect(levelsFor(d)).toHaveLength(25);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].topBotWpm).toBeGreaterThan(LEVELS[i - 1].topBotWpm);
      expect(LEVELS[i].chars).toBeGreaterThanOrEqual(
        LEVELS[i].difficulty === LEVELS[i - 1].difficulty ? LEVELS[i - 1].chars : 0,
      );
    }
  });

  it('gives every level a valid track theme and a growing number of turns', () => {
    for (const level of LEVELS) {
      expect(level.theme).toBeGreaterThanOrEqual(0);
      expect(level.theme).toBeLessThan(TRACK_THEME_NAMES.length);
      expect(level.turns).toBeGreaterThanOrEqual(1);
    }
    for (const d of DIFFICULTIES) {
      const turns = levelsFor(d).map((l) => l.turns);
      expect(turns).toEqual([...turns].sort((x, y) => x - y));
      // every difficulty uses all 10 themes
      expect(new Set(levelsFor(d).map((l) => l.theme)).size).toBe(10);
    }
  });

  it('keeps the first levels beginner friendly', () => {
    expect(LEVELS[0].topBotWpm).toBeLessThanOrEqual(12);
    expect(LEVELS[0].chars).toBeLessThanOrEqual(30);
    expect(LEVELS[0].minAccuracy).toBeLessThanOrEqual(60);
  });

  it('unlocks sequentially', () => {
    expect(isLevelUnlocked(1, {})).toBe(true);
    expect(isLevelUnlocked(2, {})).toBe(false);
    expect(isLevelUnlocked(2, { 1: 1 })).toBe(true);
    expect(isLevelUnlocked(3, { 1: 1 })).toBe(false);
  });

  it('builds quick-race line-ups', () => {
    expect(quickRaceOpponents('hard', 2)).toHaveLength(2);
    expect(quickRaceOpponents('hard', 9)).toHaveLength(3);
  });
});
