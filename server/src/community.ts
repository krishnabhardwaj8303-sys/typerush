import { randomBytes, randomUUID } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import {
  CUP_MAX_ATTEMPTS,
  assignmentScore,
  checkKeyLog,
  classInfo,
  cupInfo,
  generateText,
  isTextLang,
  type TextLang,
  isDifficulty,
  type AssignmentInfo,
  type Difficulty,
} from '@typerush/shared';
import { bestPerPlayer, sha256, type BoardEntry } from './accounts';
import { WindowCounter } from './rateLimit';
import type { AccountRecord, ClassRecord, ScoreRow, Store } from './store';
import { ValidationError, sanitizeName, sanitizeToken } from './validation';

// Friends (share a friend code), the Weekly Cup and Classrooms (a teacher hands out one text to a class).
// Everything needs a signed-in account (see accounts.ts).

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_FRIENDS = 50;
const MAX_OWNED_CLASSES = 5;
const MAX_CLASS_MEMBERS = 80;
const BOARD_SIZE = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export const makeFriendCode = () => `FR-${randomCode(6)}`;
export const makeClassCode = () => `CL-${randomCode(6)}`;

/** Accepts "fr abc123", "FR-ABC123" ... and returns "FR-ABC123", or null. */
export function normalizeCode(input: unknown, prefix: 'FR' | 'CL'): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.startsWith(prefix) || raw.length !== 8) return null;
  const body = raw.slice(2);
  for (const ch of body) if (!CODE_ALPHABET.includes(ch)) return null;
  return `${prefix}-${body}`;
}

const toEntry = (row: ScoreRow, rank: number): BoardEntry => ({
  rank,
  name: row.name,
  wpm: row.wpm,
  accuracy: row.accuracy,
  score: row.score,
  difficulty: row.difficulty,
  at: row.at,
  account: row.accountId !== null,
});

export interface CommunityDeps {
  store: Store;
  now?: () => number;
}

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ ok: false, error });
}

