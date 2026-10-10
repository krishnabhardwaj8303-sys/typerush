import { createTypeRushServer } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const server = createTypeRushServer(config);

server.listen().then((port) => {
  console.log('');
  console.log('  TypeRush multiplayer server is running');
  console.log(`  Local:   http://localhost:${port}`);
  console.log(`  Health:  http://localhost:${port}/health`);
  console.log(
    config.origins.length
      ? `  Allowed web origins: ${config.origins.join(', ')}${config.allowLocalNetworkOrigins ? ' (+ local network)' : ''}`
      : '  Allowed web origins: localhost and local network (set CLIENT_ORIGINS for production)',
  );
  console.log('');
});

function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server
    .close()
    .catch(() => undefined)
    .finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('[server] unhandled rejection:', reason));
