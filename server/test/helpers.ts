import { io, type Socket } from 'socket.io-client';
import type { CarId, Difficulty, JoinedInfo, RaceResults, RoomSnapshot } from '@typerush/shared';
import { createTypeRushServer, type RunningServer } from '../src/app';
import { loadConfig, type ServerConfig } from '../src/config';

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ...loadConfig({}),
    port: 0,
    countdownMs: 300,
    publicFillMs: 400,
    noOpponentMs: 500,
    matchTimeoutMs: 4000,
    lobbyGraceMs: 500,
    raceGraceMs: 700,
    finishGraceMs: 4000,
    raceMaxMs: 15000,
    tickMs: 30,
    sweepMs: 60000,
    leaderboardFile: null,
    ...overrides,
  };
}

export async function startServer(overrides: Partial<ServerConfig> = {}) {
  const server: RunningServer = createTypeRushServer(testConfig(overrides));
  const port = await server.listen(0);
  return { server, port, url: `http://127.0.0.1:${port}` };
}

let counter = 0;
export function newToken(): string {
  counter++;
  return `token-${Date.now().toString(36)}-${counter}-abcdefghij`;
}

export class TestClient {
  socket!: Socket;
  room: RoomSnapshot | null = null;
  results: RaceResults | null = null;
  selfId = '';
  token = newToken();
  disqualified: string | null = null;
  notices: string[] = [];
  noOpponent = false;
  timedOut = false;
  disconnected = false;
  stateLog: RoomSnapshot[] = [];

  constructor(
    public url: string,
    public name = 'Tester',
    public car: CarId = 'rocket',
    private headers: Record<string, string> = {},
  ) {}

  async connect(): Promise<this> {
    this.socket = io(this.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: this.headers,
    });
    this.wire();
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (e) => reject(e));
    });
    return this;
  }

  private wire() {
    this.disconnected = false;
    this.socket.on('room:state', (r) => {
      this.room = r;
      this.stateLog.push(r);
    });
    this.socket.on('race:results', (r) => (this.results = r));
    this.socket.on('race:disqualified', (d) => (this.disqualified = d.reason));
    this.socket.on('server:notice', (n) => this.notices.push(n.message));
    this.socket.on('match:no-opponent', () => (this.noOpponent = true));
    this.socket.on('match:timeout', () => (this.timedOut = true));
    this.socket.on('disconnect', () => (this.disconnected = true));
  }

  /** Reconnects with a brand-new socket (simulates a dropped connection). */
  async reconnect(): Promise<this> {
    this.socket.removeAllListeners();
    this.socket.close();
    return this.connect();
  }

  /** call('room:start') sends only an ack; call('room:ready', x) sends x (even undefined) then the ack. */
  call<T = any>(event: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve) => {
      this.socket.emit(event, ...args, (res: T) => resolve(res));
    });
  }

  private adopt(res: any): any {
    if (res?.ok) {
      this.selfId = res.selfId;
      this.room = res.room;
      if (res.results) this.results = res.results;
    }
    return res;
  }

  async create(difficulty: Difficulty = 'easy'): Promise<any> {
    return this.adopt(
      await this.call('room:create', { name: this.name, car: this.car, difficulty, token: this.token }),
    );
  }

  async join(code: string): Promise<any> {
    return this.adopt(await this.call('room:join', { code, name: this.name, car: this.car, token: this.token }));
  }

  async find(difficulty: Difficulty = 'easy'): Promise<any> {
    return this.adopt(
      await this.call('match:find', { name: this.name, car: this.car, difficulty, token: this.token }),
    );
  }

  async resume(code: string): Promise<any> {
    return this.adopt(await this.call('session:resume', { token: this.token, code }));
  }

  /** Emits correct/errors progress at a human-plausible speed until the text is complete. */
  async typeAtSpeed(cps: number, errorRate = 0.04): Promise<void> {
    const room = this.room!;
    const length = room.text!.length;
    const startAt = room.startAt!;
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const elapsed = Math.max(0, Date.now() - startAt);
        const correct = Math.min(length, Math.floor((elapsed / 1000) * cps));
        const errors = Math.floor(correct * errorRate);
        this.socket.emit('race:progress', { correct, errors });
        if (correct >= length || this.socket.disconnected) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  }

  close() {
    this.socket.removeAllListeners();
    this.socket.close();
  }
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 8000,
  label = 'condition',
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type { JoinedInfo };
