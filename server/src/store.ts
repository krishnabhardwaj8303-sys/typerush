import { Pool, type PoolConfig } from 'pg';
import type { Difficulty } from '@typerush/shared';

// Storage for accounts, cloud saves and leaderboard scores.
//  - PgStore keeps everything in a PostgreSQL database (Supabase, Neon... any free Postgres works).
//  - MemoryStore is used when DATABASE_URL is not set: everything works, but is lost on restart.

export type ScoreMode = 'public' | 'daily';

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
  /** Maximum rows to read (the caller keeps the best row per player). */
  limit: number;
}

export interface Store {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;
  close(): Promise<void>;

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
}

// ---------------------------------------------------------------- memory

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private accounts = new Map<string, AccountRecord & { recoveryHash: string }>();
  private tokens = new Map<string, string>();
  private scores: ScoreRow[] = [];
  private nextId = 1;

  async init(): Promise<void> {}
  async close(): Promise<void> {}

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
          (!q.difficulty || s.difficulty === q.difficulty),
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
    await this.pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
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
