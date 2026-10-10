import { describe, expect, it } from 'vitest';
import { CARS } from '@typerush/shared';
import {
  BADGES,
  activeStreak,
  applyRace,
  bumpStreak,
  dailyInfo,
  dayKey,
  isOwned,
  newlyEarned,
  previousDay,
  purchase,
  raceCoins,
} from './rewards';
import { SKINS, TRAILS } from './shop';
import { defaultProfile, parseProfile, type Profile, type RaceRecord } from './storage';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30);

const race = (over: Partial<RaceRecord> = {}): RaceRecord => ({
  mode: 'quick',
  difficulty: 'easy',
  wpm: 30,
  accuracy: 95,
  score: 80,
  position: 2,
  racers: 4,
  finished: true,
  ...over,
});

describe('days and streaks', () => {
  it('formats local days and finds the previous day across month and year ends', () => {
    expect(dayKey(at(2026, 3, 9))).toBe('2026-03-09');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });

  it('counts consecutive days, ignores the same day and restarts after a gap', () => {
    let s = { count: 0, best: 0, lastDay: null as string | null };
    let r = bumpStreak(s, '2026-10-01');
    expect(r).toMatchObject({ isNewDay: true, streak: { count: 1, best: 1 } });
    s = r.streak;
    r = bumpStreak(s, '2026-10-01');
    expect(r.isNewDay).toBe(false);
    expect(r.streak.count).toBe(1);
    r = bumpStreak(s, '2026-10-02');
    expect(r.streak.count).toBe(2);
    s = r.streak;
    r = bumpStreak(s, '2026-10-05');
    expect(r.streak).toMatchObject({ count: 1, best: 2 });
  });

  it('shows a streak as alive only for today or yesterday', () => {
    const s = { count: 4, best: 6, lastDay: '2026-10-08' };
    expect(activeStreak(s, '2026-10-08')).toBe(4);
    expect(activeStreak(s, '2026-10-09')).toBe(4);
    expect(activeStreak(s, '2026-10-10')).toBe(0);
  });
});

describe('daily challenge', () => {
  it('is the same for everybody on one day and changes from day to day', () => {
    expect(dailyInfo('2026-10-10')).toEqual(dailyInfo('2026-10-10'));
    const seeds = new Set(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map((d) => dailyInfo(d).seed));
    expect(seeds.size).toBe(4);
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-12']) {
      expect(['easy', 'medium', 'hard', 'expert']).toContain(dailyInfo(d).difficulty);
      expect(dailyInfo(d).chars).toBeGreaterThan(20);
    }
  });
});

describe('coins and badges', () => {
  it('turns points into whole, bounded coin amounts', () => {
    expect(raceCoins(0)).toBe(0);
    expect(raceCoins(-50)).toBe(0);
    expect(raceCoins(80)).toBe(10);
    expect(raceCoins(100000)).toBe(150);
    expect(Number.isInteger(raceCoins(77))).toBe(true);
  });

  it('gives coins, a first-race badge and a streak for a first race', () => {
    const { profile, reward } = applyRace(defaultProfile(), race(), at(2026, 10, 10));
    expect(reward.coins).toBe(profile.coins);
    expect(profile.lifetimeCoins).toBe(profile.coins);
    expect(profile.races).toBe(1);
    expect(reward.streak).toEqual({ count: 1, isNewDay: true });
    expect(reward.badges.map((b) => b.id)).toContain('first-race');
    expect(reward.parts.reduce((a, p) => a + p.coins, 0)).toBe(reward.coins);
    // the same race on the same day adds no second streak bonus
    const again = applyRace(profile, race(), at(2026, 10, 10));
    expect(again.reward.streak.isNewDay).toBe(false);
    expect(again.reward.parts.some((p) => p.label.includes('streak'))).toBe(false);
  });

  it('never gives a badge twice', () => {
    const first = applyRace(defaultProfile(), race(), at(2026, 10, 10)).profile;
    expect(newlyEarned(first)).toEqual([]);
    const second = applyRace(first, race(), at(2026, 10, 10));
    expect(second.reward.badges.map((b) => b.id)).not.toContain('first-race');
  });

  it('pays star coins only for stars that are new', () => {
    const lvl = race({ mode: 'level', levelId: 3, stars: 2, score: 0 });
    const a = applyRace(defaultProfile(), lvl, at(2026, 10, 10));
    expect(a.reward.parts.find((p) => p.label === 'New stars')?.coins).toBe(20);
    const b = applyRace(a.profile, { ...lvl, stars: 3 }, at(2026, 10, 10));
    expect(b.reward.parts.find((p) => p.label === 'New stars')?.coins).toBe(10);
    const c = applyRace(b.profile, { ...lvl, stars: 1 }, at(2026, 10, 10));
    expect(c.reward.parts.find((p) => p.label === 'New stars')).toBeUndefined();
  });

  it('pays the Daily Challenge bonus once per day and keeps the best result', () => {
    const d1 = applyRace(defaultProfile(), race({ mode: 'daily', score: 100, wpm: 40 }), at(2026, 10, 10));
    expect(d1.reward.dailyFirst).toBe(true);
    expect(d1.profile.stats.dailiesDone).toBe(1);
    const d2 = applyRace(d1.profile, race({ mode: 'daily', score: 60, wpm: 20 }), at(2026, 10, 10));
    expect(d2.reward.dailyFirst).toBe(false);
    expect(d2.profile.daily?.plays).toBe(2);
    expect(d2.profile.daily?.best.wpm).toBe(40);
    const d3 = applyRace(d2.profile, race({ mode: 'daily', score: 150, wpm: 55 }), at(2026, 10, 10));
    expect(d3.profile.daily?.best.wpm).toBe(55);
    const next = applyRace(d3.profile, race({ mode: 'daily' }), at(2026, 10, 11));
    expect(next.reward.dailyFirst).toBe(true);
    expect(next.profile.stats.dailiesDone).toBe(2);
  });

  it('counts perfect races and awards speed badges', () => {
    const p = applyRace(defaultProfile(), race({ accuracy: 100, wpm: 65 }), at(2026, 10, 10));
    expect(p.profile.stats.perfectRaces).toBe(1);
    const ids = p.reward.badges.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['perfect', 'wpm-40', 'wpm-60']));
  });

  it('does not count unfinished races for streaks, but still pays small participation coins', () => {
    const { profile, reward } = applyRace(defaultProfile(), race({ finished: false, score: 16, accuracy: 100 }), at(2026, 10, 10));
    expect(profile.streak.count).toBe(0);
    expect(profile.stats.perfectRaces).toBe(0);
    expect(reward.coins).toBeGreaterThanOrEqual(0);
  });

  it('has unique badge ids and positive rewards', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const b of BADGES) expect(b.coins).toBeGreaterThan(0);
  });
});

