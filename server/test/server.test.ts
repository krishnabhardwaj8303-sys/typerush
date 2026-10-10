import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MULTIPLAYER_CHARS, ROOM_CODE_ALPHABET } from '@typerush/shared';
import { TestClient, sleep, startServer, waitFor } from './helpers';
import type { RunningServer } from '../src/app';

let server: RunningServer;
let url: string;
let clients: TestClient[] = [];

async function client(name: string, headers: Record<string, string> = {}) {
  const c = new TestClient(url, name, 'wave', headers);
  clients.push(c);
  await c.connect();
  return c;
}

beforeEach(async () => {
  const started = await startServer();
  server = started.server;
  url = started.url;
});

afterEach(async () => {
  for (const c of clients) c.close();
  clients = [];
  await server.close();
});

describe('private rooms', () => {
  it('runs a full friends race with server-validated results', async () => {
    const host = await client('Asha');
    const guest = await client('Ben');

    const created = await host.create('easy');
    expect(created.ok).toBe(true);
    const code: string = created.room.code;
    expect(code).toHaveLength(5);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(created.room.type).toBe('private');

    const joined = await guest.join(code.toLowerCase()); // codes are case-insensitive
    expect(joined.ok).toBe(true);
    await waitFor(() => host.room?.players.length === 2, 3000, 'host sees guest');

    // Cannot start before the guest is ready.
    const early = await host.call('room:start');
    expect(early.ok).toBe(false);
    expect(early.error).toMatch(/Ben/);

    // Guests cannot start or change settings.
    expect((await guest.call('room:start')).ok).toBe(false);
    expect((await guest.call('room:settings', { difficulty: 'hard' })).ok).toBe(false);

    expect((await guest.call('room:ready', { ready: true })).ok).toBe(true);
    await waitFor(() => host.room?.players.find((p) => p.name === 'Ben')?.ready === true, 3000, 'ready state');

    expect((await host.call('room:start')).ok).toBe(true);
    await waitFor(() => host.room?.status === 'countdown' && guest.room?.status === 'countdown', 3000, 'countdown');

    // Both clients receive the same text and the same server start time.
    expect(host.room!.text).toBeTruthy();
    expect(host.room!.text).toBe(guest.room!.text);
    expect(host.room!.startAt).toBe(guest.room!.startAt);
    expect(host.room!.text!.length).toBeLessThanOrEqual(MULTIPLAYER_CHARS.easy);

    await waitFor(() => host.room?.status === 'racing', 3000, 'racing');
    await Promise.all([host.typeAtSpeed(18), guest.typeAtSpeed(10)]);
    await waitFor(() => !!host.results && !!guest.results, 10000, 'results');

    const rows = host.results!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Asha');
    expect(rows[0].position).toBe(1);
    expect(rows[1].position).toBe(2);
    expect(rows[0].finished && rows[1].finished).toBe(true);
    expect(rows[0].finishMs!).toBeLessThan(rows[1].finishMs!);
    // Server-calculated WPM: 60 chars / 5 = 12 words in ~3.3s => roughly 200+ WPM is impossible, so check sanity bounds.
    expect(rows[0].wpm).toBeGreaterThan(100);
    expect(rows[0].wpm).toBeLessThan(260);
    expect(rows[0].accuracy).toBeGreaterThan(90);
    expect(rows[0].score.total).toBeGreaterThan(rows[1].score.total);
    expect(rows.every((r) => r.score.total >= 0)).toBe(true);
    expect(guest.results!.rows.map((r) => r.name)).toEqual(rows.map((r) => r.name));
    expect(host.room!.status).toBe('finished');
  }, 30000);

  it('supports rematch and host transfer', async () => {
    const host = await client('Asha');
    const guest = await client('Ben');
    const { room } = await host.create('easy');
    await guest.join(room.code);
    await guest.call('room:ready', { ready: true });
    await host.call('room:start');
    await waitFor(() => host.room?.status === 'racing', 4000, 'racing');
    await Promise.all([host.typeAtSpeed(20), guest.typeAtSpeed(20)]);
    await waitFor(() => !!host.results, 8000, 'results');

    expect((await guest.call('room:rematch')).ok).toBe(true);
    await waitFor(() => host.room?.status === 'lobby', 3000, 'lobby again');
    expect(host.room!.players.every((p) => !p.finished && p.correct === 0)).toBe(true);
    expect(host.room!.text).toBeNull();

    // Host leaves: guest becomes host.
    await host.call('room:leave');
    await waitFor(() => guest.room?.players.length === 1, 3000, 'host left');
    expect(guest.room!.hostId).toBe(guest.selfId);
  }, 30000);

  it('rejects bad codes, full rooms and late joiners with helpful errors', async () => {
    const a = await client('A');
    const b = await client('B');
    const c = await client('C');
    const d = await client('D');
    const e = await client('E');

    const missing = await b.join('ZZZZZ');
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/not found/i);
    expect((await b.join('ab')).ok).toBe(false);
    expect((await b.join('00000')).ok).toBe(false);

    const { room } = await a.create('easy');
    for (const p of [b, c, d]) expect((await p.join(room.code)).ok).toBe(true);
    const full = await e.join(room.code);
    expect(full.ok).toBe(false);
    expect(full.error).toMatch(/full/i);

    for (const p of [b, c, d]) await p.call('room:ready', { ready: true });
    await a.call('room:start');
    await waitFor(() => a.room?.status === 'countdown', 3000, 'countdown');
    // Someone leaves so there is space, but the race has started.
    await d.call('room:leave');
    const late = await e.join(room.code);
    expect(late.ok).toBe(false);
    expect(late.error).toMatch(/already started/i);
  }, 20000);

  it('needs at least two players before the host can start', async () => {
    const host = await client('Solo');
    await host.create('easy');
    const res = await host.call('room:start');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/at least 2/i);
  });
});

