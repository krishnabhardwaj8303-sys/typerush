import { useEffect, useState } from 'react';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@typerush/shared';
import { TopBar } from '../components/TopBar';
import { useProfile } from '../lib/ProfileContext';
import { fetchBoard, type BoardData, type BoardScope } from '../lib/cloud';
import { BADGES, dayKey } from '../lib/rewards';
import { serverUrl } from '../net/OnlineContext';
import type { Go } from '../routes';

type Remote =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: BoardData };

const SCOPES: { id: BoardScope; label: string }[] = [
  { id: 'daily', label: 'Daily Challenge' },
  { id: 'weekly', label: 'This week' },
  { id: 'alltime', label: 'All time' },
  { id: 'public', label: 'Public matches' },
];

function OnlineBoard() {
  const { profile } = useProfile();
  const [scope, setScope] = useState<BoardScope>('daily');
  const [difficulty, setDifficulty] = useState<'all' | Difficulty>('all');
  const [remote, setRemote] = useState<Remote>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const token = profile.account.linked ? profile.playerToken : null;

  useEffect(() => {
    let cancelled = false;
    setRemote({ state: 'loading' });
    fetchBoard(scope, {
      token,
      difficulty: difficulty === 'all' ? undefined : difficulty,
      day: scope === 'daily' ? dayKey() : undefined,
    }).then((res) => {
      if (cancelled) return;
      setRemote(
        res.ok
          ? { state: 'ready', data: res.data }
          : { state: 'error', message: `The leaderboard could not be loaded from ${serverUrl()}. ${res.error}` },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [scope, difficulty, token, attempt]);

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Board">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={scope === s.id}
            className={scope === s.id ? 'tab tab-on' : 'tab'}
            onClick={() => setScope(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="field board-filter">
        <span>Difficulty</span>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as 'all' | Difficulty)}>
          <option value="all">All</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
      </label>

      {remote.state === 'loading' && (
        <p className="muted center" role="status">
          Loading the leaderboard...
        </p>
      )}
      {remote.state === 'error' && (
        <div className="empty">
          <p>{remote.message}</p>
          <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}
      {remote.state === 'ready' && remote.data.entries.length === 0 && (
        <div className="empty">
          <p>
            {scope === 'daily'
              ? 'Nobody has finished today\'s Daily Challenge yet. Be the first!'
              : 'No results here yet. Win a public match or play the Daily Challenge to put your name here!'}
          </p>
          {!profile.account.linked && <p className="muted">Create an account (Menu &gt; Account &amp; backup) to appear on the boards.</p>}
        </div>
      )}
      {remote.state === 'ready' && remote.data.entries.length > 0 && (
        <>
          {remote.data.me && (
            <p className="banner banner-info">
              Your rank: <strong>#{remote.data.me.rank}</strong> with {remote.data.me.score} points ({remote.data.me.wpm.toFixed(0)} WPM).
            </p>
          )}
          <div className="table-wrap">
            <table className="results-table">
              <caption className="sr-only">Online leaderboard</caption>
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
                {remote.data.entries.map((e) => (
                  <tr key={`${e.rank}-${e.at}`} className={remote.data.me?.rank === e.rank ? 'row-you' : ''}>
                    <th scope="row">{e.rank}</th>
                    <td>
                      {e.name}
                      {e.account ? <span className="tag">account</span> : null}
                    </td>
                    <td>{e.score}</td>
                    <td>{e.wpm.toFixed(0)}</td>
                    <td>{e.accuracy.toFixed(1)}%</td>
                    <td>{DIFFICULTY_LABEL[e.difficulty as Difficulty] ?? e.difficulty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted center">{remote.data.note}</p>
        </>
      )}
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
                    {h.mode === 'level' ? `Level ${h.levelId}` : h.mode === 'quick' ? 'Practice' : h.mode === 'daily' ? 'Daily' : h.mode === 'friends' ? 'Friends' : 'Online'}{' '}
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

function BadgeWall() {
  const { profile } = useProfile();
  const got = BADGES.filter((b) => profile.badges[b.id]).length;
  return (
    <>
      <p className="muted center">
        {got} of {BADGES.length} badges earned. Each new badge also gives you bonus coins.
      </p>
      <ul className="badge-grid">
        {BADGES.map((b) => {
          const earned = !!profile.badges[b.id];
          return (
            <li key={b.id} className={earned ? 'badge-card badge-on' : 'badge-card'}>
              <strong>{b.name}</strong>
              <span className="muted">{b.desc}</span>
              <small>{earned ? 'Earned' : `Reward: ${b.coins} coins`}</small>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Leaderboard({ go }: { go: Go }) {
  const [tab, setTab] = useState<'mine' | 'online' | 'badges'>('mine');
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
        <button role="tab" aria-selected={tab === 'badges'} className={tab === 'badges' ? 'tab tab-on' : 'tab'} onClick={() => setTab('badges')}>
          Badges
        </button>
      </div>
      <section className="panel" role="tabpanel">
        {tab === 'mine' ? <MyRecords /> : tab === 'online' ? <OnlineBoard /> : <BadgeWall />}
      </section>
    </div>
  );
}
