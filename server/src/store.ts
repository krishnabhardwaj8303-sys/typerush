import { Pool, type PoolConfig } from 'pg';
import { isTextLang, type Difficulty, type TextLang } from '@typerush/shared';

// Storage for accounts, cloud saves and leaderboard scores.
//  - PgStore keeps everything in a PostgreSQL database (Supabase, Neon... any free Postgres works).
//  - MemoryStore is used when DATABASE_URL is not set: everything works, but is lost on restart.

export type ScoreMode = 'public' | 'daily' | 'cup' | 'class';

export interface AccountRecord {
  id: string;
  name: string;
  createdAt: number;
  /** The cloud save as a JSON string (or null when nothing was uploaded yet). */
  save: string | null;
  saveUpdatedAt: number | null;
}

export interface ScoreInput {
  accountId: string | null;
  name: string;
  wpm: number;
  accuracy: number;
  score: number;
  difficulty: Difficulty;
  mode: ScoreMode;
  /** Calendar day (YYYY-MM-DD) for daily scores, otherwise the UTC day of the race. */
  day: string;
  at: number;
}

export interface ScoreRow extends ScoreInput {
  id: number;
}

export interface ScoreQuery {
  mode?: ScoreMode;
  day?: string;
  sinceMs?: number;
  difficulty?: Difficulty;
  /** Only rows of these accounts. */
  accountIds?: string[];
  /** Maximum rows to read (the caller keeps the best row per player). */
  limit: number;
}

export interface ClassRecord {
  id: string;
  code: string;
  ownerId: string;
  name: string;
  difficulty: Difficulty;
  /** Language of the class texts (English unless the teacher picked another). */
  lang: TextLang;
  round: number;
  createdAt: number;
}

export interface Store {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;
  close(): Promise<void>;
  /** Cheap round trip to the database (keeps a free hosted database awake). True when it answered. */
  ping(): Promise<boolean>;

  createAccount(input: { id: string; name: string; tokenHash: string; recoveryHash: string; at: number }): Promise<void>;
  /** Adds another device (token) to an account. */
  linkToken(tokenHash: string, accountId: string): Promise<void>;
  unlinkToken(tokenHash: string): Promise<void>;
  accountByToken(tokenHash: string): Promise<AccountRecord | null>;
  accountByRecovery(recoveryHash: string): Promise<AccountRecord | null>;
  saveAccount(accountId: string, name: string, save: string, at: number): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;

  addScore(score: ScoreInput): Promise<void>;
  topScores(query: ScoreQuery): Promise<ScoreRow[]>;

  // friends
  /** Returns the friend code of an account, saving `candidate` as its code when it has none yet. */
  ensureFriendCode(accountId: string, candidate: string): Promise<string>;
  accountIdByFriendCode(code: string): Promise<string | null>;
  addFriendship(a: string, b: string): Promise<void>;
  removeFriendship(a: string, b: string): Promise<void>;
  friendIds(accountId: string): Promise<string[]>;
  accountNames(ids: string[]): Promise<Map<string, string>>;

  // classrooms
  createClass(c: ClassRecord): Promise<void>;
  classByCode(code: string): Promise<ClassRecord | null>;
  classById(id: string): Promise<ClassRecord | null>;
  classesOf(accountId: string): Promise<ClassRecord[]>;
  joinClass(classId: string, accountId: string): Promise<void>;
  leaveClass(classId: string, accountId: string): Promise<void>;
  classMemberIds(classId: string): Promise<string[]>;
  nextClassRound(classId: string): Promise<void>;
  deleteClass(classId: string): Promise<void>;
}

