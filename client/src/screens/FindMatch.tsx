import { useEffect, useState } from 'react';
import type { Difficulty } from '@typerush/shared';
import { ConnectionNotice } from '../components/ConnectionNotice';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import { useOnline } from '../net/OnlineContext';
import type { Go } from '../routes';

export function FindMatch({ go, initialDifficulty }: { go: Go; initialDifficulty?: Difficulty }) {
  const online = useOnline();
  const { profile } = useProfile();
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? 'medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { connect, resetMatchFlags } = online;
  useEffect(() => {
    connect();
  }, [connect]);

  const search = async () => {
    audio.unlock();
    audio.click();
    setBusy(true);
    setError(null);
    resetMatchFlags();
    const res = await online.findMatch(
      { name: profile.name, car: profile.car, token: profile.playerToken },
      difficulty,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="page">
      <TopBar title="Find Match" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <ConnectionNotice onPractice={() => go({ name: 'quick' })} />

      {online.matchTimedOut && (
        <div className="banner banner-info" role="status">
          <p>
            <strong>No opponents showed up.</strong> Public matchmaking only works when other people are searching at the
            same time. Try again, invite a friend with a private room, or practise against AI.
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => go({ name: 'quick' })}>
              Practice vs AI
            </button>
            <button className="btn" onClick={() => go({ name: 'friends' })}>
              Private room
            </button>
          </div>
        </div>
      )}

      {online.notice && (
        <p className="banner banner-info" role="status">
          {online.notice} <button className="link" onClick={online.dismissNotice}>Dismiss</button>
        </p>
      )}

      <section className="panel">
        <h2 className="section-title">Pick a difficulty</h2>
        <p className="muted">You are matched with players who picked the same difficulty.</p>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <button
          className="btn btn-primary btn-lg"
          disabled={online.status !== 'online' || busy}
          onClick={search}
        >
          {busy ? 'Searching...' : 'Find match'}
        </button>
      </section>

      {error && (
        <p className="banner banner-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
