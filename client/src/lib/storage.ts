import {
  CARS,
  CAR_IDS,
  DIFFICULTIES,
  LEVELS,
  isCarId,
  type CarId,
  type Difficulty,
} from '@typerush/shared';
import { FREE_SKINS, FREE_TRAILS, SKIN_IDS, TRAIL_IDS, isSkinId, isTrailId, type SkinId, type TrailId } from './shop';

export interface Settings {
  musicOn: boolean;
  sfxOn: boolean;
  musicVolume: number;
  sfxVolume: number;
  reduceMotion: boolean;
  /** Size of the moving typing line: m = normal, l = large, xl = extra large. */
  textSize: 'm' | 'l' | 'xl';
}

export type RaceMode = 'level' | 'quick' | 'friends' | 'public' | 'daily';

export interface HistoryEntry {
  at: number;
  mode: RaceMode;
  difficulty: Difficulty;
  levelId?: number;
  wpm: number;
  accuracy: number;
  score: number;
  position: number;
  racers: number;
  finished: boolean;
}

export interface Streak {
  /** Days in a row with at least one finished race. */
  count: number;
  best: number;
  /** Local date (YYYY-MM-DD) of the last finished race, or null. */
  lastDay: string | null;
}

export interface DailyState {
  /** Local date (YYYY-MM-DD) of the Daily Challenge this record belongs to. */
  day: string;
  plays: number;
  best: { wpm: number; accuracy: number; score: number };
}

export interface Owned {
  cars: CarId[];
  skins: SkinId[];
  trails: TrailId[];
}

export interface AccountState {
  /** True when this device is signed in to a cloud account (see the Account screen). */
  linked: boolean;
  accountId: string | null;
  /** When the cloud save was last uploaded or downloaded by this device. */
  lastSyncAt: number | null;
}

export interface Profile {
  version: 1;
  playerToken: string;
  name: string;
  car: CarId;
  /** levelId -> stars (1..3). Present means the level was cleared. */
  completed: Record<number, number>;
  bestWpm: Record<Difficulty, number>;
  bestAccuracy: Record<Difficulty, number>;
  totalPoints: number;
  races: number;
  wins: number;
  history: HistoryEntry[];
  settings: Settings;
  /** Spendable coins and the total ever earned. */
  coins: number;
  lifetimeCoins: number;
  streak: Streak;
  /** badgeId -> time it was earned. */
  badges: Record<string, number>;
  stats: { perfectRaces: number; dailiesDone: number };
  daily: DailyState | null;
  owned: Owned;
  skin: SkinId;
  trail: TrailId;
  account: AccountState;
}

export const STORAGE_KEY = 'typerush.profile.v1';
const MAX_HISTORY = 40;

