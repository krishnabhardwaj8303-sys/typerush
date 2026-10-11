import { newDb } from 'pg-mem';
import { afterEach, describe, expect, it } from 'vitest';
import { classInfo, cupInfo, generateText, weekStartDay } from '@typerush/shared';
import { createTypeRushServer, type RunningServer } from '../src/app';
import { makeClassCode, makeFriendCode, normalizeCode } from '../src/community';
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
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const signUp = async (name: string) => {
    const token = newToken();
    const res = await call('POST', '/api/account/create', { token, name });
    expect(res.status).toBe(200);
    return token;
  };
  return { call, signUp };
}

const run = (chars: number, cps: number) => Array.from({ length: chars }, (_, i) => Math.round(((i + 1) / cps) * 1000));
const lengthOf = (info: { difficulty: any; chars: number; seed: number; tier: number }) =>
  generateText(info.difficulty, info.chars, info.seed, info.tier).length;

describe('codes and cup info', () => {
  it('makes and normalises codes', () => {
    expect(makeFriendCode()).toMatch(/^FR-[A-Z2-9]{6}$/);
    expect(makeClassCode()).toMatch(/^CL-[A-Z2-9]{6}$/);
    expect(normalizeCode('fr abc234', 'FR')).toBe('FR-ABC234');
    expect(normalizeCode('CL-ABC234', 'FR')).toBeNull();
    expect(normalizeCode('FR-AB', 'FR')).toBeNull();
    expect(normalizeCode(5, 'FR')).toBeNull();
  });

  it('starts the cup week on Monday (UTC)', () => {
    expect(weekStartDay(Date.parse('2026-10-11T10:00:00Z'))).toBe('2026-10-05'); // a Sunday
    expect(weekStartDay(Date.parse('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
    const info = cupInfo(Date.parse('2026-10-08T12:00:00Z'));
    expect(info.week).toBe('2026-10-05');
    expect(info.endsAt - info.startsAt).toBe(7 * 24 * 3600 * 1000);
    expect(['hard', 'expert']).toContain(info.difficulty);
  });
});

describe.each([
  ['memory store', async () => new MemoryStore() as Store],
  ['postgres (pg-mem)', pgMemStore],
])('friends, cup and classrooms: %s', (_label, makeStore) => {
  it('needs an account for everything', async () => {
    const { call } = await boot(await makeStore());
    for (const [m, p] of [['GET', '/api/friends'], ['GET', '/api/classes'], ['POST', '/api/cup/submit'], ['POST', '/api/class/create']] as const) {
      expect((await call(m, p, m === 'POST' ? {} : undefined)).status).toBe(401);
    }
    expect((await call('GET', '/api/cup')).status).toBe(200); // the cup board is public
  });

  it('adds friends with a friend code and shows a friends board', async () => {
    const { call, signUp } = await boot(await makeStore());
    const a = await signUp('Asha');
    const b = await signUp('Ben');
    const mineA = (await call('GET', '/api/friends', undefined, a)).body;
    const mineB = (await call('GET', '/api/friends', undefined, b)).body;
    expect(mineA.code).toMatch(/^FR-/);
    expect((await call('GET', '/api/friends', undefined, a)).body.code).toBe(mineA.code); // stable

    expect((await call('POST', '/api/friends/add', { code: mineA.code }, a)).status).toBe(400); // yourself
    expect((await call('POST', '/api/friends/add', { code: 'FR-ZZZZZZ' }, a)).status).toBe(404);
    expect((await call('POST', '/api/friends/add', { code: 'nope' }, a)).status).toBe(400);
    const added = await call('POST', '/api/friends/add', { code: mineB.code }, a);
    expect(added.status).toBe(200);
    expect(added.body.name).toBe('Ben');
    expect((await call('POST', '/api/friends/add', { code: mineB.code }, a)).status).toBe(409);

    const listA = (await call('GET', '/api/friends', undefined, a)).body;
    const listB = (await call('GET', '/api/friends', undefined, b)).body;
    expect(listA.friends.map((f: any) => f.name)).toEqual(['Ben']);
    expect(listB.friends.map((f: any) => f.name)).toEqual(['Asha']); // friendship goes both ways

    // a Cup result shows up on the friends board
    const info = cupInfo(Date.now());
    const r = await call('POST', '/api/cup/submit', { times: run(lengthOf(info), 5), errors: 2 }, b);
    expect(r.status).toBe(200);
    const board = (await call('GET', '/api/friends', undefined, a)).body.board;
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ name: 'Ben', you: false });

    await call('POST', '/api/friends/remove', { code: mineB.code }, a);
    expect((await call('GET', '/api/friends', undefined, a)).body.friends).toEqual([]);
    expect((await call('GET', '/api/friends', undefined, b)).body.friends).toEqual([]);
  });

  it('runs the weekly cup with checked results and a limited number of attempts', async () => {
    const { call, signUp } = await boot(await makeStore());
    const a = await signUp('Asha');
    const b = await signUp('Ben');
    const cup = (await call('GET', '/api/cup', undefined, a)).body;
    expect(cup.attemptsUsed).toBe(0);
    const len = lengthOf({ ...cup.cup });

    expect((await call('POST', '/api/cup/submit', { times: run(len, 50), errors: 0 }, a)).status).toBe(422); // too fast
    expect((await call('POST', '/api/cup/submit', { times: run(len - 1, 5), errors: 0 }, a)).status).toBe(422); // wrong length

    const slow = await call('POST', '/api/cup/submit', { times: run(len, 4), errors: 0 }, a);
    const fast = await call('POST', '/api/cup/submit', { times: run(len, 6), errors: 0 }, b);
    expect(slow.status).toBe(200);
    expect(fast.body.rank).toBe(1);
    expect(fast.body.score).toBeGreaterThan(slow.body.score);

    const after = (await call('GET', '/api/cup', undefined, a)).body;
    expect(after.entries.map((e: any) => e.name)).toEqual(['Ben', 'Asha']);
    expect(after.me.rank).toBe(2);
    expect(after.attemptsUsed).toBe(1);

    await call('POST', '/api/cup/submit', { times: run(len, 4), errors: 0 }, a);
    await call('POST', '/api/cup/submit', { times: run(len, 4), errors: 0 }, a);
    expect((await call('POST', '/api/cup/submit', { times: run(len, 4), errors: 0 }, a)).status).toBe(429);
    expect((await call('GET', '/api/cup', undefined, a)).body.entries).toHaveLength(2); // still one row per player
  });

  it('lets a teacher run a class: join, submit, new round, delete', async () => {
    const { call, signUp } = await boot(await makeStore());
    const teacher = await signUp('Teacher');
    const s1 = await signUp('Asha');
    const s2 = await signUp('Ben');
    const outsider = await signUp('Zed');

    expect((await call('POST', '/api/class/create', { name: '   ', difficulty: 'easy' }, teacher)).status).toBe(400);
    const created = await call('POST', '/api/class/create', { name: 'BCA Sem 3', difficulty: 'easy' }, teacher);
    expect(created.status).toBe(200);
    const { id, code } = created.body.class;
    expect(code).toMatch(/^CL-/);
    expect(created.body.class).toMatchObject({ owner: true, round: 1, difficulty: 'easy' });

    expect((await call('POST', '/api/class/join', { code: 'CL-ZZZZZZ' }, s1)).status).toBe(404);
    expect((await call('POST', '/api/class/join', { code: code.toLowerCase() }, s1)).body.class.owner).toBe(false);
    await call('POST', '/api/class/join', { code }, s2);
    await call('POST', '/api/class/join', { code }, s2); // joining twice is harmless

    expect((await call('GET', `/api/class/${id}`, undefined, outsider)).status).toBe(404);
    expect((await call('POST', '/api/class/submit', { id, times: [1] }, outsider)).status).toBe(404);

    const detail = (await call('GET', `/api/class/${id}`, undefined, teacher)).body;
    expect(detail.members).toBe(3);
    expect(detail.waiting.sort()).toEqual(['Asha', 'Ben', 'Teacher']);
    const info = classInfo(id, 1, 'easy');
    expect(detail.assignment.seed).toBe(info.seed);
    const len = lengthOf(info);

    expect((await call('POST', '/api/class/submit', { id, times: run(len, 60) }, s1)).status).toBe(422);
    const r1 = await call('POST', '/api/class/submit', { id, times: run(len, 3), errors: 1 }, s1);
    const r2 = await call('POST', '/api/class/submit', { id, times: run(len, 5), errors: 0 }, s2);
    expect(r1.status).toBe(200);
    expect(r2.body.rank).toBe(1);

    const asTeacher = (await call('GET', `/api/class/${id}`, undefined, teacher)).body;
    expect(asTeacher.entries.map((e: any) => e.name)).toEqual(['Ben', 'Asha']);
    expect(asTeacher.waiting).toEqual(['Teacher']);
    const asStudent = (await call('GET', `/api/class/${id}`, undefined, s1)).body;
    expect(asStudent.waiting).toBeUndefined(); // students do not see who is missing

    expect((await call('POST', '/api/class/round', { id }, s1)).status).toBe(403);
    expect((await call('POST', '/api/class/round', { id }, teacher)).body.round).toBe(2);
    const round2 = (await call('GET', `/api/class/${id}`, undefined, s1)).body;
    expect(round2.entries).toEqual([]); // fresh board for the new text
    expect(round2.assignment.seed).not.toBe(info.seed);

    expect((await call('GET', '/api/classes', undefined, s1)).body.classes).toHaveLength(1);
    await call('POST', '/api/class/leave', { id }, s1);
    expect((await call('GET', '/api/classes', undefined, s1)).body.classes).toHaveLength(0);

    expect((await call('DELETE', `/api/class/${id}`, undefined, s2)).status).toBe(403);
    expect((await call('DELETE', `/api/class/${id}`, undefined, teacher)).status).toBe(200);
    expect((await call('GET', `/api/class/${id}`, undefined, teacher)).status).toBe(404);
  });

  it('cleans friends and classes when an account is deleted', async () => {
    const { call, signUp } = await boot(await makeStore());
    const a = await signUp('Asha');
    const b = await signUp('Ben');
    const codeB = (await call('GET', '/api/friends', undefined, b)).body.code;
    await call('POST', '/api/friends/add', { code: codeB }, a);
    const made = await call('POST', '/api/class/create', { name: 'Gone', difficulty: 'easy' }, a);
    await call('POST', '/api/class/join', { code: made.body.class.code }, b);
    expect((await call('DELETE', '/api/account', undefined, a)).status).toBe(200);
    expect((await call('GET', '/api/friends', undefined, b)).body.friends).toEqual([]);
    expect((await call('GET', '/api/classes', undefined, b)).body.classes).toEqual([]);
  });
});
