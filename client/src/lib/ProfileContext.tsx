import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { audio } from './audio';
import { loadProfile, saveProfile, type Profile, type RaceRecord, type Settings } from './storage';
import {
  createAccount,
  deleteCloudAccount,
  downloadSave,
  mergeProfiles,
  restoreAccount,
  unlinkDevice,
  uploadSave,
  uploadable,
} from './cloud';
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
  /** Cloud account (recovery code, no password). */
  cloud: CloudState;
  signUp: () => Promise<{ ok: true; recoveryCode: string; persistent: boolean } | { ok: false; error: string }>;
  signIn: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
  removeCloudAccount: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface CloudState {
  status: 'idle' | 'syncing' | 'ok' | 'error';
  message: string | null;
}

const UNLINKED = { linked: false, accountId: null, lastSyncAt: null } as const;

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

  // ---------------------------------------------------------------- cloud account
  const [cloud, setCloud] = useState<CloudState>({ status: 'idle', message: null });
  const syncing = useRef(false);
  const lastUploaded = useRef('');
  const signature = (p: Profile) => JSON.stringify(uploadable(p));

  const pushNow = useCallback(async () => {
    const p = latest.current;
    if (!p.account.linked || syncing.current) return;
    syncing.current = true;
    setCloud({ status: 'syncing', message: null });
    const sig = signature(p);
    const res = await uploadSave(p.playerToken, p);
    syncing.current = false;
    if (res.ok) {
      lastUploaded.current = sig;
      setProfile((q) => ({ ...q, account: { ...q.account, lastSyncAt: res.data.saveUpdatedAt } }));
      setCloud({ status: 'ok', message: null });
    } else {
      setCloud({ status: 'error', message: res.error });
    }
  }, [setProfile]);

  const pullNow = useCallback(async () => {
    const p = latest.current;
    if (!p.account.linked) return;
    setCloud({ status: 'syncing', message: null });
    const res = await downloadSave(p.playerToken);
    if (!res.ok) {
      if (/not signed in/i.test(res.error)) {
        setProfile((q) => ({ ...q, account: { ...UNLINKED } }));
        setCloud({ status: 'error', message: 'This device was signed out of your account. Sign in again with your recovery code.' });
      } else {
        setCloud({ status: 'error', message: res.error });
      }
      return;
    }
    if (res.data.save) {
      const cloudNewer = (res.data.saveUpdatedAt ?? 0) > (latest.current.account.lastSyncAt ?? 0);
      const merged = mergeProfiles(latest.current, res.data.save, cloudNewer);
      lastUploaded.current = '';
      setProfile({ ...merged, account: { ...latest.current.account, lastSyncAt: res.data.saveUpdatedAt } });
    }
    setCloud({ status: 'ok', message: null });
  }, [setProfile]);

  // Auto-save to the cloud a few seconds after something changes.
  useEffect(() => {
    if (!profile.account.linked) return;
    if (signature(profile) === lastUploaded.current) return;
    const timer = window.setTimeout(() => void pushNow(), 4000);
    return () => window.clearTimeout(timer);
  }, [profile, pushNow]);

  // Fetch the newest cloud save once when the game opens.
  useEffect(() => {
    if (initial === undefined && latest.current.account.linked) void pullNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = useCallback(async () => {
    const p = latest.current;
    const res = await createAccount(p.playerToken, p.name);
    if (!res.ok) return res;
    setProfile((q) => ({ ...q, account: { linked: true, accountId: res.data.accountId, lastSyncAt: null } }));
    lastUploaded.current = '';
    await pushNow();
    return { ok: true as const, recoveryCode: res.data.recoveryCode, persistent: res.data.persistent };
  }, [pushNow, setProfile]);

  const signIn = useCallback(
    async (code: string) => {
      const p = latest.current;
      const res = await restoreAccount(p.playerToken, code);
      if (!res.ok) return res;
      const merged = res.data.save ? mergeProfiles(p, res.data.save, true) : p;
      lastUploaded.current = '';
      setProfile({
        ...merged,
        name: res.data.save ? merged.name : res.data.name,
        account: { linked: true, accountId: res.data.accountId, lastSyncAt: res.data.saveUpdatedAt },
      });
      await pushNow();
      return { ok: true as const };
    },
    [pushNow, setProfile],
  );

  const signOut = useCallback(async () => {
    const p = latest.current;
    await unlinkDevice(p.playerToken);
    setProfile((q) => ({ ...q, account: { ...UNLINKED } }));
    setCloud({ status: 'idle', message: null });
  }, [setProfile]);

  const removeCloudAccount = useCallback(async () => {
    const res = await deleteCloudAccount(latest.current.playerToken);
    if (!res.ok) return res;
    setProfile((q) => ({ ...q, account: { ...UNLINKED } }));
    setCloud({ status: 'idle', message: null });
    return { ok: true as const };
  }, [setProfile]);

  const syncNow = useCallback(async () => {
    await pullNow();
    await pushNow();
  }, [pullNow, pushNow]);

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
    () => ({
      profile,
      setName,
      setCar,
      setSettings,
      addRace,
      buy,
      setSkin,
      setTrail,
      reset,
      cloud,
      signUp,
      signIn,
      syncNow,
      signOut,
      removeCloudAccount,
    }),
    [profile, setName, setCar, setSettings, addRace, buy, setSkin, setTrail, reset, cloud, signUp, signIn, syncNow, signOut, removeCloudAccount],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
