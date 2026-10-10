import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Difficulty } from '@typerush/shared';

export interface LeaderboardEntry {
  name: string;
  wpm: number;
  accuracy: number;
  score: number;
  difficulty: Difficulty;
  at: number;
}

const MAX_ENTRIES = 50;

/**
 * "Online Hall of Fame": the best results from public matches.
 * Stored in a small JSON file. On free hosts the disk is usually wiped on
 * restart/redeploy, so treat this as a fun, temporary board, not a database.
 */
export class Leaderboard {
  private entries: LeaderboardEntry[] = [];
  private writeTimer: NodeJS.Timeout | null = null;
  private warned = false;

  constructor(private file: string | null) {
    if (file) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
        if (Array.isArray(parsed)) {
          this.entries = parsed
            .filter(
              (e): e is LeaderboardEntry =>
                !!e &&
                typeof e.name === 'string' &&
                Number.isFinite(e.score) &&
                Number.isFinite(e.wpm) &&
                Number.isFinite(e.accuracy),
            )
            .slice(0, MAX_ENTRIES);
        }
      } catch {
        // No file yet, or unreadable: start empty.
      }
    }
  }

  add(entry: LeaderboardEntry): void {
    if (entry.score <= 0) return;
    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score || b.wpm - a.wpm);
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.scheduleWrite();
  }

  top(limit = 25): LeaderboardEntry[] {
    return this.entries.slice(0, limit);
  }

  private scheduleWrite(): void {
    if (!this.file || this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 1500);
    this.writeTimer.unref?.();
  }

  flush(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[leaderboard] could not save to disk (continuing in memory):', (error as Error).message);
      }
    }
  }

  close(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.flush();
  }
}
