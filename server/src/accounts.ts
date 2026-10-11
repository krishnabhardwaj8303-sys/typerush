import { createHash, randomBytes, randomUUID } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { checkKeyLog, DAILY_TIER, dailyInfo, dailyScore, DAY_PATTERN, generateText, type Difficulty } from '@typerush/shared';
import { WindowCounter } from './rateLimit';
import type { ScoreRow, Store } from './store';
import { ValidationError, sanitizeName, sanitizeToken } from './validation';

// Accounts without passwords: an account is protected by a secret RECOVERY CODE that is shown once.
// A device proves it belongs to the account with its own random session token (stored only as a hash).

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 16;
const MAX_SAVE_BYTES = 30_000;
const BOARD_SIZE = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_LENGTH);
  let raw = '';
  for (let i = 0; i < RECOVERY_LENGTH; i++) raw += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  return `TR-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/** Accepts "tr-abcd efgh..." in any case with any separators. Returns the canonical form or null. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.startsWith('TR') || raw.length !== RECOVERY_LENGTH + 2) return null;
  const body = raw.slice(2);
  for (const ch of body) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return `TR-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export interface BoardEntry {
  rank: number;
  name: string;
  wpm: number;
  accuracy: number;
  score: number;
  difficulty: Difficulty;
  at: number;
  /** True when the result belongs to a signed-in account. */
  account: boolean;
}

