import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  CarId,
  SkinId,
  TrailId,
  ClientToServerEvents,
  Difficulty,
  JoinedInfo,
  RaceResults,
  RoomSnapshot,
  ServerToClientEvents,
} from '@typerush/shared';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline';
export type Outcome = { ok: true } | { ok: false; error: string };

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

const SESSION_KEY = 'typerush.session';

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function writeSession(code: string | null) {
  try {
    if (code) sessionStorage.setItem(SESSION_KEY, code);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

interface Identity {
  name: string;
  car: CarId;
  skin?: SkinId;
  trail?: TrailId;
  token: string;
}

export interface OnlineApi {
  status: ConnectionStatus;
  url: string;
  connectError: string | null;
  room: RoomSnapshot | null;
  selfId: string | null;
  results: RaceResults | null;
  notice: string | null;
  disqualified: string | null;
  noOpponent: boolean;
  matchTimedOut: boolean;
  connect: () => void;
  /** Current estimate of the server clock. */
  serverNow: () => number;
  createRoom: (identity: Identity, difficulty: Difficulty) => Promise<Outcome>;
  joinRoom: (identity: Identity, code: string) => Promise<Outcome>;
  findMatch: (identity: Identity, difficulty: Difficulty) => Promise<Outcome>;
  cancelMatch: () => Promise<void>;
  setReady: (ready: boolean) => Promise<Outcome>;
  setDifficulty: (difficulty: Difficulty) => Promise<Outcome>;
  startRace: () => Promise<Outcome>;
  rematch: () => Promise<Outcome>;
  leave: () => Promise<void>;
  /** Returns true when the update was actually handed to the socket. */
  sendProgress: (correct: number, errors: number) => boolean;
  dismissNotice: () => void;
  resetMatchFlags: () => void;
}

const OnlineContext = createContext<OnlineApi | null>(null);

export function OnlineProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<TypedSocket | null>(null);
  const offsetRef = useRef(0);
  const syncedRef = useRef(false);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const identityRef = useRef<Identity | null>(null);
  const connectTimer = useRef<number | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [results, setResults] = useState<RaceResults | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [disqualified, setDisqualified] = useState<string | null>(null);
  const [noOpponent, setNoOpponent] = useState(false);
  const [matchTimedOut, setMatchTimedOut] = useState(false);

  const url = serverUrl();

  const adopt = useCallback((info: JoinedInfo) => {
    roomRef.current = info.room;
    setRoom(info.room);
    setSelfId(info.selfId);
    setResults(info.results);
    writeSession(info.room.code);
    if (!syncedRef.current) offsetRef.current = info.room.serverNow - Date.now(); // rough until time sync completes
  }, []);

  const clearRoom = useCallback(() => {
    roomRef.current = null;
    setRoom(null);
    setSelfId(null);
    setResults(null);
    setDisqualified(null);
    setNoOpponent(false);
    writeSession(null);
  }, []);

  const syncTime = useCallback((socket: TypedSocket) => {
    let best: { rtt: number; offset: number } | null = null;
    let remaining = 4;
    const sample = () => {
      const sent = Date.now();
      socket.emit('time:sync', (res) => {
        const received = Date.now();
        if (res.ok) {
          const rtt = received - sent;
          const offset = res.serverNow + rtt / 2 - received;
          if (!best || rtt < best.rtt) best = { rtt, offset };
          offsetRef.current = best.offset;
          syncedRef.current = true;
        }
        if (--remaining > 0) window.setTimeout(sample, 120);
      });
    };
    sample();
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) {
      if (!socketRef.current.connected) socketRef.current.connect();
      return;
    }
    setStatus('connecting');
    setConnectError(null);
    const socket: TypedSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      timeout: 8000,
    });
    socketRef.current = socket;

    // Tell the user plainly if the server cannot be reached.
    connectTimer.current = window.setTimeout(() => {
      if (!socket.connected) {
        setStatus('offline');
        setConnectError(
          `Could not reach the multiplayer server at ${url}. If you are running locally, start it with "npm run dev:server". ` +
            'Practice mode still works offline.',
        );
      }
    }, 6000);

    socket.on('connect', () => {
      if (connectTimer.current) window.clearTimeout(connectTimer.current);
      setStatus('online');
      setConnectError(null);
      syncTime(socket);
      const code = readSession();
      if (code && identityRef.current) {
        socket.emit('session:resume', { token: identityRef.current.token, code }, (res) => {
          if (res.ok) adopt(res);
          else clearRoom();
        });
      }
    });
    socket.on('disconnect', () => {
      setStatus('connecting');
    });
    socket.on('connect_error', () => {
      setStatus((s) => (s === 'online' ? 'connecting' : 'offline'));
      setConnectError(
        `Could not reach the multiplayer server at ${url}. Make sure it is running (local: "npm run dev:server"). Retrying...`,
      );
    });
    socket.on('room:state', (snapshot) => {
      if (!syncedRef.current) offsetRef.current = snapshot.serverNow - Date.now();
      roomRef.current = snapshot;
      setRoom(snapshot);
    });
    socket.on('race:results', (r) => setResults(r));
    socket.on('race:disqualified', (d) => setDisqualified(d.reason));
    socket.on('match:no-opponent', () => setNoOpponent(true));
    socket.on('match:timeout', () => {
      setMatchTimedOut(true);
      clearRoom();
    });
    socket.on('server:notice', (n) => {
      setNotice(n.message);
      if (/somewhere else|inactive/i.test(n.message)) clearRoom();
    });
  }, [adopt, clearRoom, syncTime, url]);

  useEffect(
    () => () => {
      if (connectTimer.current) window.clearTimeout(connectTimer.current);
      socketRef.current?.removeAllListeners();
      socketRef.current?.close();
      socketRef.current = null;
    },
    [],
  );

  const emitWithAck = useCallback(
    (run: (socket: TypedSocket, done: (res: { ok: boolean; error?: string } & Partial<JoinedInfo>) => void) => void) =>
      new Promise<Outcome>((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: 'Not connected to the multiplayer server.' });
          return;
        }
        const timer = window.setTimeout(() => resolve({ ok: false, error: 'The server did not answer in time.' }), 8000);
        run(socket, (res) => {
          window.clearTimeout(timer);
          if (res.ok) {
            if (res.room && res.selfId) adopt(res as JoinedInfo);
            resolve({ ok: true });
          } else resolve({ ok: false, error: res.error ?? 'Request failed.' });
        });
      }),
    [adopt],
  );

  const resetMatchFlags = useCallback(() => {
    setNoOpponent(false);
    setMatchTimedOut(false);
  }, []);

  const api = useMemo<OnlineApi>(
    () => ({
      status,
      url,
      connectError,
      room,
      selfId,
      results,
      notice,
      disqualified,
      noOpponent,
      matchTimedOut,
      connect,
      serverNow: () => Date.now() + offsetRef.current,
      createRoom: (identity, difficulty) => {
        identityRef.current = identity;
        setResults(null);
        setDisqualified(null);
        return emitWithAck((s, done) => s.emit('room:create', { ...identity, difficulty }, done));
      },
      joinRoom: (identity, code) => {
        identityRef.current = identity;
        setResults(null);
        setDisqualified(null);
        return emitWithAck((s, done) => s.emit('room:join', { ...identity, code }, done));
      },
      findMatch: (identity, difficulty) => {
        identityRef.current = identity;
        resetMatchFlags();
        setResults(null);
        setDisqualified(null);
        return emitWithAck((s, done) => s.emit('match:find', { ...identity, difficulty }, done));
      },
      cancelMatch: async () => {
        await emitWithAck((s, done) => s.emit('match:cancel', done));
        clearRoom();
        resetMatchFlags();
      },
      setReady: (ready) => emitWithAck((s, done) => s.emit('room:ready', { ready }, done)),
      setDifficulty: (difficulty) => emitWithAck((s, done) => s.emit('room:settings', { difficulty }, done)),
      startRace: () => emitWithAck((s, done) => s.emit('room:start', done)),
      rematch: () =>
        emitWithAck((s, done) => s.emit('room:rematch', done)).then((r) => {
          if (r.ok) {
            setResults(null);
            setDisqualified(null);
          }
          return r;
        }),
      leave: async () => {
        const socket = socketRef.current;
        if (socket?.connected) {
          await new Promise<void>((resolve) => {
            const t = window.setTimeout(resolve, 1500);
            socket.emit('room:leave', () => {
              window.clearTimeout(t);
              resolve();
            });
          });
        }
        clearRoom();
        resetMatchFlags();
      },
      sendProgress: (correct, errors) => {
        const socket = socketRef.current;
        if (!socket?.connected) return false;
        socket.emit('race:progress', { correct, errors });
        return true;
      },
      dismissNotice: () => setNotice(null),
      resetMatchFlags,
    }),
    [status, url, connectError, room, selfId, results, notice, disqualified, noOpponent, matchTimedOut, connect, emitWithAck, clearRoom, resetMatchFlags],
  );

  return <OnlineContext.Provider value={api}>{children}</OnlineContext.Provider>;
}

export function useOnline(): OnlineApi {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error('useOnline must be used inside <OnlineProvider>');
  return ctx;
}
