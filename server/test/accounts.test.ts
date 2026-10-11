import { newDb } from 'pg-mem';
import { afterEach, describe, expect, it } from 'vitest';
import { DAILY_TIER, dailyInfo, dailyScore, generateText } from '@typerush/shared';
import { createTypeRushServer, type RunningServer } from '../src/app';
import { generateRecoveryCode, normalizeRecoveryCode, utcDay } from '../src/accounts';
import { MemoryStore, PgStore, type PgLike, type Store } from '../src/store';
import { newToken, testConfig } from './helpers';

async function pgMemStore(): Promise<Store> {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const store = new PgStore(new Pool() as unknown as PgLike);
  await store.init();
  return store;
}

const servers: RunningServer[] = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

async function boot(store: Store) {
  const server = createTypeRushServer(testConfig(), { store });
  servers.push(server);
  const port = await server.listen(0);
  const url = `http://127.0.0.1:${port}`;
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  return { url, call };
}

/** Length of the real Daily Challenge text of a day. */
const textLength = (day: string) => {
  const info = dailyInfo(day);
  return generateText(info.difficulty, info.chars, info.seed, DAILY_TIER).length;
};

/** A believable typing run: `cps` correct characters per second. */
const run = (chars: number, cps: number) => Array.from({ length: chars }, (_, i) => Math.round(((i + 1) / cps) * 1000));

describe('recovery codes', () => {
  it('generates and normalises codes', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^TR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeRecoveryCode('TR-1234')).toBeNull();
    expect(normalizeRecoveryCode('XX-ABCD-ABCD-ABCD-ABCD')).toBeNull();
    expect(normalizeRecoveryCode(42)).toBeNull();
    expect(new Set(Array.from({ length: 50 }, generateRecoveryCode)).size).toBe(50);
  });
});

