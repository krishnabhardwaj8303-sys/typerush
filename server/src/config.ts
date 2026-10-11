export interface ServerConfig {
  port: number;
  /** Extra allowed browser origins (exact match). Use "*" to allow every origin. */
  origins: string[];
  /** Allow localhost and private-network origins (handy for phones on your Wi-Fi). */
  allowLocalNetworkOrigins: boolean;
  /** Trust X-Forwarded-For (set to true behind Render / a reverse proxy). */
  trustProxy: boolean;

  /** Pause between "everyone ready" and the GO signal. */
  countdownMs: number;
  /** Public rooms wait this long after the 2nd player joins for more players. */
  publicFillMs: number;
  /** Tell a lone public-queue player that nobody is around after this long. */
  noOpponentMs: number;
  /** Remove a lone public-queue player after this long. */
  matchTimeoutMs: number;
  /** How long a disconnected player may come back while in a lobby. */
  lobbyGraceMs: number;
  /** How long a disconnected player may come back during a race. */
  raceGraceMs: number;
  /** After the first finisher, everyone else has this long to finish. */
  finishGraceMs: number;
  /** Absolute upper bound for a race, measured from GO. */
  raceMaxMs: number;
  /** Progress broadcast interval during races. */
  tickMs: number;
  /** Idle room clean-up. */
  sweepMs: number;
  roomIdleMs: number;
  finishedRoomIdleMs: number;

  /** Anti-cheat: fastest believable typing speed in characters per second (22 = 264 WPM). */
  maxCharsPerSecond: number;
  /** Extra characters allowed on top of the speed limit (network bursts). */
  burstChars: number;
  /** Rejected progress updates before a player is disqualified. */
  maxStrikes: number;

  maxSocketsPerIp: number;
  maxRooms: number;
  leaderboardFile: string | null;
  /** PostgreSQL connection string for accounts and permanent leaderboards (null = in-memory only). */
  databaseUrl: string | null;
  /** Use SSL for the database connection (hosted databases need it). */
  databaseSsl: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CLIENT_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const production = env.NODE_ENV === 'production';
  return {
    port: num(env.PORT, 3001),
    origins,
    allowLocalNetworkOrigins: env.ALLOW_LOCAL_NETWORK !== undefined ? env.ALLOW_LOCAL_NETWORK === 'true' : !production,
    trustProxy: env.TRUST_PROXY !== undefined ? env.TRUST_PROXY === 'true' : production,
    countdownMs: 5000,
    publicFillMs: 10000,
    noOpponentMs: 30000,
    matchTimeoutMs: 5 * 60 * 1000,
    lobbyGraceMs: 20000,
    raceGraceMs: 30000,
    finishGraceMs: 45000,
    raceMaxMs: 10 * 60 * 1000,
    tickMs: 100,
    sweepMs: 30000,
    roomIdleMs: 30 * 60 * 1000,
    finishedRoomIdleMs: 10 * 60 * 1000,
    maxCharsPerSecond: 22,
    burstChars: 15,
    maxStrikes: 3,
    maxSocketsPerIp: 20,
    maxRooms: 500,
    leaderboardFile: env.LEADERBOARD_FILE === 'none' ? null : (env.LEADERBOARD_FILE ?? 'data/leaderboard.json'),
    databaseUrl: env.DATABASE_URL?.trim() ? env.DATABASE_URL.trim() : null,
    databaseSsl: env.DATABASE_SSL !== 'false',
  };
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function isOriginAllowed(origin: string | undefined, config: ServerConfig): boolean {
  // Non-browser clients (curl, tests, server-to-server) send no Origin header.
  if (!origin) return true;
  if (config.origins.includes('*')) return true;
  if (config.origins.includes(origin.replace(/\/$/, ''))) return true;
  return config.allowLocalNetworkOrigins && LOCAL_ORIGIN.test(origin);
}
