// Types and constants shared by the client and the server.

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'Short, simple words. Perfect for learning the keys.',
  medium: 'Common words and short sentences.',
  hard: 'Longer words, capitals and punctuation.',
  expert: 'Numbers, symbols and complex sentences.',
};

export type CarId = 'rocket' | 'bolt' | 'wave' | 'mint' | 'viper' | 'flare';
export type CarShape = 'sedan' | 'coupe' | 'hatch';

export interface CarDef {
  id: CarId;
  name: string;
  body: string;
  accent: string;
  shape: CarShape;
}

export const CARS: CarDef[] = [
  { id: 'rocket', name: 'Rocket', body: '#e5384f', accent: '#ffd166', shape: 'coupe' },
  { id: 'bolt', name: 'Bolt', body: '#f5c518', accent: '#1d2433', shape: 'hatch' },
  { id: 'wave', name: 'Wave', body: '#2f7bff', accent: '#bfe3ff', shape: 'sedan' },
  { id: 'mint', name: 'Mint', body: '#1fbf8f', accent: '#0b3d33', shape: 'hatch' },
  { id: 'viper', name: 'Viper', body: '#8a4dff', accent: '#e3d4ff', shape: 'coupe' },
  { id: 'flare', name: 'Flare', body: '#ff7a1a', accent: '#fff1d6', shape: 'sedan' },
];

export const CAR_IDS: CarId[] = CARS.map((c) => c.id);

export function isCarId(value: unknown): value is CarId {
  return typeof value === 'string' && (CAR_IDS as string[]).includes(value);
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as string[]).includes(value);
}

// ----------------------------------------------------------------------------
// Multiplayer
// ----------------------------------------------------------------------------

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;
export const NAME_MAX_LENGTH = 14;
export const ROOM_CODE_LENGTH = 5;
/** Characters without look-alikes (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Text length used for multiplayer races, per difficulty. */
export const MULTIPLAYER_CHARS: Record<Difficulty, number> = {
  easy: 60,
  medium: 110,
  hard: 170,
  expert: 230,
};

export type RoomType = 'private' | 'public';
export type RoomStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

export interface PublicPlayer {
  id: string;
  name: string;
  car: CarId;
  ready: boolean;
  connected: boolean;
  host: boolean;
  /** Number of correctly typed characters (server validated). */
  correct: number;
  errors: number;
  finished: boolean;
  finishMs: number | null;
  position: number | null;
  left: boolean;
  disqualified: boolean;
}

export interface RoomSnapshot {
  code: string;
  type: RoomType;
  difficulty: Difficulty;
  status: RoomStatus;
  hostId: string;
  /** Present once the countdown begins. */
  text: string | null;
  textLength: number;
  /** Server clock (ms since epoch) at which typing starts. */
  startAt: number | null;
  /** Server clock (ms since epoch) when the lobby auto-starts (public rooms). */
  autoStartAt: number | null;
  /** Server clock at the moment this snapshot was created. */
  serverNow: number;
  minPlayers: number;
  maxPlayers: number;
  players: PublicPlayer[];
}

export interface ScoreBreakdown {
  completion: number;
  placement: number;
  speed: number;
  accuracy: number;
  participation: number;
  multiplier: number;
  total: number;
}

export interface ResultRow {
  playerId: string;
  name: string;
  car: CarId;
  position: number;
  finished: boolean;
  finishMs: number | null;
  wpm: number;
  accuracy: number;
  /** 0..100 */
  progressPct: number;
  disqualified: boolean;
  left: boolean;
  isBot: boolean;
  score: ScoreBreakdown;
}

export interface RaceResults {
  roomCode: string | null;
  difficulty: Difficulty;
  textLength: number;
  rows: ResultRow[];
}

// ----------------------------------------------------------------------------
// Socket events
// ----------------------------------------------------------------------------

export type AckOk<T> = { ok: true } & T;
export type AckErr = { ok: false; error: string };
export type Ack<T = object> = (response: AckOk<T> | AckErr) => void;

export interface JoinedInfo {
  selfId: string;
  room: RoomSnapshot;
  results: RaceResults | null;
}

export interface ClientToServerEvents {
  'time:sync': (ack: Ack<{ serverNow: number }>) => void;
  'room:create': (
    payload: { name: string; car: CarId; difficulty: Difficulty; token: string },
    ack: Ack<JoinedInfo>,
  ) => void;
  'room:join': (
    payload: { code: string; name: string; car: CarId; token: string },
    ack: Ack<JoinedInfo>,
  ) => void;
  'room:ready': (payload: { ready: boolean }, ack?: Ack) => void;
  'room:settings': (payload: { difficulty: Difficulty }, ack?: Ack) => void;
  'room:start': (ack?: Ack) => void;
  'room:leave': (ack?: Ack) => void;
  'room:rematch': (ack?: Ack) => void;
  'match:find': (
    payload: { name: string; car: CarId; difficulty: Difficulty; token: string },
    ack: Ack<JoinedInfo>,
  ) => void;
  'match:cancel': (ack?: Ack) => void;
  'race:progress': (payload: { correct: number; errors: number }) => void;
  'session:resume': (payload: { token: string; code: string }, ack: Ack<JoinedInfo>) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void;
  'race:results': (results: RaceResults) => void;
  'race:disqualified': (info: { reason: string }) => void;
  'match:no-opponent': (info: { waitedMs: number }) => void;
  'match:timeout': () => void;
  'server:notice': (info: { message: string }) => void;
}
