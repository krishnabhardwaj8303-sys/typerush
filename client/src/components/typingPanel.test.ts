import { describe, expect, it } from 'vitest';
import { clusterAt, clusterStarts } from './TypingPanel';

describe('typing clusters', () => {
  it('treats a Hindi letter with its vowel sign as one cluster', () => {
    const text = '\u0915\u093f\u0924\u093e\u092c'; // \u0915 \u093f \u0924 \u093e \u092c  (5 code points)
    const starts = clusterStarts(text);
    expect(text.length).toBe(5);
    expect(starts).toEqual([0, 2, 4]); // \u0915\u093f | \u0924\u093e | \u092c
    expect(clusterAt(starts, text.length, 0)).toEqual([0, 2]);
    expect(clusterAt(starts, text.length, 1)).toEqual([0, 2]); // vowel sign still belongs to the first letter
    expect(clusterAt(starts, text.length, 2)).toEqual([2, 4]);
    expect(clusterAt(starts, text.length, 4)).toEqual([4, 5]);
  });
  it('is one character per cluster for English', () => {
    const starts = clusterStarts('race');
    expect(starts).toEqual([0, 1, 2, 3]);
    expect(clusterAt(starts, 4, 2)).toEqual([2, 3]);
  });
});