export function mountCommunityRoutes(app: Express, deps: CommunityDeps): void {
  const { store } = deps;
  const now = deps.now ?? (() => Date.now());
  const writeLimit = new WindowCounter(60, 10 * 60_000);
  const createLimit = new WindowCounter(10, 60 * 60_000);
  const sweep = setInterval(() => {
    writeLimit.prune();
    createLimit.prune();
  }, 60_000);
  sweep.unref?.();
  const json = express.json({ limit: '40kb' });
  const ip = (req: Request) => req.ip ?? 'unknown';

  const accountOf = async (req: Request): Promise<AccountRecord | null> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    try {
      return await store.accountByToken(sha256(sanitizeToken(header.slice(7).trim())));
    } catch {
      return null;
    }
  };

  const wrap =
    (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
      handler(req, res).catch((error: unknown) => {
        if (error instanceof ValidationError) return fail(res, 400, error.message);
        console.error('[community] error:', error);
        if (!res.headersSent) fail(res, 500, 'Something went wrong on the server. Please try again.');
        else next(error);
      });
    };

  const myFriendCode = async (accountId: string) => {
    for (let i = 0; i < 4; i++) {
      try {
        return await store.ensureFriendCode(accountId, makeFriendCode());
      } catch (error) {
        if (i === 3) throw error;
      }
    }
    throw new Error('unreachable');
  };

  /** Checks a recorded run against the re-created text. */
  const judge = (info: AssignmentInfo, body: Record<string, unknown>, lang: TextLang = 'en') => {
    const length = generateText(info.difficulty, info.chars, info.seed, info.tier, lang).length;
    const check = checkKeyLog(body.times, length);
    if (!check.ok) return null;
    const errors = typeof body.errors === 'number' && Number.isFinite(body.errors) ? Math.max(0, Math.min(length * 3, Math.floor(body.errors))) : 0;
    const accuracy = Math.round((length / (length + errors)) * 1000) / 10;
    const wpm = Math.round((length / 5 / (check.durationMs / 60000)) * 10) / 10;
    return { wpm, accuracy, score: assignmentScore(wpm, accuracy, info.difficulty).total };
  };

  // ------------------------------------------------------------ friends

  app.get(
    '/api/friends',
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in (Menu > Account & backup) to use friends.');
      const code = await myFriendCode(me.id);
      const ids = await store.friendIds(me.id);
      const names = await store.accountNames(ids);
      const week = await store.topScores({ sinceMs: now() - WEEK_MS, accountIds: [me.id, ...ids], limit: 1000 });
      const best = bestPerPlayer(week);
      const friends = [];
      for (const id of ids) {
        const row = best.find((r) => r.accountId === id);
        friends.push({
          code: await myFriendCode(id),
          name: names.get(id) ?? 'Player',
          weekBest: row ? { score: row.score, wpm: row.wpm, accuracy: row.accuracy } : null,
        });
      }
      const board = best.map((row, i) => ({ ...toEntry(row, i + 1), you: row.accountId === me.id }));
      res.json({ ok: true, code, friends, board });
    }),
  );

  app.post(
    '/api/friends/add',
    json,
    wrap(async (req, res) => {
      if (!writeLimit.allow(ip(req))) return fail(res, 429, 'Too many attempts. Please wait a few minutes.');
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in to add friends.');
      const code = normalizeCode((req.body as Record<string, unknown> | undefined)?.code, 'FR');
      if (!code) return fail(res, 400, 'A friend code looks like FR-ABC123.');
      const friendId = await store.accountIdByFriendCode(code);
      if (!friendId) return fail(res, 404, 'No player has that friend code.');
      if (friendId === me.id) return fail(res, 400, 'That is your own friend code.');
      const mine = await store.friendIds(me.id);
      if (mine.includes(friendId)) return fail(res, 409, 'You are already friends.');
      if (mine.length >= MAX_FRIENDS) return fail(res, 400, `You can have up to ${MAX_FRIENDS} friends.`);
      await store.addFriendship(me.id, friendId);
      const names = await store.accountNames([friendId]);
      res.json({ ok: true, name: names.get(friendId) ?? 'Player' });
    }),
  );

  app.post(
    '/api/friends/remove',
    json,
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in first.');
      const code = normalizeCode((req.body as Record<string, unknown> | undefined)?.code, 'FR');
      const friendId = code ? await store.accountIdByFriendCode(code) : null;
      if (friendId) await store.removeFriendship(me.id, friendId);
      res.json({ ok: true });
    }),
  );

  // ------------------------------------------------------------ weekly cup

  const cupAttempts = async (accountId: string, week: string) =>
    (await store.topScores({ mode: 'cup', day: week, accountIds: [accountId], limit: 50 })).length;

  app.get(
    '/api/cup',
    wrap(async (req, res) => {
      const t = now();
      const info = cupInfo(t);
      const best = bestPerPlayer(await store.topScores({ mode: 'cup', day: info.week, limit: 500 }));
      const me = await accountOf(req);
      const myIndex = me ? best.findIndex((r) => r.accountId === me.id) : -1;
      res.json({
        ok: true,
        cup: { week: info.week, difficulty: info.difficulty, chars: info.chars, seed: info.seed, tier: info.tier, key: info.key, endsAt: info.endsAt },
        maxAttempts: CUP_MAX_ATTEMPTS,
        attemptsUsed: me ? await cupAttempts(me.id, info.week) : 0,
        entries: best.slice(0, BOARD_SIZE).map((row, i) => toEntry(row, i + 1)),
        players: best.length,
        me: myIndex >= 0 ? toEntry(best[myIndex], myIndex + 1) : null,
        persistent: store.kind === 'postgres',
      });
    }),
  );

  app.post(
    '/api/cup/submit',
    json,
    wrap(async (req, res) => {
      if (!writeLimit.allow(ip(req))) return fail(res, 429, 'Too many submissions. Please wait a moment.');
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in to enter the Weekly Cup.');
      const t = now();
      const info = cupInfo(t);
      if ((await cupAttempts(me.id, info.week)) >= CUP_MAX_ATTEMPTS) {
        return fail(res, 429, `You used all ${CUP_MAX_ATTEMPTS} Cup attempts this week.`);
      }
      const result = judge(info, (req.body ?? {}) as Record<string, unknown>);
      if (!result) return fail(res, 422, 'That run was not accepted: the typing speed was not believable.');
      await store.addScore({ accountId: me.id, name: me.name, ...result, difficulty: info.difficulty, mode: 'cup', day: info.week, at: t });
      const best = bestPerPlayer(await store.topScores({ mode: 'cup', day: info.week, limit: 500 }));
      const rank = best.findIndex((r) => r.accountId === me.id) + 1;
      res.json({ ok: true, ...result, rank: rank > 0 ? rank : null, players: best.length, attemptsUsed: await cupAttempts(me.id, info.week) });
    }),
  );

  // ------------------------------------------------------------ classrooms

  const classDay = (c: ClassRecord) => `${c.id}:${c.round}`;
  const summary = (c: ClassRecord, me: AccountRecord) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    difficulty: c.difficulty,
    lang: c.lang,
    round: c.round,
    owner: c.ownerId === me.id,
  });

  const isMember = async (c: ClassRecord, accountId: string) =>
    c.ownerId === accountId || (await store.classMemberIds(c.id)).includes(accountId);

  app.get(
    '/api/classes',
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in (Menu > Account & backup) to use classrooms.');
      res.json({ ok: true, classes: (await store.classesOf(me.id)).map((c) => summary(c, me)) });
    }),
  );

  app.post(
    '/api/class/create',
    json,
    wrap(async (req, res) => {
      if (!createLimit.allow(ip(req))) return fail(res, 429, 'Too many classes created. Try again later.');
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in to create a class.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = sanitizeName(body.name);
      const difficulty: Difficulty = isDifficulty(body.difficulty) ? body.difficulty : 'medium';
      const lang: TextLang = isTextLang(body.lang) ? body.lang : 'en';
      const owned = (await store.classesOf(me.id)).filter((c) => c.ownerId === me.id);
      if (owned.length >= MAX_OWNED_CLASSES) return fail(res, 400, `You can run up to ${MAX_OWNED_CLASSES} classes.`);
      let record: ClassRecord | null = null;
      for (let i = 0; i < 4 && !record; i++) {
        const candidate: ClassRecord = { id: randomUUID(), code: makeClassCode(), ownerId: me.id, name, difficulty, lang, round: 1, createdAt: now() };
        try {
          await store.createClass(candidate);
          record = candidate;
        } catch (error) {
          if (i === 3) throw error;
        }
      }
      res.json({ ok: true, class: summary(record!, me) });
    }),
  );

  app.post(
    '/api/class/join',
    json,
    wrap(async (req, res) => {
      if (!writeLimit.allow(ip(req))) return fail(res, 429, 'Too many attempts. Please wait a few minutes.');
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in to join a class.');
      const code = normalizeCode((req.body as Record<string, unknown> | undefined)?.code, 'CL');
      if (!code) return fail(res, 400, 'A class code looks like CL-ABC123.');
      const c = await store.classByCode(code);
      if (!c) return fail(res, 404, 'No class has that code.');
      if (!(await isMember(c, me.id))) {
        if ((await store.classMemberIds(c.id)).length >= MAX_CLASS_MEMBERS) return fail(res, 400, 'That class is full.');
        await store.joinClass(c.id, me.id);
      }
      res.json({ ok: true, class: summary(c, me) });
    }),
  );

  app.post(
    '/api/class/leave',
    json,
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in first.');
      const id = (req.body as Record<string, unknown> | undefined)?.id;
      const c = typeof id === 'string' ? await store.classById(id) : null;
      if (c && c.ownerId !== me.id) await store.leaveClass(c.id, me.id);
      res.json({ ok: true });
    }),
  );

  /** Teacher only: hand out a new text (a new round). Old results stay readable for the old round only. */
  app.post(
    '/api/class/round',
    json,
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in first.');
      const id = (req.body as Record<string, unknown> | undefined)?.id;
      const c = typeof id === 'string' ? await store.classById(id) : null;
      if (!c || c.ownerId !== me.id) return fail(res, 403, 'Only the teacher can start a new round.');
      await store.nextClassRound(c.id);
      res.json({ ok: true, round: c.round + 1 });
    }),
  );

  app.delete(
    '/api/class/:id',
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in first.');
      const c = await store.classById(String(req.params.id));
      if (!c || c.ownerId !== me.id) return fail(res, 403, 'Only the teacher can delete a class.');
      await store.deleteClass(c.id);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/class/:id',
    wrap(async (req, res) => {
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in first.');
      const c = await store.classById(String(req.params.id));
      if (!c || !(await isMember(c, me.id))) return fail(res, 404, 'Class not found.');
      const info = classInfo(c.id, c.round, c.difficulty);
      const memberIds = [...new Set([c.ownerId, ...(await store.classMemberIds(c.id))])];
      const best = bestPerPlayer(await store.topScores({ mode: 'class', day: classDay(c), accountIds: memberIds, limit: 1000 }));
      const names = await store.accountNames(memberIds);
      const done = new Set(best.map((r) => r.accountId));
      const owner = c.ownerId === me.id;
      res.json({
        ok: true,
        class: summary(c, me),
        assignment: { difficulty: info.difficulty, chars: info.chars, seed: info.seed, tier: info.tier, key: info.key, lang: c.lang },
        members: memberIds.length,
        entries: best.map((row, i) => toEntry(row, i + 1)),
        // Only the teacher sees who has not finished the current text yet.
        waiting: owner ? memberIds.filter((id) => !done.has(id)).map((id) => names.get(id) ?? 'Player') : undefined,
      });
    }),
  );

  app.post(
    '/api/class/submit',
    json,
    wrap(async (req, res) => {
      if (!writeLimit.allow(ip(req))) return fail(res, 429, 'Too many submissions. Please wait a moment.');
      const me = await accountOf(req);
      if (!me) return fail(res, 401, 'Sign in first.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const c = typeof body.id === 'string' ? await store.classById(body.id) : null;
      if (!c || !(await isMember(c, me.id))) return fail(res, 404, 'Class not found.');
      const info = classInfo(c.id, c.round, c.difficulty);
      const result = judge(info, body, c.lang);
      if (!result) return fail(res, 422, 'That run was not accepted: the typing speed was not believable.');
      await store.addScore({ accountId: me.id, name: me.name, ...result, difficulty: info.difficulty, mode: 'class', day: classDay(c), at: now() });
      const memberIds = [...new Set([c.ownerId, ...(await store.classMemberIds(c.id))])];
      const best = bestPerPlayer(await store.topScores({ mode: 'class', day: classDay(c), accountIds: memberIds, limit: 1000 }));
      const rank = best.findIndex((r) => r.accountId === me.id) + 1;
      res.json({ ok: true, ...result, rank: rank > 0 ? rank : null, players: best.length });
    }),
  );
}