// ---------------------------------------------------------------- memory

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private accounts = new Map<string, AccountRecord & { recoveryHash: string }>();
  private tokens = new Map<string, string>();
  private scores: ScoreRow[] = [];
  private nextId = 1;
  private friendCodes = new Map<string, string>();
  private friendships = new Set<string>();
  private classes = new Map<string, ClassRecord>();
  private members = new Set<string>();

  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async ping(): Promise<boolean> {
    return true;
  }

  async createAccount(input: { id: string; name: string; tokenHash: string; recoveryHash: string; at: number }) {
    this.accounts.set(input.id, {
      id: input.id,
      name: input.name,
      createdAt: input.at,
      save: null,
      saveUpdatedAt: null,
      recoveryHash: input.recoveryHash,
    });
    this.tokens.set(input.tokenHash, input.id);
  }

  async linkToken(tokenHash: string, accountId: string) {
    this.tokens.set(tokenHash, accountId);
  }

  async unlinkToken(tokenHash: string) {
    this.tokens.delete(tokenHash);
  }

  private strip(a: (AccountRecord & { recoveryHash: string }) | undefined): AccountRecord | null {
    if (!a) return null;
    const { recoveryHash: _ignored, ...rest } = a;
    void _ignored;
    return rest;
  }

  async accountByToken(tokenHash: string) {
    const id = this.tokens.get(tokenHash);
    return id ? this.strip(this.accounts.get(id)) : null;
  }

  async accountByRecovery(recoveryHash: string) {
    for (const a of this.accounts.values()) if (a.recoveryHash === recoveryHash) return this.strip(a);
    return null;
  }

  async saveAccount(accountId: string, name: string, save: string, at: number) {
    const a = this.accounts.get(accountId);
    if (!a) return;
    a.name = name;
    a.save = save;
    a.saveUpdatedAt = at;
  }

  async deleteAccount(accountId: string) {
    this.accounts.delete(accountId);
    for (const [hash, id] of this.tokens) if (id === accountId) this.tokens.delete(hash);
    this.scores = this.scores.filter((s) => s.accountId !== accountId);
    this.friendCodes.delete(accountId);
    for (const key of [...this.friendships]) if (key.split('|').includes(accountId)) this.friendships.delete(key);
    for (const c of [...this.classes.values()]) if (c.ownerId === accountId) await this.deleteClass(c.id);
    for (const key of [...this.members]) if (key.endsWith(`|${accountId}`)) this.members.delete(key);
  }

  async ensureFriendCode(accountId: string, candidate: string) {
    const existing = this.friendCodes.get(accountId);
    if (existing) return existing;
    for (const code of this.friendCodes.values()) if (code === candidate) throw new Error('friend code collision');
    this.friendCodes.set(accountId, candidate);
    return candidate;
  }

  async accountIdByFriendCode(code: string) {
    for (const [id, c] of this.friendCodes) if (c === code) return id;
    return null;
  }

  async addFriendship(a: string, b: string) {
    this.friendships.add(`${a}|${b}`);
    this.friendships.add(`${b}|${a}`);
  }

  async removeFriendship(a: string, b: string) {
    this.friendships.delete(`${a}|${b}`);
    this.friendships.delete(`${b}|${a}`);
  }

  async friendIds(accountId: string) {
    return [...this.friendships].filter((k) => k.startsWith(`${accountId}|`)).map((k) => k.split('|')[1]);
  }

  async accountNames(ids: string[]) {
    const out = new Map<string, string>();
    for (const id of ids) {
      const a = this.accounts.get(id);
      if (a) out.set(id, a.name);
    }
    return out;
  }

  async createClass(c: ClassRecord) {
    this.classes.set(c.id, { ...c });
  }

  async classByCode(code: string) {
    for (const c of this.classes.values()) if (c.code === code) return { ...c };
    return null;
  }

  async classById(id: string) {
    const c = this.classes.get(id);
    return c ? { ...c } : null;
  }

  async classesOf(accountId: string) {
    return [...this.classes.values()]
      .filter((c) => c.ownerId === accountId || this.members.has(`${c.id}|${accountId}`))
      .map((c) => ({ ...c }));
  }

  async joinClass(classId: string, accountId: string) {
    this.members.add(`${classId}|${accountId}`);
  }

  async leaveClass(classId: string, accountId: string) {
    this.members.delete(`${classId}|${accountId}`);
  }

  async classMemberIds(classId: string) {
    return [...this.members].filter((k) => k.startsWith(`${classId}|`)).map((k) => k.split('|')[1]);
  }

  async nextClassRound(classId: string) {
    const c = this.classes.get(classId);
    if (c) c.round += 1;
  }

  async deleteClass(classId: string) {
    this.classes.delete(classId);
    for (const key of [...this.members]) if (key.startsWith(`${classId}|`)) this.members.delete(key);
    this.scores = this.scores.filter((s) => !(s.mode === 'class' && s.day.startsWith(`${classId}:`)));
  }

  async addScore(score: ScoreInput) {
    this.scores.push({ ...score, id: this.nextId++ });
    if (this.scores.length > 20000) this.scores.splice(0, this.scores.length - 20000);
  }

  async topScores(q: ScoreQuery) {
    return this.scores
      .filter(
        (s) =>
          (!q.mode || s.mode === q.mode) &&
          (!q.day || s.day === q.day) &&
          (q.sinceMs === undefined || s.at >= q.sinceMs) &&
          (!q.difficulty || s.difficulty === q.difficulty) &&
          (!q.accountIds || (s.accountId !== null && q.accountIds.includes(s.accountId))),
      )
      .sort((a, b) => b.score - a.score || b.wpm - a.wpm || a.at - b.at)
      .slice(0, q.limit);
  }
}

