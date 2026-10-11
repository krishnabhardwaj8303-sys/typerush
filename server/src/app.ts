import { createServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@typerush/shared';
import { mountAccountRoutes } from './accounts';
import { mountCommunityRoutes } from './community';
import { isOriginAllowed, type ServerConfig } from './config';
import { Leaderboard } from './leaderboard';
import { TokenBucket, WindowCounter } from './rateLimit';
import { RoomManager, type IoServer, type IoSocket } from './rooms';
import { MemoryStore, type Store } from './store';
import {
  ValidationError,
  parseCreate,
  parseFind,
  parseJoin,
  parseReady,
  parseResume,
  parseSettings,
} from './validation';

export interface RunningServer {
  httpServer: HttpServer;
  io: IoServer;
  manager: RoomManager;
  leaderboard: Leaderboard;
  store: Store;
  config: ServerConfig;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

type AnyAck = ((response: never) => void) | undefined;

/** Calls an ack callback only if the client actually supplied a function. */
function reply(ack: unknown, response: { ok: true } | { ok: true; [k: string]: unknown } | { ok: false; error: string }) {
  if (typeof ack === 'function') (ack as (r: unknown) => void)(response);
}

function clientIp(socket: IoSocket, config: ServerConfig): string {
  if (config.trustProxy) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address || 'unknown';
}

export function createTypeRushServer(config: ServerConfig, deps: { store?: Store } = {}): RunningServer {
  const store = deps.store ?? new MemoryStore();
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      callback(null, isOriginAllowed(origin, config));
    },
  };
  app.use(cors(corsOptions));

  const httpLimiter = new WindowCounter(120, 60_000);
  const limiterSweep = setInterval(() => httpLimiter.prune(), 60_000);
  limiterSweep.unref?.();
  app.use((req, res, next) => {
    if (!httpLimiter.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many requests. Slow down a little.' });
      return;
    }
    next();
  });

  const httpServer = createServer(app);
  const io: IoServer = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: corsOptions,
    maxHttpBufferSize: 10_000,
    pingInterval: 10_000,
    pingTimeout: 12_000,
    serveClient: false,
    allowRequest(req, callback) {
      callback(null, isOriginAllowed(req.headers.origin, config));
    },
  });

  const leaderboard = new Leaderboard(config.leaderboardFile);
  const manager = new RoomManager(io, config, leaderboard, store);
  const startedAt = Date.now();

  app.get('/', (_req, res) => {
    res.type('text/plain').send('TypeRush multiplayer server is running. Open the game in your browser to play.');
  });
  // Pinging /health every few minutes (UptimeRobot) keeps the free server awake, and the SELECT 1 inside keeps
  // a free hosted database from being paused for inactivity. A slow or broken database never makes /health fail.
  app.get('/health', async (_req, res) => {
    let db: 'ok' | 'error' | 'none' = 'none';
    if (store.kind === 'postgres') {
      const answered = await Promise.race([store.ping(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))]);
      db = answered ? 'ok' : 'error';
    }
    res.json({ ok: true, name: 'typerush-server', uptimeSec: Math.round((Date.now() - startedAt) / 1000), storage: store.kind, db, ...manager.stats() });
  });
  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: leaderboard.top(25), note: 'Unverified results from public matches. Resets when the server restarts on free hosting.' });
  });
  mountCommunityRoutes(app, { store });
  mountAccountRoutes(app, { store }); // last: it also installs the JSON error handler for /api
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Per-IP socket cap.
  const socketsPerIp = new Map<string, number>();

  io.on('connection', (socket: IoSocket) => {
    const ip = clientIp(socket, config);
    const count = (socketsPerIp.get(ip) ?? 0) + 1;
    if (count > config.maxSocketsPerIp) {
      socket.emit('server:notice', { message: 'Too many connections from your network.' });
      socket.disconnect(true);
      return;
    }
    socketsPerIp.set(ip, count);

    // Generic events: 30 burst, 10/sec sustained. Progress has its own, larger bucket.
    const generalBucket = new TokenBucket(30, 10);
    const progressBucket = new TokenBucket(40, 30);
    let dropped = 0;

    const allow = (bucket: TokenBucket): boolean => {
      if (bucket.take()) return true;
      dropped++;
      if (dropped > 200) socket.disconnect(true); // sustained flooding
      return false;
    };

    /** Wraps a handler: rate limit, validation errors -> ack, unexpected errors -> generic ack. */
    const guard =
      <A extends unknown[]>(handler: (...args: A) => void, ackIndex: number) =>
      (...args: A) => {
        const ack = args[ackIndex] as AnyAck;
        if (!allow(generalBucket)) {
          reply(ack, { ok: false, error: 'You are doing that too fast. Please slow down.' });
          return;
        }
        try {
          handler(...args);
        } catch (error) {
          if (error instanceof ValidationError) {
            reply(ack, { ok: false, error: error.message });
          } else {
            console.error('[server] unexpected error:', error);
            reply(ack, { ok: false, error: 'Something went wrong on the server. Please try again.' });
          }
        }
      };

    socket.on(
      'time:sync',
      guard((ack: Ack<{ serverNow: number }>) => reply(ack, { ok: true, serverNow: Date.now() }), 0),
    );

    socket.on(
      'room:create',
      guard((payload, ack) => reply(ack, { ok: true, ...manager.createPrivate(socket, parseCreate(payload)) }), 1),
    );

    socket.on(
      'room:join',
      guard((payload, ack) => reply(ack, { ok: true, ...manager.joinPrivate(socket, parseJoin(payload)) }), 1),
    );

    socket.on(
      'match:find',
      guard((payload, ack) => reply(ack, { ok: true, ...manager.findMatch(socket, parseFind(payload)) }), 1),
    );

    socket.on(
      'session:resume',
      guard((payload, ack) => reply(ack, { ok: true, ...manager.resume(socket, parseResume(payload)) }), 1),
    );

    socket.on(
      'room:ready',
      guard((payload, ack) => {
        manager.setReady(socket, parseReady(payload));
        reply(ack, { ok: true });
      }, 1),
    );

    socket.on(
      'room:settings',
      guard((payload, ack) => {
        manager.setDifficulty(socket, parseSettings(payload));
        reply(ack, { ok: true });
      }, 1),
    );

    socket.on(
      'room:start',
      guard((ack) => {
        manager.startRace(socket);
        reply(ack, { ok: true });
      }, 0),
    );

    socket.on(
      'room:rematch',
      guard((ack) => {
        manager.rematch(socket);
        reply(ack, { ok: true });
      }, 0),
    );

    socket.on(
      'room:leave',
      guard((ack) => {
        manager.leave(socket);
        reply(ack, { ok: true });
      }, 0),
    );

    socket.on(
      'match:cancel',
      guard((ack) => {
        manager.cancelMatch(socket);
        reply(ack, { ok: true });
      }, 0),
    );

    socket.on('race:progress', (payload) => {
      if (!allow(progressBucket)) return;
      try {
        manager.handleProgress(socket, payload);
      } catch (error) {
        console.error('[server] progress error:', error);
      }
    });

    socket.on('disconnect', () => {
      socketsPerIp.set(ip, Math.max(0, (socketsPerIp.get(ip) ?? 1) - 1));
      if ((socketsPerIp.get(ip) ?? 0) === 0) socketsPerIp.delete(ip);
      manager.handleDisconnect(socket);
    });

    socket.on('error', () => {
      /* swallow transport errors; disconnect handler cleans up */
    });
  });

  return {
    httpServer,
    io,
    manager,
    leaderboard,
    store,
    config,
    listen(port = config.port) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    async close() {
      clearInterval(limiterSweep);
      manager.close();
      leaderboard.close();
      await io.close();
      await store.close().catch(() => undefined);
    },
  };
}
