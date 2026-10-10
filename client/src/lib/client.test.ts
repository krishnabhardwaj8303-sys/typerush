import { describe, expect, it } from 'vitest';
import { TypingSession } from './typingSession';
import { defaultProfile, parseProfile, recordRace } from './storage';

describe('TypingSession', () => {
  it('advances only on the correct character and counts errors', () => {
    const s = new TypingSession('ab c');
    expect(s.press('x', 100)).toBe('wrong');
    expect(s.pos).toBe(0);
    expect(s.errors).toBe(1);
    expect(s.press('a', 200)).toBe('correct');
    expect(s.press('b', 300)).toBe('correct');
    expect(s.press(' ', 400)).toBe('correct');
    expect(s.press('c', 500)).toBe('done');
    expect(s.done).toBe(true);
    expect(s.finishedAtMs).toBe(500);
    expect(s.press('d', 600)).toBe('ignored');
    expect(s.accuracy()).toBe(80);
    expect(s.progress()).toBe(1);
  });

  it('is case sensitive and ignores multi-character keys', () => {
    const s = new TypingSession('Hi');
    expect(s.press('h', 1)).toBe('wrong');
    expect(s.press('Shift', 2)).toBe('ignored');
    expect(s.press('H', 3)).toBe('correct');
  });

  it('computes WPM without exploding in the first seconds', () => {
    const s = new TypingSession('a'.repeat(100));
    for (let i = 0; i < 10; i++) s.press('a', 100);
    // 10 chars in the first 100 ms would be 1200 WPM unfloored; liveWpm floors the window at 2 s => 60.
    expect(s.liveWpm(100)).toBe(60);
    expect(s.wpm(60000)).toBe(2);
  });

  it('restores validated progress after a reconnect', () => {
    const s = new TypingSession('hello');
    s.restore(3, 2);
    expect(s.pos).toBe(3);
    expect(s.expected).toBe('l');
    s.restore(999, -5);
    expect(s.pos).toBe(5);
    expect(s.errors).toBe(0);
  });
});

describe('profile storage', () => {
  it('survives corrupt or hostile saved data', () => {
    for (const raw of [null, '', 'not json', '[]', '{"name": 5}', '{"completed": {"1": "x", "99": 3}}']) {
      const p = parseProfile(raw);
      expect(p.name.length).toBeGreaterThan(0);
      expect(Object.keys(p.completed).every((k) => Number(k) >= 1 && Number(k) <= 100)).toBe(true);
    }
  });

  it('records races, unlocks levels and never loses points', () => {
    let p = defaultProfile();
    p = recordRace(p, {
      mode: 'level',
      difficulty: 'easy',
      levelId: 1,
      wpm: 20,
      accuracy: 95,
      score: 120,
      position: 1,
      racers: 4,
      finished: true,
      stars: 3,
    });
    expect(p.completed[1]).toBe(3);
    expect(p.totalPoints).toBe(120);
    expect(p.wins).toBe(1);
    expect(p.bestWpm.easy).toBe(20);

    p = recordRace(p, {
      mode: 'level',
      difficulty: 'easy',
      levelId: 1,
      wpm: 10,
      accuracy: 70,
      score: -50, // hostile / buggy value
      position: 4,
      racers: 4,
      finished: true,
      stars: 0,
    });
    expect(p.completed[1]).toBe(3); // stars never go down
    expect(p.totalPoints).toBe(120); // negative scores are ignored
    expect(p.bestWpm.easy).toBe(20);
    expect(p.history).toHaveLength(2);
  });
});
