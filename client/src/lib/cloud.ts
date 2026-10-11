// Talking to the server's account, cloud-save and leaderboard endpoints.

import { serverUrl } from '../net/OnlineContext';
import type { Difficulty } from '@typerush/shared';
import { parseProfile, type Profile } from './storage';

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiFail {
  ok: false;
  error: string;
}
export type ApiResult<T> = ApiOk<T> | ApiFail;

async function request<T>(method: string, path: string, token: string | null, body?: unknown): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${serverUrl()}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    if (!res.ok || json.ok === false) {
      return { ok: false, error: typeof json.error === 'string' ? json.error : `The server answered ${res.status}.` };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      error: 'Could not reach the server. It may be waking up (free hosts sleep when idle). Wait a minute and try again.',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export interface CreatedAccount {
  accountId: string;
  recoveryCode: string;
  persistent: boolean;
}
export interface RestoredAccount {
  accountId: string;
  name: string;
  save: unknown;
  saveUpdatedAt: number | null;
}
export interface CloudSave {
  name: string;
  save: unknown;
  saveUpdatedAt: number | null;
}

/** The part of the profile that goes to the cloud: never the device token, never the link state. */
export function uploadable(profile: Profile): Record<string, unknown> {
  const { playerToken: _token, account: _account, ...rest } = profile;
  void _token;
  void _account;
  return rest;
}

export const createAccount = (token: string, name: string) =>
  request<CreatedAccount>('POST', '/api/account/create', null, { token, name });
export const restoreAccount = (token: string, code: string) =>
  request<RestoredAccount>('POST', '/api/account/restore', null, { token, code });
export const downloadSave = (token: string) => request<CloudSave>('GET', '/api/account/save', token);
export const uploadSave = (token: string, profile: Profile) =>
  request<{ saveUpdatedAt: number }>('PUT', '/api/account/save', token, { save: uploadable(profile) });
export const unlinkDevice = (token: string) => request<Record<string, never>>('POST', '/api/account/unlink', token, {});
export const deleteCloudAccount = (token: string) => request<Record<string, never>>('DELETE', '/api/account', token);

export interface DailySubmitResult {
  wpm: number;
  accuracy: number;
  score: number;
  rank: number | null;
  players: number;
}
export const submitDaily = (token: string, day: string, times: number[], errors: number) =>
  request<DailySubmitResult>('POST', '/api/daily/submit', token, { day, times, errors });

export interface BoardEntry {
  rank: number;
  name: string;
  wpm: number;
  accuracy: number;
  score: number;
  difficulty: string;
  at: number;
  account: boolean;
}
export interface BoardData {
  scope: string;
  entries: BoardEntry[];
  me: BoardEntry | null;
  persistent: boolean;
  note: string;
}
export type BoardScope = 'daily' | 'weekly' | 'alltime' | 'public';

export function fetchBoard(scope: BoardScope, opts: { token?: string | null; difficulty?: string; day?: string } = {}) {
  const params = new URLSearchParams({ scope });
  if (opts.difficulty) params.set('difficulty', opts.difficulty);
  if (opts.day) params.set('day', opts.day);
  return request<BoardData>('GET', `/api/board?${params.toString()}`, opts.token ?? null);
}

// ---------------------------------------------------------------- merging

const maxRecord = <K extends string>(a: Record<K, number>, b: Record<K, number>): Record<K, number> => {
  const out = { ...a };
  for (const key of Object.keys(b) as K[]) out[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
  return out;
};

/**
 * Combines this device's profile with the cloud save. Things that only ever grow (badges, unlocked
 * items, level stars, records) are merged so nothing earned anywhere is lost. Everything else (coins,
 * settings, streak, name, equipped items) comes from the side that was saved most recently.
 */
export function mergeProfiles(local: Profile, cloudRaw: unknown, cloudIsNewer: boolean): Profile {
  const cloud = parseProfile(JSON.stringify(cloudRaw ?? {}));
  const newer = cloudIsNewer ? cloud : local;
  const completed: Record<number, number> = { ...local.completed };
  for (const [id, stars] of Object.entries(cloud.completed)) completed[Number(id)] = Math.max(completed[Number(id)] ?? 0, stars);
  const badges: Record<string, number> = { ...cloud.badges };
  for (const [id, at] of Object.entries(local.badges)) badges[id] = Math.min(badges[id] ?? at, at);
  const union = <T extends string>(a: T[], b: T[]): T[] => [...new Set([...a, ...b])];
  const owned = {
    cars: union(local.owned.cars, cloud.owned.cars),
    skins: union(local.owned.skins, cloud.owned.skins),
    trails: union(local.owned.trails, cloud.owned.trails),
  };
  const history = [...local.history, ...cloud.history]
    .sort((x, y) => y.at - x.at)
    .filter((h, i, all) => all.findIndex((o) => o.at === h.at) === i)
    .slice(0, 40);
  const car = owned.cars.includes(newer.car) ? newer.car : local.car;
  const skin = owned.skins.includes(newer.skin) ? newer.skin : 'plain';
  const trail = owned.trails.includes(newer.trail) ? newer.trail : 'none';
  return {
    ...local,
    name: newer.name,
    car,
    skin,
    trail,
    owned,
    completed,
    bestWpm: maxRecord(local.bestWpm, cloud.bestWpm),
    bestAccuracy: maxRecord(local.bestAccuracy, cloud.bestAccuracy),
    totalPoints: Math.max(local.totalPoints, cloud.totalPoints),
    races: Math.max(local.races, cloud.races),
    wins: Math.max(local.wins, cloud.wins),
    history,
    settings: newer.settings,
    coins: newer.coins,
    lifetimeCoins: Math.max(local.lifetimeCoins, cloud.lifetimeCoins),
    streak: newer.streak,
    badges,
    stats: {
      perfectRaces: Math.max(local.stats.perfectRaces, cloud.stats.perfectRaces),
      dailiesDone: Math.max(local.stats.dailiesDone, cloud.stats.dailiesDone),
    },
    daily: newer.daily,
  };
}

// ---------------------------------------------------------------- friends, weekly cup, classrooms

export interface FriendRow {
  code: string;
  name: string;
  weekBest: { score: number; wpm: number; accuracy: number } | null;
}
export interface FriendsData {
  code: string;
  friends: FriendRow[];
  board: (BoardEntry & { you: boolean })[];
}
export const fetchFriends = (token: string) => request<FriendsData>('GET', '/api/friends', token);
export const addFriend = (token: string, code: string) => request<{ name: string }>('POST', '/api/friends/add', token, { code });
export const removeFriend = (token: string, code: string) => request<Record<string, never>>('POST', '/api/friends/remove', token, { code });

/** What the server hands out for the Weekly Cup and for a class: everything needed to build the race. */
export interface AssignmentSpec {
  difficulty: Difficulty;
  chars: number;
  seed: number;
  tier: number;
  key: string;
}
export interface CupData {
  cup: AssignmentSpec & { week: string; endsAt: number };
  maxAttempts: number;
  attemptsUsed: number;
  entries: BoardEntry[];
  players: number;
  me: BoardEntry | null;
  persistent: boolean;
}
export const fetchCup = (token: string | null) => request<CupData>('GET', '/api/cup', token);

export interface ClassSummary {
  id: string;
  code: string;
  name: string;
  difficulty: Difficulty;
  round: number;
  owner: boolean;
}
export interface ClassDetail {
  class: ClassSummary;
  assignment: AssignmentSpec;
  members: number;
  entries: BoardEntry[];
  waiting?: string[];
}
export const fetchClasses = (token: string) => request<{ classes: ClassSummary[] }>('GET', '/api/classes', token);
export const fetchClass = (token: string, id: string) => request<ClassDetail>('GET', `/api/class/${encodeURIComponent(id)}`, token);
export const createClass = (token: string, name: string, difficulty: Difficulty) =>
  request<{ class: ClassSummary }>('POST', '/api/class/create', token, { name, difficulty });
export const joinClass = (token: string, code: string) => request<{ class: ClassSummary }>('POST', '/api/class/join', token, { code });
export const leaveClass = (token: string, id: string) => request<Record<string, never>>('POST', '/api/class/leave', token, { id });
export const newClassRound = (token: string, id: string) => request<{ round: number }>('POST', '/api/class/round', token, { id });
export const deleteClass = (token: string, id: string) => request<Record<string, never>>('DELETE', `/api/class/${encodeURIComponent(id)}`, token);

/** Where a finished race is sent: the Weekly Cup or a class. */
export type SubmitTarget = { kind: 'cup' } | { kind: 'class'; classId: string };
export interface AssignmentResult {
  wpm: number;
  accuracy: number;
  score: number;
  rank: number | null;
  players: number;
}
export const submitAssignment = (token: string, target: SubmitTarget, times: number[], errors: number) =>
  target.kind === 'cup'
    ? request<AssignmentResult>('POST', '/api/cup/submit', token, { times, errors })
    : request<AssignmentResult>('POST', '/api/class/submit', token, { id: target.classId, times, errors });
