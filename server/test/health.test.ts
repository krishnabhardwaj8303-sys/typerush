import { newDb } from 'pg-mem';
import { afterEach, describe, expect, it } from 'vitest';
import { createTypeRushServer, type RunningServer } from '../src/app';
import { MemoryStore, PgStore, type PgLike } from '../src/store';
import { testConfig } from './helpers';

const servers: RunningServer[] = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

async function health(store: MemoryStore | PgStore) {
  const server = createTypeRushServer(testConfig(), { store });
  servers.push(server);
  const port = await server.listen(0);
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  return (await res.json()) as Record<string, unknown>;
}

describe('/health', () => {
  it('reports no database for the memory store', async () => {
    const body = await health(new MemoryStore());
    expect(body).toMatchObject({ ok: true, storage: 'memory', db: 'none' });
  });

  it('pings a Postgres database', async () => {
    const { Pool } = newDb().adapters.createPg();
    const store = new PgStore(new Pool() as unknown as PgLike);
    await store.init();
    expect(await health(store)).toMatchObject({ ok: true, storage: 'postgres', db: 'ok' });
  });

  it('stays ok when the database does not answer', async () => {
    const { Pool } = newDb().adapters.createPg();
    const real = new Pool() as unknown as PgLike;
    const store = new PgStore(real);
    await store.init();
    const broken = new PgStore({ query: async () => { throw new Error('down'); }, end: () => real.end() });
    expect(await store.ping()).toBe(true);
    expect(await broken.ping()).toBe(false);
    expect(await health(broken)).toMatchObject({ ok: true, storage: 'postgres', db: 'error' });
  });
});