export function makeToken(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const zeroByDifficulty = (): Record<Difficulty, number> => ({ easy: 0, medium: 0, hard: 0, expert: 0 });

export function defaultProfile(): Profile {
  return {
    version: 1,
    playerToken: makeToken(),
    name: `Racer${Math.floor(100 + Math.random() * 900)}`,
    car: 'rocket',
    completed: {},
    bestWpm: zeroByDifficulty(),
    bestAccuracy: zeroByDifficulty(),
    totalPoints: 0,
    races: 0,
    wins: 0,
    history: [],
    settings: { musicOn: true, sfxOn: true, musicVolume: 0.5, sfxVolume: 0.7, reduceMotion: false, textSize: 'm' },
    coins: 0,
    lifetimeCoins: 0,
    streak: { count: 0, best: 0, lastDay: null },
    badges: {},
    stats: { perfectRaces: 0, dailiesDone: 0 },
    daily: null,
    owned: defaultOwned(),
    skin: 'plain',
    trail: 'none',
    account: { linked: false, accountId: null, lastSyncAt: null },
  };
}

export function defaultOwned(): Owned {
  return {
    cars: CARS.filter((c) => c.price === 0).map((c) => c.id),
    skins: [...FREE_SKINS],
    trails: [...FREE_TRAILS],
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseAccount(raw: unknown): AccountState {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Partial<AccountState>;
  const linked = a.linked === true && typeof a.accountId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(a.accountId);
  return {
    linked,
    accountId: linked ? (a.accountId as string) : null,
    lastSyncAt: linked && typeof a.lastSyncAt === 'number' && Number.isFinite(a.lastSyncAt) ? a.lastSyncAt : null,
  };
}

function idList<T extends string>(value: unknown, valid: readonly T[], free: readonly T[]): T[] {
  const out = new Set<T>(free);
  if (Array.isArray(value)) for (const v of value) if ((valid as readonly unknown[]).includes(v)) out.add(v as T);
  return [...out];
}

function num(value: unknown, fallback: number, min = 0, max = 1e9): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Reads a profile defensively: anything missing or malformed falls back to defaults. */
export function parseProfile(raw: string | null): Profile {
  const base = defaultProfile();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<Profile> & Record<string, unknown>;
    if (!data || typeof data !== 'object') return base;

    const completed: Record<number, number> = {};
    if (data.completed && typeof data.completed === 'object') {
      for (const level of LEVELS) {
        const stars = (data.completed as Record<string, unknown>)[String(level.id)];
        if (typeof stars === 'number' && stars >= 1) completed[level.id] = Math.min(3, Math.floor(stars));
      }
    }
    const bestWpm = zeroByDifficulty();
    const bestAccuracy = zeroByDifficulty();
    for (const d of DIFFICULTIES) {
      bestWpm[d] = num((data.bestWpm as Record<string, unknown> | undefined)?.[d], 0, 0, 400);
      bestAccuracy[d] = num((data.bestAccuracy as Record<string, unknown> | undefined)?.[d], 0, 0, 100);
    }
    const s = (data.settings ?? {}) as Partial<Settings>;
    const history = Array.isArray(data.history)
      ? (data.history.filter(
          (h): h is HistoryEntry => !!h && typeof h === 'object' && Number.isFinite((h as HistoryEntry).score),
        ) as HistoryEntry[]).slice(0, MAX_HISTORY)
      : [];

    const owned: Owned = {
      cars: idList(data.owned && (data.owned as Partial<Owned>).cars, CAR_IDS, defaultOwned().cars),
      skins: idList(data.owned && (data.owned as Partial<Owned>).skins, SKIN_IDS, FREE_SKINS),
      trails: idList(data.owned && (data.owned as Partial<Owned>).trails, TRAIL_IDS, FREE_TRAILS),
    };
    const car = isCarId(data.car) && owned.cars.includes(data.car) ? data.car : CAR_IDS[0];
    const skin = isSkinId(data.skin) && owned.skins.includes(data.skin) ? data.skin : 'plain';
    const trail = isTrailId(data.trail) && owned.trails.includes(data.trail) ? data.trail : 'none';

    const st = (data.streak ?? {}) as Partial<Streak>;
    const streak: Streak = {
      count: num(st.count, 0, 0, 100000),
      best: num(st.best, 0, 0, 100000),
      lastDay: typeof st.lastDay === 'string' && DAY_RE.test(st.lastDay) ? st.lastDay : null,
    };
    streak.best = Math.max(streak.best, streak.count);

    const badges: Record<string, number> = {};
    if (data.badges && typeof data.badges === 'object') {
      for (const [id, at] of Object.entries(data.badges as Record<string, unknown>)) {
        if (/^[a-z0-9-]{1,32}$/.test(id) && typeof at === 'number' && Number.isFinite(at)) badges[id] = at;
      }
    }
    const stats = (data.stats ?? {}) as Partial<Profile['stats']>;
    const dRaw = data.daily as Partial<DailyState> | null | undefined;
    const daily: DailyState | null =
      dRaw && typeof dRaw.day === 'string' && DAY_RE.test(dRaw.day)
        ? {
            day: dRaw.day,
            plays: num(dRaw.plays, 1, 1, 10000),
            best: {
              wpm: num(dRaw.best?.wpm, 0, 0, 400),
              accuracy: num(dRaw.best?.accuracy, 0, 0, 100),
              score: num(dRaw.best?.score, 0, 0, 1e6),
            },
          }
        : null;

    return {
      version: 1,
      playerToken:
        typeof data.playerToken === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(data.playerToken)
          ? data.playerToken
          : base.playerToken,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 14) : base.name,
      car,
      completed,
      bestWpm,
      bestAccuracy,
      totalPoints: num(data.totalPoints, 0, 0, 1e9),
      races: num(data.races, 0, 0, 1e7),
      wins: num(data.wins, 0, 0, 1e7),
      history,
      settings: {
        musicOn: typeof s.musicOn === 'boolean' ? s.musicOn : base.settings.musicOn,
        sfxOn: typeof s.sfxOn === 'boolean' ? s.sfxOn : base.settings.sfxOn,
        musicVolume: num(s.musicVolume, base.settings.musicVolume, 0, 1),
        sfxVolume: num(s.sfxVolume, base.settings.sfxVolume, 0, 1),
        reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : base.settings.reduceMotion,
        textSize: s.textSize === 'l' || s.textSize === 'xl' ? s.textSize : 'm',
      },
      coins: num(data.coins, 0, 0, 1e9),
      lifetimeCoins: num(data.lifetimeCoins, 0, 0, 1e9),
      streak,
      badges,
      stats: {
        perfectRaces: num(stats.perfectRaces, 0, 0, 1e7),
        dailiesDone: num(stats.dailiesDone, 0, 0, 1e5),
      },
      daily,
      owned,
      skin,
      trail,
      account: parseAccount(data.account),
    };
  } catch {
    return base;
  }
}

export function loadProfile(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Profile {
  try {
    return parseProfile(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: Profile, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode or quota: the game still works, it just will not remember. */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export interface RaceRecord extends Omit<HistoryEntry, 'at'> {
  /** Stars to store for a cleared level (0 = not cleared). */
  stars?: number;
}

/** Pure: returns the profile after a finished race. Points are never negative. */
export function recordRace(profile: Profile, record: RaceRecord, now = Date.now()): Profile {
  const { stars = 0, ...entry } = record;
  const completed = { ...profile.completed };
  if (entry.mode === 'level' && entry.levelId && stars > 0) {
    completed[entry.levelId] = Math.max(completed[entry.levelId] ?? 0, Math.min(3, stars));
  }
  const bestWpm = { ...profile.bestWpm };
  const bestAccuracy = { ...profile.bestAccuracy };
  if (entry.finished) {
    bestWpm[entry.difficulty] = Math.max(bestWpm[entry.difficulty], entry.wpm);
    bestAccuracy[entry.difficulty] = Math.max(bestAccuracy[entry.difficulty], entry.accuracy);
  }
  return {
    ...profile,
    completed,
    bestWpm,
    bestAccuracy,
    totalPoints: profile.totalPoints + Math.max(0, Math.round(entry.score)),
    races: profile.races + 1,
    wins: profile.wins + (entry.finished && entry.position === 1 && entry.racers > 1 ? 1 : 0),
    history: [{ ...entry, at: now }, ...profile.history].slice(0, MAX_HISTORY),
  };
}

export function totalStars(profile: Profile): number {
  return Object.values(profile.completed).reduce((a, b) => a + b, 0);
}
