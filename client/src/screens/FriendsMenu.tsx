import { useEffect, useState } from 'react';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type Difficulty } from '@typerush/shared';
import { ConnectionNotice } from '../components/ConnectionNotice';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import { useOnline } from '../net/OnlineContext';
import type { Go } from '../routes';

function cleanCode(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => ROOM_CODE_ALPHABET.includes(c)).join('').slice(0, ROOM_CODE_LENGTH);
}

export function FriendsMenu({ go, initialCode }: { go: Go; initialCode?: string }) {
  const online = useOnline();
  const { profile } = useProfile();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [code, setCode] = useState(initialCode ? cleanCode(initialCode) : '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { connect } = online;
  useEffect(() => {
    connect();
  }, [connect]);

  const identity = { name: profile.name, car: profile.car, token: profile.playerToken };
  const ready = online.status === 'online';

  const create = async () => {
    audio.unlock();
    audio.click();
    setBusy('create');
    setError(null);
    const res = await online.createRoom(identity, difficulty);
    setBusy(null);
    if (!res.ok) setError(res.error);
  };

  const join = async () => {
    audio.unlock();
    audio.click();
    if (code.length !== ROOM_CODE_LENGTH) {
      setError(`Enter the ${ROOM_CODE_LENGTH}-character room code your friend shared.`);
      return;
    }
    setBusy('join');
    setError(null);
    const res = await online.joinRoom(identity, code);
    setBusy(null);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="page">
      <TopBar title="Friends Race" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <ConnectionNotice onPractice={() => go({ name: 'quick' })} />

      {online.notice && (
        <p className="banner banner-info" role="status">
          {online.notice} <button className="link" onClick={online.dismissNotice}>Dismiss</button>
        </p>
      )}

      <div className="two-col">
        <section className="panel">
          <h2 className="section-title">Create a private room</h2>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          <p className="muted">You will get a 5-letter code and an invite link to share. Up to 4 players.</p>
          <button className="btn btn-primary btn-lg" disabled={!ready || busy !== null} onClick={create}>
            {busy === 'create' ? 'Creating...' : 'Create room'}
          </button>
        </section>

        <section className="panel">
          <h2 className="section-title">Join with a code</h2>
          <label className="field">
            <span>Room code</span>
            <input
              className="code-input"
              type="text"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void join();
              }}
              placeholder="ABCDE"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              aria-describedby="join-help"
            />
            <small id="join-help" className="muted">
              Playing as <strong>{profile.name}</strong>. Change your name in the Garage.
            </small>
          </label>
          <button className="btn btn-accent btn-lg" disabled={!ready || busy !== null} onClick={join}>
            {busy === 'join' ? 'Joining...' : 'Join room'}
          </button>
        </section>
      </div>

      {error && (
        <p className="banner banner-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