describe('shop', () => {
  const rich = (coins: number): Profile => ({ ...defaultProfile(), coins });

  it('starts with the free items only', () => {
    const p = defaultProfile();
    for (const car of CARS) expect(isOwned(p, 'car', car.id)).toBe(car.price === 0);
    for (const s of SKINS) expect(isOwned(p, 'skin', s.id)).toBe(s.price === 0);
    for (const t of TRAILS) expect(isOwned(p, 'trail', t.id)).toBe(t.price === 0);
  });

  it('buys with coins, refuses when poor or already owned, and never goes below zero', () => {
    const poor = purchase(rich(50), 'skin', 'gold');
    expect(poor).toEqual({ ok: false, reason: 'poor' });
    const ok = purchase(rich(100), 'skin', 'stripes');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.profile.coins).toBe(10);
      expect(isOwned(ok.profile, 'skin', 'stripes')).toBe(true);
      expect(purchase(ok.profile, 'skin', 'stripes')).toEqual({ ok: false, reason: 'owned' });
    }
    expect(purchase(rich(1000), 'car', 'nope')).toEqual({ ok: false, reason: 'unknown' });
    const car = purchase(rich(200), 'car', 'comet');
    expect(car.ok && car.profile.coins).toBe(0);
  });

  it('keeps saved profiles safe: unknown or unowned items fall back to the defaults', () => {
    const raw = JSON.stringify({
      ...defaultProfile(),
      coins: -500,
      car: 'shadow',
      skin: 'gold',
      trail: 'rainbow',
      owned: { cars: ['comet', 'banana'], skins: 'oops', trails: [1, 2] },
      streak: { count: 'x', best: 3, lastDay: 'yesterday' },
      badges: { 'first-race': 123, '<script>': 5 },
    });
    const p = parseProfile(raw);
    expect(p.coins).toBe(0);
    expect(p.car).toBe('rocket');
    expect(p.skin).toBe('plain');
    expect(p.trail).toBe('none');
    expect(p.owned.cars).toContain('comet');
    expect(p.owned.cars).not.toContain('banana' as never);
    expect(p.streak.lastDay).toBeNull();
    expect(p.streak.best).toBe(3);
    expect(Object.keys(p.badges)).toEqual(['first-race']);
  });

  it('loads an old profile that has none of the new fields', () => {
    const old = { version: 1, name: 'Old', car: 'wave', totalPoints: 12, races: 3 };
    const p = parseProfile(JSON.stringify(old));
    expect(p.car).toBe('wave');
    expect(p.coins).toBe(0);
    expect(p.owned.skins).toContain('plain');
    expect(p.settings.textSize).toBe('m');
  });
});