describe('malformed input and abuse', () => {
  it('survives garbage payloads and keeps serving', async () => {
    const c = await client('Mallory');
    const garbage: unknown[] = [
      undefined,
      null,
      42,
      'string',
      [],
      {},
      { name: 'ok', car: 'tank', difficulty: 'easy', token: 'a'.repeat(20) },
      { name: 'ok', car: 'rocket', difficulty: 'nightmare', token: 'a'.repeat(20) },
      { name: 'ok', car: 'rocket', difficulty: 'easy', token: 'short' },
      { name: { $ne: 1 }, car: 'rocket', difficulty: 'easy', token: 'a'.repeat(20) },
      { __proto__: { admin: true }, name: 'ok' },
    ];
    for (const payload of garbage) {
      const res = await c.call('room:create', payload);
      expect(res.ok).toBe(false);
      expect(typeof res.error).toBe('string');
      await sleep(40); // stay under the rate limit
    }
    // Garbage progress / events outside a room must be ignored silently.
    for (const payload of [null, 1, 'x', { correct: -1, errors: 0 }, { correct: 1.5, errors: 0 }, { correct: 'a' }]) {
      c.socket.emit('race:progress', payload);
    }
    c.socket.emit('definitely:not:an:event', { hello: 'world' });
    const health = await fetch(`${url}/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    // Absurdly long names are truncated rather than stored as-is.
    const long = await c.call('room:create', {
      name: 'x'.repeat(5000),
      car: 'rocket',
      difficulty: 'easy',
      token: 'a'.repeat(20),
    });
    expect(long.ok).toBe(true);
    expect(long.room.players[0].name).toHaveLength(14);
    // Still functional afterwards.
    expect((await c.create('easy')).ok).toBe(true);
  }, 20000);

  it('sanitises nicknames', async () => {
    const c = await client('x');
    c.name = '  <b>Hax0r</b>\u0000 "quote" \n\t  ';
    const res = await c.create('easy');
    expect(res.ok).toBe(true);
    const name: string = res.room.players[0].name;
    expect(name).not.toMatch(/[<>"\u0000\n\t]/);
    expect(name.length).toBeLessThanOrEqual(14);
    expect(name.length).toBeGreaterThan(0);
    c.name = '   ';
    expect((await c.create('easy')).ok).toBe(false);
  });

  it('rate-limits floods and eventually drops the abuser', async () => {
    const c = await client('Flooder');
    let limited = 0;
    const results = await Promise.all(
      Array.from({ length: 80 }, () => c.call('time:sync')),
    );
    for (const r of results) if (!r.ok && /too fast/i.test(r.error)) limited++;
    expect(limited).toBeGreaterThan(20);
    // Sustained flooding gets the connection closed.
    for (let i = 0; i < 600; i++) c.socket.emit('time:sync', () => undefined);
    await waitFor(() => c.disconnected, 4000, 'flooder disconnected');
  }, 15000);

  it('disqualifies impossible typing speeds and does not trust client results', async () => {
    const honest = await client('Honest');
    const cheater = await client('Cheater');
    const { room } = await honest.create('easy');
    await cheater.join(room.code);
    await cheater.call('room:ready', { ready: true });
    await honest.call('room:start');
    await waitFor(() => honest.room?.status === 'racing', 4000, 'racing');

    // Cheater claims the whole text instantly, three times.
    const length = cheater.room!.text!.length;
    for (let i = 0; i < 3; i++) {
      cheater.socket.emit('race:progress', { correct: length, errors: i });
      await sleep(30);
    }
    await waitFor(() => cheater.disqualified !== null, 3000, 'disqualification');
    expect(cheater.disqualified).toMatch(/impossible/i);

    await honest.typeAtSpeed(15);
    await waitFor(() => !!honest.results, 8000, 'results');
    const rows = honest.results!.rows;
    expect(rows[0].name).toBe('Honest');
    expect(rows[0].finished).toBe(true);
    const bad = rows.find((r) => r.name === 'Cheater')!;
    expect(bad.disqualified).toBe(true);
    expect(bad.finished).toBe(false);
    expect(bad.score.total).toBe(0);
    expect(bad.position).toBe(2);
  }, 20000);

  it('ignores progress sent before the start and going backwards', async () => {
    const a = await client('A');
    const b = await client('B');
    const { room } = await a.create('easy');
    await b.join(room.code);
    await b.call('room:ready', { ready: true });
    await a.call('room:start');
    await waitFor(() => a.room?.status === 'countdown', 3000, 'countdown');
    a.socket.emit('race:progress', { correct: 5, errors: 0 }); // still counting down
    await sleep(100);
    expect(b.room!.players.find((p) => p.name === 'A')!.correct).toBe(0);

    await waitFor(() => a.room?.status === 'racing', 3000, 'racing');
    await sleep(900);
    a.socket.emit('race:progress', { correct: 8, errors: 1 });
    await waitFor(() => b.room!.players.find((p) => p.name === 'A')!.correct === 8, 3000, 'progress broadcast');
    a.socket.emit('race:progress', { correct: 3, errors: 0 }); // rewind
    await sleep(150);
    expect(b.room!.players.find((p) => p.name === 'A')!.correct).toBe(8);
  }, 15000);
});

describe('public matchmaking', () => {
  it('pairs two searchers into one room and starts automatically', async () => {
    const a = await client('Ann');
    const b = await client('Bob');
    const first = await a.find('medium');
    expect(first.ok).toBe(true);
    expect(first.room.type).toBe('public');
    expect(first.room.players).toHaveLength(1);

    const second = await b.find('medium');
    expect(second.room.code).toBe(first.room.code);
    await waitFor(() => a.room?.players.length === 2, 3000, 'pair');
    expect(a.room!.autoStartAt).not.toBeNull();

    await waitFor(() => a.room?.status === 'countdown' && b.room?.status === 'countdown', 5000, 'auto countdown');
    await waitFor(() => a.room?.status === 'racing', 3000, 'racing');
    await Promise.all([a.typeAtSpeed(16), b.typeAtSpeed(13)]);
    await waitFor(() => !!a.results && !!b.results, 25000, 'results');
    expect(a.results!.rows[0].name).toBe('Ann');
    expect(a.results!.difficulty).toBe('medium');

    // Public results feed the online hall of fame.
    const board = await fetch(`${url}/api/leaderboard`).then((r) => r.json());
    expect(board.entries.length).toBeGreaterThanOrEqual(2);
    expect(board.entries[0].score).toBeGreaterThanOrEqual(board.entries[1].score);
    // Rematch is not available for public rooms.
    expect((await a.call('room:rematch')).ok).toBe(false);
  }, 40000);

  it('keeps different difficulties apart and supports several concurrent races', async () => {
    const names = ['A1', 'A2', 'B1', 'B2'];
    const [a1, a2, b1, b2] = await Promise.all(names.map((n) => client(n)));
    const r1 = await a1.find('easy');
    const r2 = await b1.find('hard');
    await a2.find('easy');
    await b2.find('hard');
    expect(r1.room.code).not.toBe(r2.room.code);
    await waitFor(() => a1.room?.players.length === 2 && b1.room?.players.length === 2, 3000, 'both rooms paired');
    expect(a1.room!.code).toBe(a2.room!.code);
    expect(b1.room!.code).toBe(b2.room!.code);
    await waitFor(() => a1.room?.status === 'racing' && b1.room?.status === 'racing', 6000, 'two races');
    const health = await fetch(`${url}/health`).then((r) => r.json());
    expect(health.racing).toBe(2);
    // Texts are independent per room.
    expect(a1.room!.text).not.toBe(b1.room!.text);
  }, 20000);

  it('lets a searcher cancel and tells a lone player when nobody is around', async () => {
    const a = await client('Lonely');
    await a.find('easy');
    await waitFor(() => a.noOpponent, 3000, 'no-opponent notice');

    expect((await a.call('match:cancel')).ok).toBe(true);
    const b = await client('Newcomer');
    const res = await b.find('easy');
    expect(res.room.players).toHaveLength(1); // old room was removed, fresh one created
    const health = await fetch(`${url}/health`).then((r) => r.json());
    expect(health.rooms).toBe(1);
  }, 15000);

  it('fills a public room up to four players and starts at once', async () => {
    const four = await Promise.all(['P1', 'P2', 'P3', 'P4'].map((n) => client(n)));
    for (const c of four) await c.find('easy');
    await waitFor(() => four.every((c) => c.room?.status === 'countdown'), 3000, 'immediate countdown');
    expect(new Set(four.map((c) => c.room!.code)).size).toBe(1);
    const fifth = await client('P5');
    const res = await fifth.find('easy');
    expect(res.room.code).not.toBe(four[0].room!.code); // new room, old one is full and started
  }, 15000);

  it('removes a lone player after the match timeout', async () => {
    await server.close();
    const started = await startServer({ matchTimeoutMs: 800, noOpponentMs: 300 });
    server = started.server;
    url = started.url;
    const a = await client('Patient');
    await a.find('easy');
    await waitFor(() => a.timedOut, 3000, 'timeout');
    const health = await fetch(`${url}/health`).then((r) => r.json());
    expect(health.rooms).toBe(0);
  }, 10000);
});

describe('disconnects and reconnection', () => {
  it('lets a lobby player resume with the same identity', async () => {
    const host = await client('Asha');
    const guest = await client('Ben');
    const { room } = await host.create('easy');
    await guest.join(room.code);
    const originalId = guest.selfId;
    await waitFor(() => host.room?.players.length === 2, 3000, 'joined');

    guest.socket.close();
    await waitFor(() => host.room?.players.find((p) => p.name === 'Ben')?.connected === false, 3000, 'marked offline');
    await guest.reconnect();
    const resumed = await guest.resume(room.code);
    expect(resumed.ok).toBe(true);
    expect(resumed.selfId).toBe(originalId);
    await waitFor(() => host.room?.players.find((p) => p.name === 'Ben')?.connected === true, 3000, 'back online');
    await sleep(700); // longer than the lobby grace period: must still be there
    expect(host.room!.players).toHaveLength(2);
  }, 15000);

  it('removes a lobby player who never comes back', async () => {
    const host = await client('Asha');
    const guest = await client('Ben');
    const { room } = await host.create('easy');
    await guest.join(room.code);
    guest.socket.close();
    await waitFor(() => host.room?.players.length === 1, 4000, 'grace expiry');
  }, 10000);

  it('rejects resume for unknown sessions', async () => {
    const c = await client('Ghost');
    const res = await c.resume('ABCDE');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no longer available/i);
  });

  it('keeps a racer who reconnects mid-race and lets them finish', async () => {
    const a = await client('Anna');
    const b = await client('Ben');
    const { room } = await a.create('easy');
    await b.join(room.code);
    await b.call('room:ready', { ready: true });
    await a.call('room:start');
    await waitFor(() => a.room?.status === 'racing', 4000, 'racing');

    await sleep(500);
    b.socket.emit('race:progress', { correct: 5, errors: 0 });
    await sleep(100);
    b.socket.close();
    await waitFor(() => a.room?.players.find((p) => p.name === 'Ben')?.connected === false, 3000, 'offline');
    await b.reconnect();
    const resumed = await b.resume(room.code);
    expect(resumed.ok).toBe(true);
    expect(resumed.room.status).toBe('racing');
    expect(resumed.room.text).toBe(a.room!.text);

    await Promise.all([a.typeAtSpeed(20), b.typeAtSpeed(14)]);
    await waitFor(() => !!a.results && !!b.results, 10000, 'results');
    expect(a.results!.rows.every((r) => r.finished)).toBe(true);
  }, 25000);

  it('marks a racer who leaves or vanishes as did-not-finish and still ends the race', async () => {
    const a = await client('Anna');
    const b = await client('Ben');
    const c = await client('Cara');
    const { room } = await a.create('easy');
    await b.join(room.code);
    await c.join(room.code);
    await b.call('room:ready', { ready: true });
    await c.call('room:ready', { ready: true });
    await a.call('room:start');
    await waitFor(() => a.room?.status === 'racing', 4000, 'racing');

    await sleep(600);
    b.socket.emit('race:progress', { correct: 6, errors: 0 });
    await sleep(80);
    await b.call('room:leave'); // explicit leave
    c.socket.close(); // silent drop, never returns
    await a.typeAtSpeed(20);
    await waitFor(() => !!a.results, 10000, 'results after others gone');

    const rows = a.results!.rows;
    expect(rows[0].name).toBe('Anna');
    const ben = rows.find((r) => r.name === 'Ben')!;
    const cara = rows.find((r) => r.name === 'Cara')!;
    expect(ben.finished).toBe(false);
    expect(ben.left).toBe(true);
    expect(ben.progressPct).toBeGreaterThan(0);
    expect(ben.score.total).toBeLessThanOrEqual(20);
    expect(cara.finished).toBe(false);
    expect(rows.every((r) => r.score.total >= 0)).toBe(true);
    expect(ben.position).toBeLessThan(cara.position); // Ben typed some, Cara typed nothing
  }, 25000);

  it('kicks the old tab when the same session resumes elsewhere', async () => {
    const host = await client('Asha');
    const { room } = await host.create('easy');
    const second = new TestClient(url, 'Asha');
    second.token = host.token;
    clients.push(second);
    await second.connect();
    const res = await second.resume(room.code);
    expect(res.ok).toBe(true);
    await waitFor(() => host.notices.length > 0, 3000, 'notice');
    expect(host.notices[0]).toMatch(/somewhere else/i);
  });
});

describe('time sync and origins', () => {
  it('answers time sync with the server clock', async () => {
    const c = await client('Clock');
    const before = Date.now();
    const res = await c.call('time:sync');
    expect(res.ok).toBe(true);
    expect(Math.abs(res.serverNow - before)).toBeLessThan(1000);
  });

  it('blocks browser origins that are not allowed in production-style config', async () => {
    await server.close();
    const started = await startServer({ origins: ['https://typerush.example'], allowLocalNetworkOrigins: false });
    server = started.server;
    url = started.url;

    const bad = new TestClient(url, 'Evil', 'wave', { Origin: 'https://evil.example' });
    clients.push(bad);
    await expect(bad.connect()).rejects.toBeTruthy();

    const good = await client('Good', { Origin: 'https://typerush.example' });
    expect((await good.create('easy')).ok).toBe(true);

    const res = await fetch(`${url}/health`, { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