describe.each([
  ['memory store', async () => new MemoryStore() as Store],
  ['postgres (pg-mem)', pgMemStore],
])('accounts, cloud save and boards: %s', (_label, makeStore) => {
  it('creates an account once per device and restores it on another device', async () => {
    const { call } = await boot(await makeStore());
    const t1 = newToken();
    const created = await call('POST', '/api/account/create', { token: t1, name: 'Krish' });
    expect(created.status).toBe(200);
    expect(created.body.recoveryCode).toMatch(/^TR-/);
    expect((await call('POST', '/api/account/create', { token: t1, name: 'Again' })).status).toBe(409);
    expect((await call('POST', '/api/account/create', { token: 'short', name: 'X' })).status).toBe(400);
    expect((await call('POST', '/api/account/create', { token: newToken(), name: '   ' })).status).toBe(400);

    await call('PUT', '/api/account/save', { save: { version: 1, name: 'Krish', coins: 77, playerToken: 'SECRET-DEVICE-TOKEN-123' } }, t1);

    const t2 = newToken();
    const messy = created.body.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const restored = await call('POST', '/api/account/restore', { token: t2, code: messy });
    expect(restored.status).toBe(200);
    expect(restored.body.save.coins).toBe(77);
    expect(restored.body.save.playerToken).toBeUndefined();
    // the second device can now save too
    expect((await call('PUT', '/api/account/save', { save: { version: 1, name: 'Krish', coins: 90 } }, t2)).status).toBe(200);
    expect((await call('GET', '/api/account/save', undefined, t1)).body.save.coins).toBe(90);

    expect((await call('POST', '/api/account/restore', { token: newToken(), code: 'TR-AAAA-AAAA-AAAA-AAAA' })).status).toBe(404);
    expect((await call('POST', '/api/account/restore', { token: newToken(), code: 'nonsense' })).status).toBe(400);
  });

  it('protects the cloud save', async () => {
    const { call, url } = await boot(await makeStore());
    const t = newToken();
    expect((await call('GET', '/api/account/save')).status).toBe(401);
    expect((await call('PUT', '/api/account/save', { save: { version: 1 } }, newToken())).status).toBe(401);
    await call('POST', '/api/account/create', { token: t, name: 'Safe' });
    expect((await call('PUT', '/api/account/save', { save: { version: 2 } }, t)).status).toBe(400);
    expect((await call('PUT', '/api/account/save', { save: [1, 2] }, t)).status).toBe(400);
    expect((await call('PUT', '/api/account/save', { save: { version: 1, junk: 'x'.repeat(35000) } }, t)).status).toBe(413);
    const bad = await fetch(`${url}/api/account/save`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: '{not json' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBeTruthy();
  });

  it('can unlink a device and delete an account with its scores', async () => {
    const { call } = await boot(await makeStore());
    const t = newToken();
    const { body } = await call('POST', '/api/account/create', { token: t, name: 'Gone' });
    const day = utcDay(Date.now());
    const chars = textLength(day);
    expect((await call('POST', '/api/daily/submit', { day, times: run(chars, 6), errors: 0 }, t)).status).toBe(200);
    expect((await call('GET', '/api/board?scope=daily')).body.entries).toHaveLength(1);

    const t2 = newToken();
    await call('POST', '/api/account/restore', { token: t2, code: body.recoveryCode });
    expect((await call('POST', '/api/account/unlink', {}, t2)).body.ok).toBe(true);
    expect((await call('GET', '/api/account/save', undefined, t2)).status).toBe(401);
    expect((await call('GET', '/api/account/save', undefined, t)).status).toBe(200);

    expect((await call('DELETE', '/api/account', undefined, t)).status).toBe(200);
    expect((await call('GET', '/api/account/save', undefined, t)).status).toBe(401);
    expect((await call('POST', '/api/account/restore', { token: newToken(), code: body.recoveryCode })).status).toBe(404);
    expect((await call('GET', '/api/board?scope=daily')).body.entries).toHaveLength(0);
  });

  it('accepts believable Daily Challenge runs and rejects impossible ones', async () => {
    const { call } = await boot(await makeStore());
    const t = newToken();
    const day = utcDay(Date.now());
    const info = { ...dailyInfo(day), chars: textLength(day) };
    expect((await call('POST', '/api/daily/submit', { day, times: run(info.chars, 6), errors: 0 })).status).toBe(401);
    await call('POST', '/api/account/create', { token: t, name: 'Speedy' });

    const ok = await call('POST', '/api/daily/submit', { day, times: run(info.chars, 6), errors: 2 }, t);
    expect(ok.status).toBe(200);
    expect(ok.body.rank).toBe(1);
    const expectedWpm = Math.round((info.chars / 5 / (run(info.chars, 6).at(-1)! / 60000)) * 10) / 10;
    expect(ok.body.wpm).toBe(expectedWpm);
    expect(ok.body.score).toBe(dailyScore(ok.body.wpm, ok.body.accuracy, info.difficulty).total);

    expect((await call('POST', '/api/daily/submit', { day, times: run(info.chars, 60), errors: 0 }, t)).status).toBe(422);
    expect((await call('POST', '/api/daily/submit', { day, times: run(info.chars - 1, 6), errors: 0 }, t)).status).toBe(422);
    expect((await call('POST', '/api/daily/submit', { day, times: run(info.chars, 6).reverse(), errors: 0 }, t)).status).toBe(422);
    expect((await call('POST', '/api/daily/submit', { day, times: 'abc', errors: 0 }, t)).status).toBe(422);
    expect((await call('POST', '/api/daily/submit', { day: '2020-01-01', times: run(info.chars, 6), errors: 0 }, t)).status).toBe(400);
    expect((await call('POST', '/api/daily/submit', { day: 'today', times: [], errors: 0 }, t)).status).toBe(400);
  });

  it('ranks players on the boards with one best result each', async () => {
    const { call } = await boot(await makeStore());
    const day = utcDay(Date.now());
    const chars = textLength(day);
    const tokens = [newToken(), newToken(), newToken()];
    const names = ['Slow', 'Mid', 'Fast'];
    for (let i = 0; i < 3; i++) await call('POST', '/api/account/create', { token: tokens[i], name: names[i] });
    await call('POST', '/api/daily/submit', { day, times: run(chars, 3), errors: 0 }, tokens[0]);
    await call('POST', '/api/daily/submit', { day, times: run(chars, 5), errors: 0 }, tokens[1]);
    await call('POST', '/api/daily/submit', { day, times: run(chars, 9), errors: 0 }, tokens[2]);
    await call('POST', '/api/daily/submit', { day, times: run(chars, 4), errors: 5 }, tokens[2]); // a worse second try

    const daily = await call('GET', '/api/board?scope=daily', undefined, tokens[1]);
    expect(daily.body.entries.map((e: { name: string }) => e.name)).toEqual(['Fast', 'Mid', 'Slow']);
    expect(daily.body.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 3]);
    expect(daily.body.me.name).toBe('Mid');
    expect(daily.body.me.rank).toBe(2);

    for (const scope of ['weekly', 'alltime']) {
      const board = await call('GET', `/api/board?scope=${scope}`);
      expect(board.body.entries).toHaveLength(3);
      expect(board.body.entries[0].name).toBe('Fast');
    }
    expect((await call('GET', '/api/board?scope=public')).body.entries).toHaveLength(0);
    const otherDifficulty = dailyInfo(day).difficulty === 'expert' ? 'easy' : 'expert';
    expect((await call('GET', `/api/board?scope=alltime&difficulty=${otherDifficulty}`)).body.entries).toHaveLength(0);
    expect((await call('GET', '/api/board?scope=daily&day=1999-01-01')).body.entries).toHaveLength(3); // falls back to today
  });

  it('limits how fast recovery codes can be guessed', async () => {
    const { call } = await boot(await makeStore());
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call('POST', '/api/account/restore', { token: newToken(), code: 'TR-AAAA-AAAA-AAAA-AAAA' })).status;
    expect(last).toBe(429);
  });
});
