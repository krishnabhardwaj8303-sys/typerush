import {
  NAME_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isCarId,
  isDifficulty,
  type CarId,
  type Difficulty,
} from '@typerush/shared';

export class ValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const BLOCKED_CHARS = new Set(['<', '>', '&', '"', "'", '`', '\\']);

function isBlockedCodePoint(code: number): boolean {
  return (
    code <= 0x1f || // C0 controls
    (code >= 0x7f && code <= 0x9f) || // DEL + C1 controls
    (code >= 0x200b && code <= 0x200f) || // zero-width + directional marks
    (code >= 0x2028 && code <= 0x202e) || // line/paragraph separators + bidi overrides
    (code >= 0x2060 && code <= 0x206f) || // invisible formatting
    code === 0xfeff
  );
}

/** Strips control/invisible characters and markup-ish characters, collapses whitespace. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Name must be text.');
  let kept = '';
  for (const ch of raw.slice(0, 200).normalize('NFKC')) {
    const code = ch.codePointAt(0) ?? 0;
    if (/\s/.test(ch)) kept += ' ';
    else if (!isBlockedCodePoint(code) && !BLOCKED_CHARS.has(ch)) kept += ch;
  }
  const cleaned = kept.replace(/ +/g, ' ').trim().slice(0, NAME_MAX_LENGTH).trim();
  if (cleaned.length < 1) throw new ValidationError('Please enter a nickname (1-14 characters).');
  return cleaned;
}

export function sanitizeCode(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('Room code must be text.');
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) throw new ValidationError('Room codes have 5 characters.');
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) throw new ValidationError('That room code has invalid characters.');
  }
  return code;
}

export function sanitizeToken(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(raw)) {
    throw new ValidationError('Invalid session token.');
  }
  return raw;
}

export function sanitizeCar(raw: unknown): CarId {
  if (!isCarId(raw)) throw new ValidationError('Unknown car.');
  return raw;
}

export function sanitizeDifficulty(raw: unknown): Difficulty {
  if (!isDifficulty(raw)) throw new ValidationError('Unknown difficulty.');
  return raw;
}

export interface ProfilePayload {
  name: string;
  car: CarId;
  token: string;
}

export function parseCreate(raw: unknown): ProfilePayload & { difficulty: Difficulty } {
  if (!isRecord(raw)) throw new ValidationError('Bad request.');
  return {
    name: sanitizeName(raw.name),
    car: sanitizeCar(raw.car),
    token: sanitizeToken(raw.token),
    difficulty: sanitizeDifficulty(raw.difficulty),
  };
}

export function parseJoin(raw: unknown): ProfilePayload & { code: string } {
  if (!isRecord(raw)) throw new ValidationError('Bad request.');
  return {
    code: sanitizeCode(raw.code),
    name: sanitizeName(raw.name),
    car: sanitizeCar(raw.car),
    token: sanitizeToken(raw.token),
  };
}

export function parseFind(raw: unknown): ProfilePayload & { difficulty: Difficulty } {
  return parseCreate(raw);
}

export function parseResume(raw: unknown): { token: string; code: string } {
  if (!isRecord(raw)) throw new ValidationError('Bad request.');
  return { token: sanitizeToken(raw.token), code: sanitizeCode(raw.code) };
}

export function parseReady(raw: unknown): boolean {
  if (!isRecord(raw) || typeof raw.ready !== 'boolean') throw new ValidationError('Bad request.');
  return raw.ready;
}

export function parseSettings(raw: unknown): Difficulty {
  if (!isRecord(raw)) throw new ValidationError('Bad request.');
  return sanitizeDifficulty(raw.difficulty);
}

function wholeNumber(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return null;
  return value;
}

/** Returns null for anything malformed so the caller can silently drop it. */
export function parseProgress(raw: unknown): { correct: number; errors: number } | null {
  if (!isRecord(raw)) return null;
  const correct = wholeNumber(raw.correct, 100000);
  const errors = wholeNumber(raw.errors, 100000);
  if (correct === null || errors === null) return null;
  return { correct, errors };
}
