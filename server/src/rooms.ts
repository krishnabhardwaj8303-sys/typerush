import { randomBytes, randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  MULTIPLAYER_CHARS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  calculateScore,
  computeAccuracy,
  computeWpm,
  generateText,
  randomSeed,
  type CarId,
  type ClientToServerEvents,
  type Difficulty,
  type JoinedInfo,
  type PublicPlayer,
  type RaceResults,
  type ResultRow,
  type RoomSnapshot,
  type RoomStatus,
  type RoomType,
  type ServerToClientEvents,
} from '@typerush/shared';
import type { ServerConfig } from './config';
import type { Leaderboard } from './leaderboard';
import { ValidationError, parseProgress } from './validation';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Player {
  id: string;
  token: string;
  socketId: string | null;
  name: string;
  car: CarId;
  ready: boolean;
  connected: boolean;
  left: boolean;
  disqualified: boolean;
  strikes: number;
  correct: number;
  errors: number;
  finished: boolean;
  finishMs: number | null;
  position: number | null;
  graceTimer: NodeJS.Timeout | null;
}

interface Timers {
  start: NodeJS.Timeout | null;
  tick: NodeJS.Timeout | null;
  raceMax: NodeJS.Timeout | null;
  finishGrace: NodeJS.Timeout | null;
  fill: NodeJS.Timeout | null;
  noOpponent: NodeJS.Timeout | null;
  matchTimeout: NodeJS.Timeout | null;
}

interface Room {
  code: string;
  type: RoomType;
  difficulty: Difficulty;
  status: RoomStatus;
  hostId: string;
  players: Player[];
  text: string | null;
  startAt: number | null;
  autoStartAt: number | null;
  endedAt: number | null;
  finishCount: number;
  dirty: boolean;
  lastActivity: number;
  results: RaceResults | null;
  timers: Timers;
}

interface Membership {
  code: string;
  playerId: string;
}

const emptyTimers = (): Timers => ({
  start: null,
  tick: null,
  raceMax: null,
  finishGrace: null,
  fill: null,
  noOpponent: null,
  matchTimeout: null,
});