/** Keeps the best row per player (rows must already be sorted best-first). */
export function bestPerPlayer(rows: ScoreRow[]): ScoreRow[] {
  const seen = new Set<string>();
  const out: ScoreRow[] = [];
  for (const row of rows) {
    const key = row.accountId ?? `n:${row.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
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

export interface AccountDeps {
  store: Store;
  now?: () => number;
}

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ ok: false, error });
}

/** Mounts every /api/account/*, /api/daily/* and /api/board route on the Express app. */
export function mountAccountRoutes(app: Express, deps: AccountDeps): void {
  const { store } = deps;
  const now = deps.now ?? (() => Date.now());
  const createLimit = new WindowCounter(8, 60 * 60_000);
  const restoreLimit = new WindowCounter(10, 10 * 60_000);
  const writeLimit = new WindowCounter(60, 10 * 60_000);
  const sweep = setInterval(() => {
    createLimit.prune();
    restoreLimit.prune();
    writeLimit.prune();
  }, 60_000);
  sweep.unref?.();

  const json = express.json({ limit: '40kb' });
  const ip = (req: Request) => req.ip ?? 'unknown';

  const tokenOf = (req: Request): string | null => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    try {
      return sanitizeToken(header.slice(7).trim());
    } catch {
      return null;
    }
  };

  const accountOf = async (req: Request) => {
    const token = tokenOf(req);
    return token ? store.accountByToken(sha256(token)) : null;
  };

  /** Runs an async handler and turns errors into JSON answers. */
  const wrap =
    (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
      handler(req, res).catch((error: unknown) => {
        if (error instanceof ValidationError) {
          fail(res, 400, error.message);
          return;
        }
        console.error('[accounts] error:', error);
        if (!res.headersSent) fail(res, 500, 'Something went wrong on the server. Please try again.');
        else next(error);
      });
    };

  // ---- create
  app.post(
    '/api/account/create',
    json,
    wrap(async (req, res) => {
      if (!createLimit.allow(ip(req))) return fail(res, 429, 'Too many new accounts from your network. Try again later.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const token = sanitizeToken(body.token);
      const name = sanitizeName(body.name);
      if (await store.accountByToken(sha256(token))) return fail(res, 409, 'This device already has an account.');
      const id = randomUUID();
      const recoveryCode = generateRecoveryCode();
      await store.createAccount({ id, name, tokenHash: sha256(token), recoveryHash: sha256(recoveryCode), at: now() });
      res.json({ ok: true, accountId: id, recoveryCode, persistent: store.kind === 'postgres' });
    }),
  );

  // ---- restore on another device
  app.post(
    '/api/account/restore',
    json,
    wrap(async (req, res) => {
      if (!restoreLimit.allow(ip(req))) return fail(res, 429, 'Too many attempts. Please wait a few minutes.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const token = sanitizeToken(body.token);
      const code = normalizeRecoveryCode(body.code);
      if (!code) return fail(res, 400, 'That recovery code does not look right. It starts with TR- and has 16 letters or numbers.');
      const account = await store.accountByRecovery(sha256(code));
      if (!account) return fail(res, 404, 'No account was found for that recovery code.');
      await store.linkToken(sha256(token), account.id);
      res.json({
        ok: true,
        accountId: account.id,
        name: account.name,
        save: account.save ? (JSON.parse(account.save) as unknown) : null,
        saveUpdatedAt: account.saveUpdatedAt,
      });
    }),
  );

  // ---- cloud save
  app.get(
    '/api/account/save',
    wrap(async (req, res) => {
      const account = await accountOf(req);
      if (!account) return fail(res, 401, 'This device is not signed in.');
      res.json({
        ok: true,
        name: account.name,
        save: account.save ? (JSON.parse(account.save) as unknown) : null,
        saveUpdatedAt: account.saveUpdatedAt,
      });
    }),
  );

  app.put(
    '/api/account/save',
    json,
    wrap(async (req, res) => {
      if (!writeLimit.allow(ip(req))) return fail(res, 429, 'Saving too often. Please wait a moment.');
      const account = await accountOf(req);
      if (!account) return fail(res, 401, 'This device is not signed in.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const save = body.save;
      if (typeof save !== 'object' || save === null || Array.isArray(save) || (save as { version?: unknown }).version !== 1) {
        return fail(res, 400, 'The save data is not valid.');
      }
      const copy = { ...(save as Record<string, unknown>) };
      delete copy.playerToken; // device secrets never go to the cloud
      const text = JSON.stringify(copy);
      if (Buffer.byteLength(text) > MAX_SAVE_BYTES) return fail(res, 413, 'The save is too large.');
      let name = account.name;
      try {
        name = sanitizeName(copy.name);
      } catch {
        /* keep the old name */
      }
      const at = now();
      await store.saveAccount(account.id, name, text, at);
      res.json({ ok: true, saveUpdatedAt: at });
    }),
  );

  app.post(
    '/api/account/unlink',
    json,
    wrap(async (req, res) => {
      const token = tokenOf(req);
      if (token) await store.unlinkToken(sha256(token));
      res.json({ ok: true });
    }),
  );

  app.delete(
    '/api/account',
    wrap(async (req, res) => {
      const account = await accountOf(req);
      if (!account) return fail(res, 401, 'This device is not signed in.');
      await store.deleteAccount(account.id);
      res.json({ ok: true });
    }),
  );

  // ---- Daily Challenge submission (checked by the server)
  app.post(
    '/api/daily/submit',
    json,
    wrap(async (req, res) => {
      if (!writeLimit.allow(ip(req))) return fail(res, 429, 'Too many submissions. Please wait a moment.');
      const account = await accountOf(req);
      if (!account) return fail(res, 401, 'Sign in to put your result on the Daily Challenge board.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const day = typeof body.day === 'string' ? body.day : '';
      if (!DAY_PATTERN.test(day)) return fail(res, 400, 'Invalid day.');
      const t = now();
      const allowed = [utcDay(t - DAY_MS), utcDay(t), utcDay(t + DAY_MS)];
      if (!allowed.includes(day)) return fail(res, 400, 'That Daily Challenge is not open any more.');
      const info = dailyInfo(day);
      // The real text is re-created from the day's seed, so its exact length is known.
      const length = generateText(info.difficulty, info.chars, info.seed, DAILY_TIER).length;
      const check = checkKeyLog(body.times, length);
      if (!check.ok) return fail(res, 422, 'That run was not accepted: the typing speed was not believable.');
      const errors = typeof body.errors === 'number' && Number.isFinite(body.errors) ? Math.max(0, Math.min(length * 3, Math.floor(body.errors))) : 0;
      const accuracy = Math.round((length / (length + errors)) * 1000) / 10;
      const wpm = Math.round((length / 5 / (check.durationMs / 60000)) * 10) / 10;
      const score = dailyScore(wpm, accuracy, info.difficulty).total;
      await store.addScore({
        accountId: account.id,
        name: account.name,
        wpm,
        accuracy,
        score,
        difficulty: info.difficulty,
        mode: 'daily',
        day,
        at: t,
      });
      const rows = bestPerPlayer(await store.topScores({ mode: 'daily', day, limit: 500 }));
      const rank = rows.findIndex((r) => r.accountId === account.id) + 1;
      res.json({ ok: true, wpm, accuracy, score, rank: rank > 0 ? rank : null, players: rows.length });
    }),
  );

  // ---- boards
  app.get(
    '/api/board',
    wrap(async (req, res) => {
      const scope = typeof req.query.scope === 'string' ? req.query.scope : 'alltime';
      const difficulty = ['easy', 'medium', 'hard', 'expert'].includes(String(req.query.difficulty))
        ? (String(req.query.difficulty) as Difficulty)
        : undefined;
      const t = now();
      let rows: ScoreRow[];
      let note: string;
      if (scope === 'daily') {
        const requested = typeof req.query.day === 'string' && DAY_PATTERN.test(req.query.day) ? req.query.day : utcDay(t);
        const allowed = [utcDay(t - DAY_MS), utcDay(t), utcDay(t + DAY_MS)];
        const day = allowed.includes(requested) ? requested : utcDay(t);
        rows = await store.topScores({ mode: 'daily', day, difficulty, limit: 500 });
        note = `Daily Challenge ${day}. Every result is checked by the server.`;
      } else if (scope === 'weekly') {
        rows = await store.topScores({ sinceMs: t - WEEK_MS, difficulty, limit: 500 });
        note = 'Best result per player in the last 7 days (public matches and Daily Challenges).';
      } else if (scope === 'public') {
        rows = await store.topScores({ mode: 'public', difficulty, limit: 500 });
        note = 'Best result per player in public matches.';
      } else {
        rows = await store.topScores({ difficulty, limit: 500 });
        note = 'Best result per player of all time (public matches and Daily Challenges).';
      }
      const best = bestPerPlayer(rows);
      const me = await accountOf(req);
      const myIndex = me ? best.findIndex((r) => r.accountId === me.id) : -1;
      res.json({
        ok: true,
        scope,
        entries: best.slice(0, BOARD_SIZE).map((row, i) => toEntry(row, i + 1)),
        me: myIndex >= 0 ? toEntry(best[myIndex], myIndex + 1) : null,
        persistent: store.kind === 'postgres',
        note: store.kind === 'postgres' ? note : `${note} The server has no database connected yet, so this board resets when the server restarts.`,
      });
    }),
  );

  // JSON errors for bad bodies (too large, invalid JSON) instead of an HTML page.
  app.use('/api', (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 500;
    if (status === 413) return fail(res, 413, 'That request is too large.');
    if (status >= 400 && status < 500) return fail(res, 400, 'That request could not be read.');
    console.error('[api] error:', error);
    return fail(res, 500, 'Something went wrong on the server.');
  });
}
