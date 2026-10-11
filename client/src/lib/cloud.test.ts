import { describe, expect, it } from 'vitest';
import { mergeProfiles, uploadable } from './cloud';
import { TypingSession } from './typingSession';
import { defaultProfile, parseProfile, type Profile } from './storage';

const base = (): Profile => ({ ...defaultProfile(), playerToken: 'local-token-0123456789abcdef' });

describe('cloud save helpers', () => {
  it('never uploads the device token or the link state', () => {
    const p = { ...base(), account: { linked: true, accountId: 'abc-12345678', lastSyncAt: 5 } };
    const up = uploadable(p);
    expect(up.playerToken).toBeUndefined();
    expect(up.account).toBeUndefined();
    expect(up.coins).toBe(0);
  });

  it('merges two devices without losing anything that only grows', () => {
    const local: Profile = {
      ...base(),
      coins: 10,
      completed: { 1: 3, 2: 1 },
      bestWpm: { easy: 40, medium: 0, hard: 0, expert: 0 },
      owned: { cars: ['rocket', 'bolt', 'wave', 'mint', 'viper', 'flare', 'comet'], skins: ['plain'], trails: ['none'] },
      badges: { 'first-race': 200 },
      races: 5,
      stats: { perfectRaces: 1, dailiesDone: 0 },
    };
    const cloud: Profile = {
      ...base(),
      coins: 500,
      completed: { 2: 3, 3: 2 },
      bestWpm: { easy: 30, medium: 55, hard: 0, expert: 0 },
      owned: { cars: ['rocket', 'bolt', 'wave', 'mint', 'viper', 'flare'], skins: ['plain', 'gold'], trails: ['none'] },
      badges: { 'first-race': 100, 'wpm-40': 300 },
      races: 9,
      stats: { perfectRaces: 0, dailiesDone: 2 },
      name: 'CloudName',
    };
    const merged = mergeProfiles(local, uploadable(cloud), true);
    expect(merged.completed).toEqual({ 1: 3, 2: 3, 3: 2 });
    expect(merged.bestWpm.easy).toBe(40);
    expect(merged.bestWpm.medium).toBe(55);
    expect(merged.owned.cars).toContain('comet');
    expect(merged.owned.skins).toEqual(expect.arrayContaining(['plain', 'gold']));
    expect(merged.badges).toEqual({ 'first-race': 100, 'wpm-40': 300 });
    expect(merged.races).toBe(9);
    expect(merged.stats).toEqual({ perfectRaces: 1, dailiesDone: 2 });
    // coins and name come from the newer side
    expect(merged.coins).toBe(500);
    expect(merged.name).toBe('CloudName');
    expect(merged.playerToken).toBe(local.playerToken);
    expect(mergeProfiles(local, uploadable(cloud), false).coins).toBe(10);
  });

  it('survives garbage from the cloud', () => {
    const merged = mergeProfiles(base(), { version: 1, coins: 'lots', owned: 7, badges: [1], completed: 'x' }, true);
    expect(merged.coins).toBe(0);
    expect(merged.owned.skins).toContain('plain');
    expect(mergeProfiles(base(), null, true).coins).toBe(0);
  });

  it('keeps the account link only when it is complete', () => {
    expect(parseProfile(JSON.stringify({ account: { linked: true } })).account.linked).toBe(false);
    const ok = parseProfile(JSON.stringify({ account: { linked: true, accountId: 'abcd1234-ef', lastSyncAt: 12 } }));
    expect(ok.account).toEqual({ linked: true, accountId: 'abcd1234-ef', lastSyncAt: 12 });
  });
});

describe('typing log', () => {
  it('records the time of every correct character only', () => {
    const s = new TypingSession('abc');
    s.press('a', 100.4);
    s.press('x', 150);
    s.press('b', 220);
    s.press('c', 300);
    expect(s.times).toEqual([100, 220, 300]);
    expect(s.errors).toBe(1);
  });
});