function clear(timer: NodeJS.Timeout | null): null {
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  return null;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private members = new Map<string, Membership>();
  private sweeper: NodeJS.Timeout;

  constructor(
    private io: IoServer,
    private config: ServerConfig,
    private leaderboard: Leaderboard,
  ) {
    this.sweeper = setInterval(() => this.sweep(), config.sweepMs);
    this.sweeper.unref?.();
  }

  // ------------------------------------------------------------------ public API

  stats() {
    let players = 0;
    let racing = 0;
    for (const room of this.rooms.values()) {
      players += room.players.filter((p) => p.connected && !p.left).length;
      if (room.status === 'racing') racing++;
    }
    return { rooms: this.rooms.size, players, racing };
  }

  createPrivate(
    socket: IoSocket,
    input: { name: string; car: CarId; difficulty: Difficulty; token: string },
  ): JoinedInfo {
    this.leave(socket);
    if (this.rooms.size >= this.config.maxRooms) {
      throw new ValidationError('The server is very busy right now. Please try again in a minute.');
    }
    const room = this.newRoom('private', input.difficulty);
    const player = this.addPlayer(room, socket, input);
    room.hostId = player.id;
    this.emitState(room);
    return this.joinedInfo(room, player);
  }

  joinPrivate(
    socket: IoSocket,
    input: { code: string; name: string; car: CarId; token: string },
  ): JoinedInfo {
    const room = this.rooms.get(input.code);
    if (!room || room.type !== 'private') {
      throw new ValidationError('Room not found. Double-check the code with your friend.');
    }
    // Same person coming back with the same token: treat as a reconnection.
    const existing = room.players.find((p) => p.token === input.token && !p.left);
    if (existing) return this.rebind(socket, room, existing);

    this.leave(socket);
    if (room.status !== 'lobby') {
      throw new ValidationError('That race has already started. Ask your friend to start a rematch.');
    }
    if (this.activePlayers(room).length >= MAX_PLAYERS) {
      throw new ValidationError('That room is full (4 players max).');
    }
    const player = this.addPlayer(room, socket, input);
    this.emitState(room);
    return this.joinedInfo(room, player);
  }

  findMatch(
    socket: IoSocket,
    input: { name: string; car: CarId; difficulty: Difficulty; token: string },
  ): JoinedInfo {
    this.leave(socket);
    const now = Date.now();
    let target: Room | null = null;
    for (const room of this.rooms.values()) {
      if (room.type !== 'public' || room.status !== 'lobby' || room.difficulty !== input.difficulty) continue;
      if (this.activePlayers(room).length >= MAX_PLAYERS) continue;
      // Do not join a room that is about to leave the lobby (scaled for short test windows).
      const cutoff = Math.min(1500, this.config.publicFillMs / 4);
      if (room.autoStartAt !== null && room.autoStartAt - now < cutoff) continue;
      if (!target || this.activePlayers(room).length > this.activePlayers(target).length) target = room;
    }
    if (!target) {
      if (this.rooms.size >= this.config.maxRooms) {
        throw new ValidationError('The server is very busy right now. Please try again in a minute.');
      }
      target = this.newRoom('public', input.difficulty);
    }
    const player = this.addPlayer(target, socket, input);
    player.ready = true;
    if (!target.hostId) target.hostId = player.id;
    this.refreshPublicRoom(target);
    this.emitState(target);
    return this.joinedInfo(target, player);
  }

  cancelMatch(socket: IoSocket): void {
    const ctx = this.lookup(socket);
    if (ctx && ctx.room.type === 'public' && ctx.room.status !== 'racing') this.leave(socket);
  }

  setReady(socket: IoSocket, ready: boolean): void {
    const { room, player } = this.require(socket);
    if (room.status !== 'lobby') throw new ValidationError('The race is already starting.');
    if (room.type === 'public') return;
    player.ready = ready;
    this.emitState(room);
  }

  setDifficulty(socket: IoSocket, difficulty: Difficulty): void {
    const { room, player } = this.require(socket);
    if (room.type !== 'private') throw new ValidationError('Public races pick the difficulty when you search.');
    if (room.hostId !== player.id) throw new ValidationError('Only the host can change the difficulty.');
    if (room.status !== 'lobby') throw new ValidationError('You can only change this in the lobby.');
    room.difficulty = difficulty;
    for (const p of room.players) if (p.id !== room.hostId) p.ready = false;
    this.emitState(room);
  }

  startRace(socket: IoSocket): void {
    const { room, player } = this.require(socket);
    if (room.type !== 'private') throw new ValidationError('Public races start automatically.');
    if (room.hostId !== player.id) throw new ValidationError('Only the host can start the race.');
    if (room.status !== 'lobby') throw new ValidationError('The race is already starting.');
    const present = this.presentPlayers(room);
    if (present.length < MIN_PLAYERS_TO_START) {
      throw new ValidationError('You need at least 2 players. Share the room code with a friend first.');
    }
    const waiting = present.filter((p) => p.id !== room.hostId && !p.ready);
    if (waiting.length > 0) {
      throw new ValidationError(`Waiting for ${waiting.map((p) => p.name).join(', ')} to get ready.`);
    }
    this.beginCountdown(room);
  }

  rematch(socket: IoSocket): void {
    const { room } = this.require(socket);
    if (room.type !== 'private') throw new ValidationError('Use Find Match to join a new public race.');
    if (room.status !== 'finished') return; // someone already reset it
    room.players = room.players.filter((p) => p.connected && !p.left);
    for (const p of room.players) this.resetPlayer(p);
    if (!room.players.some((p) => p.id === room.hostId) && room.players[0]) room.hostId = room.players[0].id;
    room.status = 'lobby';
    room.text = null;
    room.startAt = null;
    room.endedAt = null;
    room.finishCount = 0;
    room.results = null;
    this.emitState(room);
  }

  leave(socket: IoSocket): void {
    const ctx = this.lookup(socket);
    if (!ctx) return;
    this.members.delete(socket.id);
    socket.leave(ctx.room.code);
    this.removePlayer(ctx.room, ctx.player);
  }

  handleDisconnect(socket: IoSocket): void {
    const ctx = this.lookup(socket);
    if (!ctx) return;
    const { room, player } = ctx;
    this.members.delete(socket.id);
    player.connected = false;
    player.socketId = null;
    player.graceTimer = clear(player.graceTimer);

    if (room.type === 'public' && room.status === 'lobby') {
      // Nobody is waiting for a public-queue player who vanished.
      this.removePlayer(room, player);
      return;
    }

    const graceMs = room.status === 'racing' ? this.config.raceGraceMs : this.config.lobbyGraceMs;
    player.graceTimer = setTimeout(() => {
      player.graceTimer = null;
      if (!player.connected) this.removePlayer(room, player);
    }, graceMs);
    player.graceTimer.unref?.();
    this.emitState(room);
  }

  resume(socket: IoSocket, input: { token: string; code: string }): JoinedInfo {
    const room = this.rooms.get(input.code);
    const player = room?.players.find((p) => p.token === input.token && !p.left);
    if (!room || !player) {
      throw new ValidationError('Your previous game is no longer available.');
    }
    return this.rebind(socket, room, player);
  }

  handleProgress(socket: IoSocket, raw: unknown): void {
    const ctx = this.lookup(socket);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'racing' || !room.text || room.startAt === null) return;
    if (player.finished || player.left || player.disqualified) return;

    const parsed = parseProgress(raw);
    if (!parsed) return;
    // Stale or duplicate update: ignore without penalty.
    if (parsed.correct < player.correct || parsed.errors < player.errors) return;
    if (parsed.correct === player.correct && parsed.errors === player.errors) return;

    const now = Date.now();
    const elapsedMs = Math.max(0, now - room.startAt);
    const allowed = Math.floor((elapsedMs / 1000) * this.config.maxCharsPerSecond) + this.config.burstChars;
    const length = room.text.length;

    if (parsed.correct > length || parsed.correct + parsed.errors > allowed) {
      this.strike(socket, room, player);
      return;
    }

    player.correct = parsed.correct;
    player.errors = parsed.errors;
    room.dirty = true;
    room.lastActivity = now;

    if (player.correct >= length) {
      player.finished = true;
      player.finishMs = Math.max(1, elapsedMs);
      room.finishCount++;
      player.position = room.finishCount;
      if (room.finishCount === 1 && !room.timers.finishGrace) {
        room.timers.finishGrace = setTimeout(() => this.endRace(room), this.config.finishGraceMs);
        room.timers.finishGrace.unref?.();
      }
      room.dirty = false;
      this.emitState(room);
      this.checkRaceEnd(room);
    }
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) this.disposeRoom(room);
    this.rooms.clear();
    this.members.clear();
  }

  // ------------------------------------------------------------------ internals

  private newRoom(type: RoomType, difficulty: Difficulty): Room {
    let code = '';
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      type,
      difficulty,
      status: 'lobby',
      hostId: '',
      players: [],
      text: null,
      startAt: null,
      autoStartAt: null,
      endedAt: null,
      finishCount: 0,
      dirty: false,
      lastActivity: Date.now(),
      results: null,
      timers: emptyTimers(),
    };
    this.rooms.set(code, room);
    return room;
  }

  private addPlayer(
    room: Room,
    socket: IoSocket,
    input: { name: string; car: CarId; token: string },
  ): Player {
    const player: Player = {
      id: randomBytes(4).toString('hex'),
      token: input.token,
      socketId: socket.id,
      name: input.name,
      car: input.car,
      ready: false,
      connected: true,
      left: false,
      disqualified: false,
      strikes: 0,
      correct: 0,
      errors: 0,
      finished: false,
      finishMs: null,
      position: null,
      graceTimer: null,
    };
    room.players.push(player);
    socket.join(room.code);
    this.members.set(socket.id, { code: room.code, playerId: player.id });
    return player;
  }

  private rebind(socket: IoSocket, room: Room, player: Player): JoinedInfo {
    if (player.socketId && player.socketId !== socket.id) {
      const old = this.io.sockets.sockets.get(player.socketId);
      this.members.delete(player.socketId);
      if (old) {
        old.leave(room.code);
        old.emit('server:notice', { message: 'You opened TypeRush somewhere else, so this tab was disconnected from the room.' });
      }
    }
    // The socket might currently belong to a different room.
    const current = this.members.get(socket.id);
    if (current && current.code !== room.code) this.leave(socket);

    player.graceTimer = clear(player.graceTimer);
    player.socketId = socket.id;
    player.connected = true;
    socket.join(room.code);
    this.members.set(socket.id, { code: room.code, playerId: player.id });
    this.emitState(room);
    return this.joinedInfo(room, player);
  }

  private lookup(socket: IoSocket): { room: Room; player: Player } | null {
    const membership = this.members.get(socket.id);
    if (!membership) return null;
    const room = this.rooms.get(membership.code);
    const player = room?.players.find((p) => p.id === membership.playerId);
    if (!room || !player) {
      this.members.delete(socket.id);
      return null;
    }
    return { room, player };
  }

  private require(socket: IoSocket): { room: Room; player: Player } {
    const ctx = this.lookup(socket);
    if (!ctx) throw new ValidationError('You are not in a room.');
    return ctx;
  }

  /** Players who are still part of the room (not left). */
  private activePlayers(room: Room): Player[] {
    return room.players.filter((p) => !p.left);
  }

  /** Players who are actually here right now. */
  private presentPlayers(room: Room): Player[] {
    return room.players.filter((p) => !p.left && p.connected);
  }

  private resetPlayer(p: Player): void {
    p.ready = false;
    p.correct = 0;
    p.errors = 0;
    p.strikes = 0;
    p.finished = false;
    p.finishMs = null;
    p.position = null;
    p.disqualified = false;
  }

  private snapshot(room: Room): RoomSnapshot {
    const players: PublicPlayer[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      car: p.car,
      ready: p.id === room.hostId || room.type === 'public' ? true : p.ready,
      connected: p.connected,
      host: p.id === room.hostId,
      correct: p.correct,
      errors: p.errors,
      finished: p.finished,
      finishMs: p.finishMs,
      position: p.position,
      left: p.left,
      disqualified: p.disqualified,
    }));
    return {
      code: room.code,
      type: room.type,
      difficulty: room.difficulty,
      status: room.status,
      hostId: room.hostId,
      text: room.status === 'lobby' ? null : room.text,
      textLength: room.text?.length ?? MULTIPLAYER_CHARS[room.difficulty],
      startAt: room.startAt,
      autoStartAt: room.autoStartAt,
      serverNow: Date.now(),
      minPlayers: MIN_PLAYERS_TO_START,
      maxPlayers: MAX_PLAYERS,
      players,
    };
  }

  private joinedInfo(room: Room, player: Player): JoinedInfo {
    return { selfId: player.id, room: this.snapshot(room), results: room.status === 'finished' ? room.results : null };
  }

  private emitState(room: Room): void {
    room.lastActivity = Date.now();
    room.dirty = false;
    this.io.to(room.code).emit('room:state', this.snapshot(room));
  }

  // ---- public matchmaking helpers

  /** Keeps the fill / "no opponent" timers consistent with who is in the room. */
  private refreshPublicRoom(room: Room): void {
    if (room.type !== 'public' || room.status !== 'lobby') return;
    const present = this.presentPlayers(room).length;

    if (present >= MAX_PLAYERS) {
      this.beginCountdown(room);
      return;
    }

    if (present >= MIN_PLAYERS_TO_START) {
      room.timers.noOpponent = clear(room.timers.noOpponent);
      room.timers.matchTimeout = clear(room.timers.matchTimeout);
      if (room.autoStartAt === null) {
        room.autoStartAt = Date.now() + this.config.publicFillMs;
        room.timers.fill = setTimeout(() => {
          room.timers.fill = null;
          if (room.status === 'lobby' && this.presentPlayers(room).length >= MIN_PLAYERS_TO_START) {
            this.beginCountdown(room);
          }
        }, this.config.publicFillMs);
        room.timers.fill.unref?.();
      }
      return;
    }

    // Fewer than two people: stop any auto-start and (re)arm the "alone" timers.
    room.autoStartAt = null;
    room.timers.fill = clear(room.timers.fill);
    if (present === 1 && !room.timers.matchTimeout) {
      const waitStart = Date.now();
      room.timers.noOpponent = setTimeout(() => {
        room.timers.noOpponent = null;
        this.io.to(room.code).emit('match:no-opponent', { waitedMs: Date.now() - waitStart });
      }, this.config.noOpponentMs);
      room.timers.noOpponent.unref?.();
      room.timers.matchTimeout = setTimeout(() => {
        room.timers.matchTimeout = null;
        if (room.status !== 'lobby') return;
        this.io.to(room.code).emit('match:timeout');
        for (const p of [...room.players]) {
          const s = p.socketId ? this.io.sockets.sockets.get(p.socketId) : undefined;
          if (s) this.leave(s);
          else this.removePlayer(room, p);
        }
      }, this.config.matchTimeoutMs);
      room.timers.matchTimeout.unref?.();
    }
  }

  // ---- race lifecycle

  private beginCountdown(room: Room): void {
    room.timers.fill = clear(room.timers.fill);
    room.timers.noOpponent = clear(room.timers.noOpponent);
    room.timers.matchTimeout = clear(room.timers.matchTimeout);
    room.autoStartAt = null;
    // Drop anyone who is gone so they cannot hold up the race.
    room.players = room.players.filter((p) => !p.left && p.connected);
    for (const p of room.players) this.resetPlayer(p);
    if (!room.players.some((p) => p.id === room.hostId) && room.players[0]) room.hostId = room.players[0].id;

    room.text = generateText(room.difficulty, MULTIPLAYER_CHARS[room.difficulty], randomSeed(), 3);
    room.status = 'countdown';
    room.startAt = Date.now() + this.config.countdownMs;
    room.finishCount = 0;
    room.results = null;
    room.endedAt = null;
    room.timers.start = setTimeout(() => this.startRacing(room), this.config.countdownMs);
    room.timers.start.unref?.();
    this.emitState(room);
  }

  private startRacing(room: Room): void {
    room.timers.start = null;
    if (room.status !== 'countdown') return;
    room.status = 'racing';
    room.timers.tick = setInterval(() => {
      if (room.dirty && room.status === 'racing') this.emitState(room);
    }, this.config.tickMs);
    room.timers.tick.unref?.();
    room.timers.raceMax = setTimeout(() => this.endRace(room), this.config.raceMaxMs);
    room.timers.raceMax.unref?.();
    this.emitState(room);
    this.checkRaceEnd(room);
  }

  private strike(socket: IoSocket, room: Room, player: Player): void {
    player.strikes++;
    if (player.strikes < this.config.maxStrikes) return;
    player.disqualified = true;
    socket.emit('race:disqualified', {
      reason: 'Your typing speed looked impossible for a human, so you were disqualified from this race.',
    });
    this.emitState(room);
    this.checkRaceEnd(room);
  }

  private checkRaceEnd(room: Room): void {
    if (room.status !== 'racing') return;
    const stillRacing = room.players.some((p) => !p.finished && !p.left && !p.disqualified);
    if (!stillRacing) this.endRace(room);
  }

  private endRace(room: Room): void {
    if (room.status !== 'racing' || !room.text || room.startAt === null) return;
    room.timers.tick = clear(room.timers.tick);
    room.timers.raceMax = clear(room.timers.raceMax);
    room.timers.finishGrace = clear(room.timers.finishGrace);
    room.endedAt = Date.now();
    room.status = 'finished';
    room.results = this.computeResults(room);
    this.io.to(room.code).emit('race:results', room.results);
    this.emitState(room);

    if (room.type === 'public') {
      for (const row of room.results.rows) {
        if (row.finished && !row.disqualified) {
          this.leaderboard.add({
            name: row.name,
            wpm: row.wpm,
            accuracy: row.accuracy,
            score: row.score.total,
            difficulty: room.difficulty,
            at: Date.now(),
          });
        }
      }
    }
  }

  private computeResults(room: Room): RaceResults {
    const length = room.text?.length ?? 0;
    const endElapsed = Math.max(1, (room.endedAt ?? Date.now()) - (room.startAt ?? Date.now()));

    const ranked = [...room.players].sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return (a.finishMs ?? 0) - (b.finishMs ?? 0);
      return b.correct - a.correct || a.errors - b.errors;
    });

    const rows: ResultRow[] = ranked.map((p, index) => {
      const position = index + 1;
      const wpm = p.finished ? computeWpm(length, p.finishMs ?? endElapsed) : computeWpm(p.correct, endElapsed);
      const accuracy = computeAccuracy(p.correct, p.errors);
      const progress = length > 0 ? p.correct / length : 0;
      return {
        playerId: p.id,
        name: p.name,
        car: p.car,
        position,
        finished: p.finished,
        finishMs: p.finishMs,
        wpm,
        accuracy,
        progressPct: Math.round(progress * 1000) / 10,
        disqualified: p.disqualified,
        left: p.left,
        isBot: false,
        score: calculateScore({
          position,
          totalRacers: ranked.length,
          wpm,
          accuracy,
          finished: p.finished,
          progress,
          difficulty: room.difficulty,
          disqualified: p.disqualified,
        }),
      };
    });

    return { roomCode: room.code, difficulty: room.difficulty, textLength: length, rows };
  }

  // ---- leaving / cleanup

  private removePlayer(room: Room, player: Player): void {
    player.graceTimer = clear(player.graceTimer);
    if (player.socketId) {
      this.members.delete(player.socketId);
      this.io.sockets.sockets.get(player.socketId)?.leave(room.code);
    }
    player.connected = false;
    player.socketId = null;

    if (!this.rooms.has(room.code)) return;

    if (room.status === 'racing') {
      player.left = true;
      this.emitState(room);
      this.checkRaceEnd(room);
      return;
    }

    room.players = room.players.filter((p) => p !== player);

    if (room.players.length === 0) {
      this.deleteRoom(room);
      return;
    }

    if (room.hostId === player.id) {
      const next = room.players.find((p) => p.connected && !p.left) ?? room.players[0];
      if (next) room.hostId = next.id;
    }

    if (room.status === 'countdown' && this.presentPlayers(room).length < MIN_PLAYERS_TO_START) {
      room.timers.start = clear(room.timers.start);
      room.status = 'lobby';
      room.text = null;
      room.startAt = null;
      for (const p of room.players) p.ready = false;
    }

    if (room.type === 'public') {
      if (room.players.length === 0) {
        this.deleteRoom(room);
        return;
      }
      this.refreshPublicRoom(room);
    }
    this.emitState(room);
  }

  private disposeRoom(room: Room): void {
    for (const key of Object.keys(room.timers) as (keyof Timers)[]) room.timers[key] = clear(room.timers[key]);
    for (const p of room.players) p.graceTimer = clear(p.graceTimer);
  }

  private deleteRoom(room: Room): void {
    this.disposeRoom(room);
    this.rooms.delete(room.code);
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const abandoned =
        room.status !== 'racing' && this.presentPlayers(room).length === 0 && now - room.lastActivity > 60000;
      if (room.players.length === 0 || abandoned) {
        this.deleteRoom(room);
        continue;
      }
      const idleLimit = room.status === 'finished' ? this.config.finishedRoomIdleMs : this.config.roomIdleMs;
      if (room.status !== 'racing' && now - room.lastActivity > idleLimit) {
        this.io.to(room.code).emit('server:notice', { message: 'This room was closed because it was inactive.' });
        for (const p of room.players) {
          if (p.socketId) {
            this.members.delete(p.socketId);
            this.io.sockets.sockets.get(p.socketId)?.leave(room.code);
          }
        }
        this.deleteRoom(room);
      }
    }
  }
}
