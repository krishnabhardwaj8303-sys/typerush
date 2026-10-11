import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestClient, startServer } from './helpers';
import type { RunningServer } from '../src/app';

let server: RunningServer;
let url: string;
let clients: TestClient[] = [];

async function client(name: string) {
  const c = new TestClient(url, name, 'wave');
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

describe('cosmetics in rooms', () => {
  it('relays a valid skin and trail to the other player', async () => {
    const host = await client('Asha');
    const guest = await client('Ben');
    const created = await host.call('room:create', {
      name: 'Asha', car: 'wave', skin: 'flames', trail: 'neon', difficulty: 'easy', token: host.token,
    });
    expect(created.ok).toBe(true);
    const joined = await guest.call('room:join', { code: created.room.code, name: 'Ben', car: 'wave', token: guest.token });
    expect(joined.ok).toBe(true);
    const asha = joined.room.players.find((p: any) => p.name === 'Asha');
    const ben = joined.room.players.find((p: any) => p.name === 'Ben');
    expect(asha.skin).toBe('flames');
    expect(asha.trail).toBe('neon');
    // older clients that send nothing get the plain look
    expect(ben.skin).toBe('plain');
    expect(ben.trail).toBe('none');
  });

  it('replaces unknown or hostile values instead of storing them', async () => {
    const c = await client('Cara');
    const res = await c.call('room:create', {
      name: 'Cara', car: 'wave', skin: '<script>', trail: { x: 1 }, difficulty: 'easy', token: c.token,
    });
    expect(res.ok).toBe(true);
    expect(res.room.players[0].skin).toBe('plain');
    expect(res.room.players[0].trail).toBe('none');
  });
});
