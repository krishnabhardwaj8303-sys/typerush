import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { audio } from './audio';
import {
  loadProfile,
  recordRace,
  saveProfile,
  type Profile,
  type RaceRecord,
  type Settings,
} from './storage';
import type { CarId } from '@typerush/shared';

interface ProfileApi {
  profile: Profile;
  setName: (name: string) => void;
  setCar: (car: CarId) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addRace: (record: RaceRecord) => void;
  reset: () => void;
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children, initial }: { children: ReactNode; initial?: Profile }) {
  const [profile, setProfile] = useState<Profile>(() => initial ?? loadProfile());

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    audio.configure(profile.settings);
  }, [profile.settings]);

  const setName = useCallback((name: string) => setProfile((p) => ({ ...p, name: name.slice(0, 14) })), []);
  const setCar = useCallback((car: CarId) => setProfile((p) => ({ ...p, car })), []);
  const setSettings = useCallback(
    (patch: Partial<Settings>) => setProfile((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    [],
  );
  const addRace = useCallback((record: RaceRecord) => setProfile((p) => recordRace(p, record)), []);
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
      })),
    [],
  );

  const value = useMemo(
    () => ({ profile, setName, setCar, setSettings, addRace, reset }),
    [profile, setName, setCar, setSettings, addRace, reset],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
