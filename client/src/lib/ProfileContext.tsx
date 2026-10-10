import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { audio } from './audio';
import { loadProfile, saveProfile, type Profile, type RaceRecord, type Settings } from './storage';
import { applyRace, isOwned, purchase, type BuyResult, type Reward, type ShopKind } from './rewards';
import type { SkinId, TrailId } from './shop';
import type { CarId } from '@typerush/shared';

interface ProfileApi {
  profile: Profile;
  setName: (name: string) => void;
  setCar: (car: CarId) => void;
  setSettings: (patch: Partial<Settings>) => void;
  /** Saves a finished race and returns what the player earned (coins, badges, streak). */
  addRace: (record: RaceRecord) => Reward;
  buy: (kind: ShopKind, id: string) => BuyResult;
  setSkin: (skin: SkinId) => void;
  setTrail: (trail: TrailId) => void;
  reset: () => void;
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children, initial }: { children: ReactNode; initial?: Profile }) {
  const [profile, setProfileState] = useState<Profile>(() => initial ?? loadProfile());
  // Always the newest profile, so several updates in a row (race result, then a purchase) never overwrite each other.
  const latest = useRef(profile);
  const setProfile = useCallback((update: Profile | ((p: Profile) => Profile)) => {
    latest.current = typeof update === 'function' ? update(latest.current) : update;
    setProfileState(latest.current);
  }, []);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    audio.configure(profile.settings);
  }, [profile.settings]);

  const setName = useCallback((name: string) => setProfile((p) => ({ ...p, name: name.slice(0, 14) })), [setProfile]);
  const setCar = useCallback(
    (car: CarId) => setProfile((p) => (isOwned(p, 'car', car) ? { ...p, car } : p)),
    [setProfile],
  );
  const setSkin = useCallback(
    (skin: SkinId) => setProfile((p) => (isOwned(p, 'skin', skin) ? { ...p, skin } : p)),
    [setProfile],
  );
  const setTrail = useCallback(
    (trail: TrailId) => setProfile((p) => (isOwned(p, 'trail', trail) ? { ...p, trail } : p)),
    [setProfile],
  );
  const setSettings = useCallback(
    (patch: Partial<Settings>) => setProfile((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    [setProfile],
  );
  const addRace = useCallback(
    (record: RaceRecord): Reward => {
      const result = applyRace(latest.current, record);
      setProfile(result.profile);
      return result.reward;
    },
    [setProfile],
  );
  const buy = useCallback(
    (kind: ShopKind, id: string): BuyResult => {
      const result = purchase(latest.current, kind, id);
      if (result.ok) setProfile(result.profile);
      return result;
    },
    [setProfile],
  );
  const reset = useCallback(
    () =>
      setProfile((p) => ({
        ...p,
        completed: {},
        bestWpm: { easy: 0, medium: 0, hard: 0, expert: 0 },
        bestAccuracy: { easy: 0, medium: 0, hard: 0, expert: 0 },
        totalPoints: 0,
        races: 0,
        wins: 0,
        history: [],
        daily: null,
        stats: { perfectRaces: 0, dailiesDone: 0 },
      })),
    [setProfile],
  );

  const value = useMemo(
    () => ({ profile, setName, setCar, setSettings, addRace, buy, setSkin, setTrail, reset }),
    [profile, setName, setCar, setSettings, addRace, buy, setSkin, setTrail, reset],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
