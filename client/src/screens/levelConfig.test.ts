import { describe, expect, it } from 'vitest';
import { classInfo, cupInfo, generateText } from '@typerush/shared';
import { assignmentConfig } from './levelConfig';

describe('assignmentConfig', () => {
  it('builds the same race for everybody from the server spec', () => {
    const info = cupInfo(Date.parse('2026-10-07T10:00:00Z'));
    const spec = { difficulty: info.difficulty, chars: info.chars, seed: info.seed, tier: info.tier, key: info.key };
    const a = assignmentConfig(spec, 'Cup', { kind: 'cup' });
    const b = assignmentConfig(spec, 'Cup', { kind: 'cup' });
    expect(a.seed).toBe(b.seed);
    expect(a.submit).toEqual({ kind: 'cup' });
    expect(a.opponents.map((o) => o.id)).toEqual(b.opponents.map((o) => o.id));
    expect(generateText(a.difficulty, a.chars, a.seed, a.tier)).toBe(generateText(info.difficulty, info.chars, info.seed, info.tier));
  });

  it('gives each class round its own text', () => {
    const r1 = classInfo('abc', 1, 'easy');
    const r2 = classInfo('abc', 2, 'easy');
    expect(r1.seed).not.toBe(r2.seed);
    expect(classInfo('abc', 1, 'easy').seed).toBe(r1.seed);
  });
});
