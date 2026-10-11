import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, generateText, isTextLang, isTypableText } from '../src';
import * as pools from '../src/textsIndic';

const allowedHindi = (ch: string) => {
  const c = ch.codePointAt(0)!;
  if (ch === ' ' || '.,?"'.includes(ch)) return true;
  if (c === 0x093c || c === 0x0901 || c === 0x0903) return false; // nukta, chandrabindu, visarga
  if (c >= 0x0966 && c <= 0x096f) return false; // Devanagari digits
  if (c >= 0x0958 && c <= 0x095f) return false; // precomposed nukta letters
  return c >= 0x0900 && c <= 0x097f;
};

describe('Hindi and Hinglish texts', () => {
  it('Hindi pools only use letters that are single keys on an Inscript keyboard', () => {
    for (const list of [pools.HINDI_WORDS, pools.HINDI_MEDIUM, pools.HINDI_HARD, pools.HINDI_EXPERT]) {
      for (const item of list) {
        for (const ch of item) expect(allowedHindi(ch), `${item} -> U+${ch.codePointAt(0)!.toString(16)}`).toBe(true);
        expect(item).toBe(item.normalize('NFC'));
        expect(item.length).toBe([...item].length); // BMP only, one UTF-16 unit per key
      }
    }
  });

  it('Hinglish pools are plain typable ASCII', () => {
    for (const list of [pools.HINGLISH_WORDS, pools.HINGLISH_MEDIUM, pools.HINGLISH_HARD, pools.HINGLISH_EXPERT]) {
      for (const item of list) expect(isTypableText(item), item).toBe(true);
    }
  });

  it('is deterministic per seed, different per language, and English is unchanged', () => {
    for (const d of DIFFICULTIES) {
      for (const lang of ['hindi', 'hinglish'] as const) {
        const a = generateText(d, 200, 77, 3, lang);
        expect(a).toBe(generateText(d, 200, 77, 3, lang));
        expect(a.length).toBeGreaterThan(40);
        expect(a).not.toBe(generateText(d, 200, 77, 3, 'en'));
      }
      expect(generateText(d, 200, 77, 3)).toBe(generateText(d, 200, 77, 3, 'en'));
    }
    expect(isTypableText(generateText('medium', 200, 5, 3, 'hindi'))).toBe(false);
  });

  it('validates language ids', () => {
    expect(isTextLang('hindi')).toBe(true);
    expect(isTextLang('klingon')).toBe(false);
    expect(isTextLang(undefined)).toBe(false);
  });
});
