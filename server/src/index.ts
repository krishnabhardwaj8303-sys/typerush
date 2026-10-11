import { createTypeRushServer } from './app';
import { loadConfig } from './config';
import { createStore, MemoryStore, type Store } from './store';

const config = loadConfig();

async function start() {
  let store: Store;
  try {
    store = await createStore(config.databaseUrl, config.databaseSsl);
  } catch (error) {
    console.error('[server] could not connect to the database, using memory only:', (error as Error).message);
    store = new MemoryStore();
  }
  const server = createTypeRushServer(config, { store });
  const port = await server.listen();
  return { server, port, store };
}

const running = start();

running
  .then(({ port, store }) => {
    console.log('');
    console.log('  TypeRush multiplayer server is running');
    console.log(`  Local:   http://localhost:${port}`);
    console.log(`  Health:  http://localhost:${port}/health`);
    console.log(
      config.origins.length
        ? `  Allowed web origins: ${config.origins.join(', ')}${config.allowLocalNetworkOrigins ? ' (+ local network)' : ''}`
        : '  Allowed web origins: localhost and local network (set CLIENT_ORIGINS for production)',
    );
    console.log(
      store.kind === 'postgres'
        ? '  Storage: PostgreSQL database (accounts and leaderboards are permanent)'
        : '  Storage: memory only (accounts and boards reset on restart; set DATABASE_URL to keep them)',
    );
    console.log('');
  })
  .catch((error) => {
    console.error('[server] failed to start:', error);
    process.exit(1);
  });

function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  running
    .then(({ server }) => server.close())
    .catch(() => undefined)
    .finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('[server] unhandled rejection:', reason));