// ---------------------------------------------------------------- postgres

export interface PgLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    recovery_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    save TEXT,
    save_updated_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS account_tokens (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    id SERIAL PRIMARY KEY,
    account_id TEXT,
    name TEXT NOT NULL,
    wpm REAL NOT NULL,
    accuracy REAL NOT NULL,
    score INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    mode TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS friend_codes (
    account_id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS friendships (
    account_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    PRIMARY KEY (account_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    round INTEGER NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS class_members (
    class_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    PRIMARY KEY (class_id, account_id)
  )`,
  "ALTER TABLE classes ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'en'",
  'CREATE INDEX IF NOT EXISTS scores_mode_day_idx ON scores (mode, day, score)',
  'CREATE INDEX IF NOT EXISTS scores_created_idx ON scores (created_at)',
];

function toAccount(row: Record<string, unknown>): AccountRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: Number(row.created_at),
    save: row.save === null || row.save === undefined ? null : String(row.save),
    saveUpdatedAt: row.save_updated_at === null || row.save_updated_at === undefined ? null : Number(row.save_updated_at),
  };
}

export class PgStore implements Store {
  readonly kind = 'postgres' as const;

  constructor(private pool: PgLike) {}

  async init(): Promise<void> {
    for (const statement of SCHEMA) await this.pool.query(statement);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async createAccount(input: { id: string; name: string; tokenHash: string; recoveryHash: string; at: number }) {
    await this.pool.query('INSERT INTO accounts (id, recovery_hash, name, created_at) VALUES ($1, $2, $3, $4)', [
      input.id,
      input.recoveryHash,
      input.name,
      input.at,
    ]);
    await this.pool.query('INSERT INTO account_tokens (token_hash, account_id) VALUES ($1, $2)', [input.tokenHash, input.id]);
  }

  async linkToken(tokenHash: string, accountId: string) {
    await this.pool.query('DELETE FROM account_tokens WHERE token_hash = $1', [tokenHash]);
    await this.pool.query('INSERT INTO account_tokens (token_hash, account_id) VALUES ($1, $2)', [tokenHash, accountId]);
  }

  async unlinkToken(tokenHash: string) {
    await this.pool.query('DELETE FROM account_tokens WHERE token_hash = $1', [tokenHash]);
  }

  async accountByToken(tokenHash: string) {
    const res = await this.pool.query(
      'SELECT a.* FROM accounts a JOIN account_tokens t ON t.account_id = a.id WHERE t.token_hash = $1',
      [tokenHash],
    );
    return res.rows[0] ? toAccount(res.rows[0]) : null;
  }

  async accountByRecovery(recoveryHash: string) {
    const res = await this.pool.query('SELECT * FROM accounts WHERE recovery_hash = $1', [recoveryHash]);
    return res.rows[0] ? toAccount(res.rows[0]) : null;
  }

  async saveAccount(accountId: string, name: string, save: string, at: number) {
    await this.pool.query('UPDATE accounts SET name = $2, save = $3, save_updated_at = $4 WHERE id = $1', [accountId, name, save, at]);
  }

  async deleteAccount(accountId: string) {
    await this.pool.query('DELETE FROM account_tokens WHERE account_id = $1', [accountId]);
    await this.pool.query('DELETE FROM scores WHERE account_id = $1', [accountId]);
    await this.pool.query('DELETE FROM friend_codes WHERE account_id = $1', [accountId]);
    await this.pool.query('DELETE FROM friendships WHERE account_id = $1 OR friend_id = $1', [accountId]);
    const owned = await this.pool.query('SELECT id FROM classes WHERE owner_id = $1', [accountId]);
    for (const row of owned.rows) await this.deleteClass(String(row.id));
    await this.pool.query('DELETE FROM class_members WHERE account_id = $1', [accountId]);
    await this.pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
  }

  async ensureFriendCode(accountId: string, candidate: string) {
    const existing = await this.pool.query('SELECT code FROM friend_codes WHERE account_id = $1', [accountId]);
    if (existing.rows[0]) return String(existing.rows[0].code);
    await this.pool.query('INSERT INTO friend_codes (account_id, code) VALUES ($1, $2)', [accountId, candidate]);
    return candidate;
  }

  async accountIdByFriendCode(code: string) {
    const res = await this.pool.query('SELECT account_id FROM friend_codes WHERE code = $1', [code]);
    return res.rows[0] ? String(res.rows[0].account_id) : null;
  }

  async addFriendship(a: string, b: string) {
    for (const [x, y] of [[a, b], [b, a]]) {
      await this.pool.query('DELETE FROM friendships WHERE account_id = $1 AND friend_id = $2', [x, y]);
      await this.pool.query('INSERT INTO friendships (account_id, friend_id) VALUES ($1, $2)', [x, y]);
    }
  }

  async removeFriendship(a: string, b: string) {
    await this.pool.query(
      'DELETE FROM friendships WHERE (account_id = $1 AND friend_id = $2) OR (account_id = $2 AND friend_id = $1)',
      [a, b],
    );
  }

  async friendIds(accountId: string) {
    const res = await this.pool.query('SELECT friend_id FROM friendships WHERE account_id = $1', [accountId]);
    return res.rows.map((r) => String(r.friend_id));
  }

  async accountNames(ids: string[]) {
    const out = new Map<string, string>();
    for (const id of ids) {
      const res = await this.pool.query('SELECT name FROM accounts WHERE id = $1', [id]);
      if (res.rows[0]) out.set(id, String(res.rows[0].name));
    }
    return out;
  }

  private toClass(r: Record<string, unknown>): ClassRecord {
    return {
      id: String(r.id),
      code: String(r.code),
      ownerId: String(r.owner_id),
      name: String(r.name),
      difficulty: String(r.difficulty) as Difficulty,
      lang: isTextLang(r.lang) ? r.lang : 'en',
      round: Number(r.round),
      createdAt: Number(r.created_at),
    };
  }

  async createClass(c: ClassRecord) {
    await this.pool.query(
      'INSERT INTO classes (id, code, owner_id, name, difficulty, lang, round, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [c.id, c.code, c.ownerId, c.name, c.difficulty, c.lang, c.round, c.createdAt],
    );
  }

  async classByCode(code: string) {
    const res = await this.pool.query('SELECT * FROM classes WHERE code = $1', [code]);
    return res.rows[0] ? this.toClass(res.rows[0]) : null;
  }

  async classById(id: string) {
    const res = await this.pool.query('SELECT * FROM classes WHERE id = $1', [id]);
    return res.rows[0] ? this.toClass(res.rows[0]) : null;
  }

  async classesOf(accountId: string) {
    const res = await this.pool.query(
      'SELECT * FROM classes WHERE owner_id = $1 OR id IN (SELECT class_id FROM class_members WHERE account_id = $1) ORDER BY created_at ASC',
      [accountId],
    );
    return res.rows.map((r) => this.toClass(r));
  }

  async joinClass(classId: string, accountId: string) {
    await this.pool.query('DELETE FROM class_members WHERE class_id = $1 AND account_id = $2', [classId, accountId]);
    await this.pool.query('INSERT INTO class_members (class_id, account_id) VALUES ($1, $2)', [classId, accountId]);
  }

  async leaveClass(classId: string, accountId: string) {
    await this.pool.query('DELETE FROM class_members WHERE class_id = $1 AND account_id = $2', [classId, accountId]);
  }

  async classMemberIds(classId: string) {
    const res = await this.pool.query('SELECT account_id FROM class_members WHERE class_id = $1', [classId]);
    return res.rows.map((r) => String(r.account_id));
  }

  async nextClassRound(classId: string) {
    await this.pool.query('UPDATE classes SET round = round + 1 WHERE id = $1', [classId]);
  }

  async deleteClass(classId: string) {
    await this.pool.query('DELETE FROM class_members WHERE class_id = $1', [classId]);
    await this.pool.query("DELETE FROM scores WHERE mode = 'class' AND day LIKE $1", [`${classId}:%`]);
    await this.pool.query('DELETE FROM classes WHERE id = $1', [classId]);
  }

  async addScore(s: ScoreInput) {
    await this.pool.query(
      'INSERT INTO scores (account_id, name, wpm, accuracy, score, difficulty, mode, day, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [s.accountId, s.name, s.wpm, s.accuracy, s.score, s.difficulty, s.mode, s.day, s.at],
    );
  }

  async topScores(q: ScoreQuery) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };
    if (q.mode) add('mode = ?', q.mode);
    if (q.day) add('day = ?', q.day);
    if (q.sinceMs !== undefined) add('created_at >= ?', q.sinceMs);
    if (q.difficulty) add('difficulty = ?', q.difficulty);
    if (q.accountIds) {
      if (q.accountIds.length === 0) return [];
      const marks = q.accountIds.map((id) => {
        params.push(id);
        return `$${params.length}`;
      });
      where.push(`account_id IN (${marks.join(', ')})`);
    }
    params.push(Math.max(1, Math.min(2000, Math.floor(q.limit))));
    const sql = `SELECT * FROM scores ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY score DESC, wpm DESC, created_at ASC LIMIT $${params.length}`;
    const res = await this.pool.query(sql, params);
    return res.rows.map((r) => ({
      id: Number(r.id),
      accountId: r.account_id === null || r.account_id === undefined ? null : String(r.account_id),
      name: String(r.name),
      wpm: Number(r.wpm),
      accuracy: Number(r.accuracy),
      score: Number(r.score),
      difficulty: String(r.difficulty) as Difficulty,
      mode: String(r.mode) as ScoreMode,
      day: String(r.day),
      at: Number(r.created_at),
    }));
  }
}

/** Builds a pool for a connection string. Hosted databases (Supabase, Neon) need SSL. */
export function createPgPool(databaseUrl: string, ssl: boolean): Pool {
  const url = new URL(databaseUrl);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const config: PoolConfig = {
    connectionString: databaseUrl.replace(/[?&]sslmode=[^&]*/g, ''),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: ssl && !local ? { rejectUnauthorized: false } : undefined,
  };
  return new Pool(config);
}

export async function createStore(databaseUrl: string | null, ssl: boolean): Promise<Store> {
  if (!databaseUrl) return new MemoryStore();
  const store = new PgStore(createPgPool(databaseUrl, ssl));
  await store.init();
  return store;
}
