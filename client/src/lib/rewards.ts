// Coins, streaks, badges, the Daily Challenge and the shop rules.
// Everything here is a pure function of (profile, input), so it is easy to test.

import { CARS, dailyInfo, quickRaceOpponents, type CarId, type DailyInfo, type Difficulty } from '@typerush/shared';
import { SKINS, TRAILS, type SkinId, type TrailId } from './shop';
import { recordRace, totalStars, type Profile, type RaceRecord, type Streak } from './storage';

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD (the streak and the Daily Challenge follow the player's own midnight). */
export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function previousDay(day: string): string {
  const d = parseDay(day);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

// ---------------------------------------------------------------- streak

/** Returns the streak after finishing a race on `day`. */
export function bumpStreak(streak: Streak, day: string): { streak: Streak; isNewDay: boolean } {
  if (streak.lastDay === day) return { streak, isNewDay: false };
  const count = streak.lastDay === previousDay(day) ? streak.count + 1 : 1;
  return { streak: { count, best: Math.max(streak.best, count), lastDay: day }, isNewDay: true };
}

/** What the player sees on the menu: a streak is "alive" if today or yesterday had a race. */
export function activeStreak(streak: Streak, today: string): number {
  if (streak.lastDay === today || streak.lastDay === previousDay(today)) return streak.count;
  return 0;
}

// ---------------------------------------------------------------- daily challenge

export { dailyInfo, type DailyInfo };

export function dailyOpponents(difficulty: Difficulty) {
  return quickRaceOpponents(difficulty, 3).map((bot, i) => ({ ...bot, id: `daily-${difficulty}-${i}` }));
}

export function dailyDoneToday(profile: Profile, day: string = dayKey()): boolean {
  return profile.daily?.day === day;
}

// ---------------------------------------------------------------- badges

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  coins: number;
}

interface BadgeRule extends BadgeDef {
  test: (p: Profile) => boolean;
}

const bestWpmOf = (p: Profile) => Math.max(0, ...Object.values(p.bestWpm));

const RULES: BadgeRule[] = [
  { id: 'first-race', name: 'First Lap', desc: 'Finish your first race', coins: 10, test: (p) => p.races >= 1 },
  { id: 'racer-10', name: 'Regular', desc: 'Play 10 races', coins: 20, test: (p) => p.races >= 10 },
  { id: 'racer-50', name: 'Veteran', desc: 'Play 50 races', coins: 60, test: (p) => p.races >= 50 },
  { id: 'first-win', name: 'Winner', desc: 'Win a race against others', coins: 15, test: (p) => p.wins >= 1 },
  { id: 'winner-10', name: 'Champion', desc: 'Win 10 races', coins: 40, test: (p) => p.wins >= 10 },
  { id: 'wpm-40', name: 'Quick Fingers', desc: 'Reach 40 WPM', coins: 20, test: (p) => bestWpmOf(p) >= 40 },
  { id: 'wpm-60', name: 'Speed Typist', desc: 'Reach 60 WPM', coins: 40, test: (p) => bestWpmOf(p) >= 60 },
  { id: 'wpm-80', name: 'Lightning', desc: 'Reach 80 WPM', coins: 70, test: (p) => bestWpmOf(p) >= 80 },
  { id: 'wpm-100', name: 'Hundred Club', desc: 'Reach 100 WPM', coins: 120, test: (p) => bestWpmOf(p) >= 100 },
  { id: 'perfect', name: 'Flawless', desc: 'Finish a race with 100% accuracy', coins: 25, test: (p) => p.stats.perfectRaces >= 1 },
  { id: 'perfect-10', name: 'Precision', desc: 'Finish 10 races with 100% accuracy', coins: 80, test: (p) => p.stats.perfectRaces >= 10 },
  { id: 'streak-3', name: 'On a Roll', desc: 'Play 3 days in a row', coins: 20, test: (p) => p.streak.best >= 3 },
  { id: 'streak-7', name: 'Week Warrior', desc: 'Play 7 days in a row', coins: 60, test: (p) => p.streak.best >= 7 },
  { id: 'streak-30', name: 'Unstoppable', desc: 'Play 30 days in a row', coins: 250, test: (p) => p.streak.best >= 30 },
  { id: 'levels-10', name: 'Rookie Driver', desc: 'Clear 10 levels', coins: 30, test: (p) => Object.keys(p.completed).length >= 10 },
  { id: 'levels-25', name: 'Pro Driver', desc: 'Clear 25 levels', coins: 60, test: (p) => Object.keys(p.completed).length >= 25 },
  { id: 'levels-50', name: 'Road Master', desc: 'Clear 50 levels', coins: 120, test: (p) => Object.keys(p.completed).length >= 50 },
  { id: 'levels-100', name: 'TypeRush Legend', desc: 'Clear all 100 levels', coins: 300, test: (p) => Object.keys(p.completed).length >= 100 },
  { id: 'stars-60', name: 'Star Collector', desc: 'Collect 60 stars', coins: 50, test: (p) => totalStars(p) >= 60 },
  { id: 'daily-1', name: 'Daily Driver', desc: 'Finish a Daily Challenge', coins: 20, test: (p) => p.stats.dailiesDone >= 1 },
  { id: 'daily-7', name: 'Daily Devotee', desc: 'Finish 7 Daily Challenges', coins: 80, test: (p) => p.stats.dailiesDone >= 7 },
];

export const BADGES: BadgeDef[] = RULES.map(({ id, name, desc, coins }) => ({ id, name, desc, coins }));

/** Badges whose rule is now true but which were not earned before. */
export function newlyEarned(profile: Profile): BadgeDef[] {
  return RULES.filter((r) => !profile.badges[r.id] && r.test(profile)).map(({ id, name, desc, coins }) => ({
    id,
    name,
    desc,
    coins,
  }));
}

// ---------------------------------------------------------------- applying a race

export interface RewardPart {
  label: string;
  coins: number;
}

export interface Reward {
  coins: number;
  parts: RewardPart[];
  badges: BadgeDef[];
  streak: { count: number; isNewDay: boolean };
  dailyFirst: boolean;
}

export const COINS_PER_POINT = 1 / 8;
export const MAX_RACE_COINS = 150;
export const STAR_COINS = 10;
export const DAILY_FIRST_COINS = 30;
export const STREAK_COINS_PER_DAY = 3;
export const STREAK_COINS_MAX_DAYS = 7;

export function raceCoins(score: number): number {
  return Math.min(MAX_RACE_COINS, Math.max(0, Math.round(score * COINS_PER_POINT)));
}

/** Applies a finished race to the profile and says what the player earned. */
export function applyRace(profile: Profile, record: RaceRecord, now: Date = new Date()): { profile: Profile; reward: Reward } {
  const day = dayKey(now);
  let next = recordRace(profile, record, now.getTime());
  const parts: RewardPart[] = [];

  const base = raceCoins(record.score);
  if (base > 0) parts.push({ label: 'Race points', coins: base });

  const starsBefore = record.levelId ? (profile.completed[record.levelId] ?? 0) : 0;
  const starsAfter = record.levelId ? (next.completed[record.levelId] ?? 0) : 0;
  if (starsAfter > starsBefore) parts.push({ label: 'New stars', coins: (starsAfter - starsBefore) * STAR_COINS });

  let streakInfo = { count: next.streak.count, isNewDay: false };
  if (record.finished) {
    const bumped = bumpStreak(next.streak, day);
    next = { ...next, streak: bumped.streak };
    streakInfo = { count: bumped.streak.count, isNewDay: bumped.isNewDay };
    if (bumped.isNewDay) {
      const bonus = Math.min(bumped.streak.count, STREAK_COINS_MAX_DAYS) * STREAK_COINS_PER_DAY;
      parts.push({ label: `Day ${bumped.streak.count} streak`, coins: bonus });
    }
    if (record.accuracy >= 100) next = { ...next, stats: { ...next.stats, perfectRaces: next.stats.perfectRaces + 1 } };
  }

  let dailyFirst = false;
  if (record.mode === 'daily' && record.finished) {
    const prev = profile.daily;
    if (prev && prev.day === day) {
      const better = record.score > prev.best.score;
      next = {
        ...next,
        daily: {
          day,
          plays: prev.plays + 1,
          best: better ? { wpm: record.wpm, accuracy: record.accuracy, score: record.score } : prev.best,
        },
      };
    } else {
      dailyFirst = true;
      next = {
        ...next,
        daily: { day, plays: 1, best: { wpm: record.wpm, accuracy: record.accuracy, score: record.score } },
        stats: { ...next.stats, dailiesDone: next.stats.dailiesDone + 1 },
      };
      parts.push({ label: 'Daily Challenge', coins: DAILY_FIRST_COINS });
    }
  }

  const badges = newlyEarned(next);
  if (badges.length) {
    const earned = { ...next.badges };
    for (const b of badges) earned[b.id] = now.getTime();
    next = { ...next, badges: earned };
    for (const b of badges) parts.push({ label: `Badge: ${b.name}`, coins: b.coins });
  }

  const coins = parts.reduce((sum, p) => sum + p.coins, 0);
  next = { ...next, coins: next.coins + coins, lifetimeCoins: next.lifetimeCoins + coins };
  return { profile: next, reward: { coins, parts, badges, streak: streakInfo, dailyFirst } };
}

// ---------------------------------------------------------------- shop

export type ShopKind = 'car' | 'skin' | 'trail';
export type BuyResult = { ok: true; profile: Profile } | { ok: false; reason: 'owned' | 'poor' | 'unknown' };

export function priceOf(kind: ShopKind, id: string): number | null {
  const list = kind === 'car' ? CARS : kind === 'skin' ? SKINS : TRAILS;
  const item = (list as { id: string; price: number }[]).find((i) => i.id === id);
  return item ? item.price : null;
}

export function isOwned(profile: Profile, kind: ShopKind, id: string): boolean {
  const list: string[] = kind === 'car' ? profile.owned.cars : kind === 'skin' ? profile.owned.skins : profile.owned.trails;
  return list.includes(id);
}

/** Buys an item with coins. Coins can never go below zero. */
export function purchase(profile: Profile, kind: ShopKind, id: string): BuyResult {
  const price = priceOf(kind, id);
  if (price === null) return { ok: false, reason: 'unknown' };
  if (isOwned(profile, kind, id)) return { ok: false, reason: 'owned' };
  if (profile.coins < price) return { ok: false, reason: 'poor' };
  const owned = { ...profile.owned };
  if (kind === 'car') owned.cars = [...owned.cars, id as CarId];
  else if (kind === 'skin') owned.skins = [...owned.skins, id as SkinId];
  else owned.trails = [...owned.trails, id as TrailId];
  return { ok: true, profile: { ...profile, coins: profile.coins - price, owned } };
}
