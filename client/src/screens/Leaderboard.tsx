import { useEffect, useState } from 'react';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@typerush/shared';
import { TopBar } from '../components/TopBar';
import { useProfile } from '../lib/ProfileContext';
import { serverUrl } from '../net/OnlineContext';
import type { Go } from '../routes';

interface OnlineEntry {
  name: string;
  wpm: number;
  accuracy: number;
  score: number;
  difficulty: Difficulty;
  at: number;
}

type Remote =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; entries: OnlineEntry[]; note: string };

function OnlineBoard() {
  const [remote, setRemote] = useState<Remote>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    setRemote({ state: 'loading' });
    fetch(`${serverUrl()}/api/leaderboard`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Server answered ${r.status}`);
        return r.json() as Promise<{ entries: OnlineEntry[]; note?: string }>;
      })
      .then((data) => setRemote({ state: 'ready', entries: data.entries ?? [], note: data.note ?? '' }))
      .catch(() =>
        setRemote({
          state: 'error',
          message: `The online board could not be loaded from ${serverUrl()}. The multiplayer server may be offline or waking up (free hosts sleep when idle).`,
        }),
      )
      .finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [attempt]);

  if (remote.state === 'loading') return <p className="muted center" role="status">Loading the online hall of fame...</p>;
  if (remote.state === 'error') {
    return (
      <div className="empty">
        <p>{remote.message}</p>
        <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (remote.entries.length === 0) {
    return (
      <div className="empty">
        <p>No online results yet. Win a public match to put your name here!</p>
      </div>
    );
  }
  return (
    <>
      <div className="table-wrap">
        <table className="results-table">
          <caption className="sr-only">Online hall of fame</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Racer</th>
              <th scope="col">Points</th>
              <th scope="col">WPM</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Level</th>
            </tr>
          </thead>
          <tbody>
            {remote.entries.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <th scope="row">{i + 1}</th>
                <td>{e.name}</td>
                <td>{e.score}</td>
                <td>{e.wpm.toFixed(0)}</td>
                <td>{e.accuracy.toFixed(1)}%</td>
                <td>{DIFFICULTY_LABEL[e.difficulty] ?? e.difficulty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remote.note && <p className="muted center">{remote.note}</p>}
    </>
  );
}

function MyRecords() {
  const { profile } = useProfile();
  return (
    <>
      <div className="stat-row">
        <div className="hud-tile">
          <span className="hud-label">Total points</span>
          <span className="hud-value">{profile.totalPoints}</span>
        </div>
        <div className="hud-tile">
          <span className="hud-label">Races</span>
          <span className="hud-value">{profile.races}</span>
        </div>
        <div className="hud-tile">
          <span className="hud-label">Wins</span>
          <span className="hud-value">{profile.wins}</span>
        </div>
      </div>

      <h2 className="section-title">Personal bests</h2>
      <div className="table-wrap">
        <table className="results-table">
          <caption className="sr-only">Personal bests by difficulty</caption>
          <thead>
            <tr>
              <th scope="col">Difficulty</th>
              <th scope="col">Best WPM</th>
              <th scope="col">Best accuracy</th>
            </tr>
          </thead>
          <tbody>
            {DIFFICULTIES.map((d) => (
              <tr key={d}>
                <th scope="row">{DIFFICULTY_LABEL[d]}</th>
                <td>{profile.bestWpm[d] ? profile.bestWpm[d].toFixed(0) : '-'}</td>
                <td>{profile.bestAccuracy[d] ? `${profile.bestAccuracy[d].toFixed(1)}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Recent races</h2>
      {profile.history.length === 0 ? (
        <div className="empty">
          <p>No races yet. Finish one and it will show up here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="results-table">
            <caption className="sr-only">Recent races</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Mode</th>
                <th scope="col">Place</th>
                <th scope="col">WPM</th>
                <th scope="col">Accuracy</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {profile.history.slice(0, 15).map((h) => (
                <tr key={h.at}>
                  <td>{new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                  <td>
                    {h.mode === 'level' ? `Level ${h.levelId}` : h.mode === 'quick' ? 'Practice' : h.mode === 'friends' ? 'Friends' : 'Online'}{' '}
                    <small className="muted">({DIFFICULTY_LABEL[h.difficulty]})</small>
                  </td>
                  <td>
                    {h.finished ? `${h.position}/${h.racers}` : 'DNF'}
                  </td>
                  <td>{h.wpm.toFixed(0)}</td>
                  <td>{h.accuracy.toFixed(1)}%</td>
                  <td>{h.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function Leaderboard({ go }: { go: Go }) {
  const [tab, setTab] = useState<'mine' | 'online'>('mine');
  return (
    <div className="page">
      <TopBar title="Leaderboard" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'tab tab-on' : 'tab'} onClick={() => setTab('mine')}>
          My records
        </button>
        <button role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'tab tab-on' : 'tab'} onClick={() => setTab('online')}>
          Online hall of fame
        </button>
      </div>
      <section className="panel" role="tabpanel">
        {tab === 'mine' ? <MyRecords /> : <OnlineBoard />}
      </section>
    </div>
  );
}
