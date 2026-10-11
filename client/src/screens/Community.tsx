import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DIFFICULTY_LABEL, type Difficulty } from '@typerush/shared';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { AdSlot, SupportLink } from '../components/Support';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import {
  addFriend,
  createClass,
  deleteClass,
  fetchClass,
  fetchClasses,
  fetchCup,
  fetchFriends,
  joinClass,
  leaveClass,
  newClassRound,
  removeFriend,
  type ApiResult,
  type BoardEntry,
  type ClassDetail,
  type ClassSummary,
  type CupData,
  type FriendsData,
} from '../lib/cloud';
import { useProfile } from '../lib/ProfileContext';
import type { Go } from '../routes';
import { assignmentConfig } from './levelConfig';

type Tab = 'friends' | 'cup' | 'class';

/** Loads something from the server and lets the screen reload it. */
function useLoad<T>(load: () => Promise<ApiResult<T>>, enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: string | null }>({ loading: enabled, data: null, error: null });
  const reload = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await load();
    setState(res.ok ? { loading: false, data: res.data, error: null } : { loading: false, data: null, error: res.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...state, reload };
}

function BoardTable({ entries, youName }: { entries: (BoardEntry & { you?: boolean })[]; youName: string }) {
  if (entries.length === 0) return <p className="muted">No results yet. Be the first!</p>;
  return (
    <div className="table-wrap">
      <table className="results-table">
        <caption className="sr-only">Ranking</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Racer</th>
            <th scope="col">Points</th>
            <th scope="col">WPM</th>
            <th scope="col">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.rank}-${e.name}-${e.at}`} className={e.you || (e.you === undefined && e.name === youName) ? 'row-you' : ''}>
              <th scope="row">{e.rank}</th>
              <td>{e.name}</td>
              <td>{e.score}</td>
              <td>{e.wpm.toFixed(0)}</td>
              <td>{e.accuracy.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p className="banner banner-warn" role="alert">
      {children}
    </p>
  );
}

function SignInNeeded({ go }: { go: Go }) {
  return (
    <section className="panel">
      <p>This needs a free TypeRush account (no email or password: you get a recovery code).</p>
      <button className="btn btn-primary" onClick={() => go({ name: 'account' })}>
        Open Account &amp; backup
      </button>
    </section>
  );
}

function timeLeft(endsAt: number): string {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'ending now';
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 24 ? `${Math.floor(hours / 24)} days ${hours % 24} h left` : `${hours} h left`;
}

// ---------------------------------------------------------------- friends

function FriendsTab({ go }: { go: Go }) {
  const { profile } = useProfile();
  const linked = profile.account.linked;
  const token = profile.playerToken;
  const load = useCallback(() => fetchFriends(token), [token]);
  const { loading, data, error, reload } = useLoad<FriendsData>(load, linked);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!linked) return <SignInNeeded go={go} />;

  const add = async () => {
    audio.click();
    setBusy(true);
    setNote(null);
    const res = await addFriend(token, code);
    setBusy(false);
    if (res.ok) {
      setNote(`You and ${res.data.name} are now friends.`);
      setCode('');
      void reload();
    } else setNote(res.error);
  };

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
    } catch {
      setNote('Could not copy. Please write the code down.');
    }
  };

  return (
    <>
      <section className="panel">
        <h2 className="section-title">Your friend code</h2>
        {data ? <span className="code-pill">{data.code}</span> : <p className="muted">{loading ? 'Loading...' : ''}</p>}
        <p className="muted">Send this code to a friend. They type it below and you are friends (both ways). Only share it with people you know.</p>
        {data && (
          <button className="btn" onClick={copy}>
            {copied ? 'Copied!' : 'Copy my code'}
          </button>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Add a friend</h2>
        <label className="field">
          <span>Friend code</span>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="FR-XXXXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} />
        </label>
        <button className="btn btn-primary" onClick={add} disabled={busy || code.trim().length < 6}>
          Add friend
        </button>
        {note && <p role="status">{note}</p>}
      </section>

      {error && <Problem>{error}</Problem>}

      {data && (
        <>
          <section className="panel">
            <h2 className="section-title">This week among friends</h2>
            <p className="muted">Best result of the last 7 days (Daily Challenges, Cup and public matches).</p>
            <BoardTable entries={data.board} youName={profile.name} />
          </section>
          <section className="panel">
            <h2 className="section-title">Friends ({data.friends.length})</h2>
            {data.friends.length === 0 ? (
              <p className="muted">No friends yet.</p>
            ) : (
              <ul className="list-plain">
                {data.friends.map((f) => (
                  <li key={f.code} className="list-item">
                    <span>
                      <strong>{f.name}</strong>{' '}
                      <span className="muted">{f.weekBest ? `best this week: ${f.weekBest.score} pts, ${Math.round(f.weekBest.wpm)} WPM` : 'no result this week'}</span>
                    </span>
                    <button
                      className="btn"
                      onClick={async () => {
                        await removeFriend(token, f.code);
                        void reload();
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- weekly cup

function CupTab({ go }: { go: Go }) {
  const { profile } = useProfile();
  const linked = profile.account.linked;
  const token = linked ? profile.playerToken : null;
  const load = useCallback(() => fetchCup(token), [token]);
  const { loading, data, error } = useLoad<CupData>(load, true);

  const play = () => {
    if (!data) return;
    audio.unlock();
    audio.click();
    go({
      name: 'solo',
      attempt: 0,
      config: assignmentConfig(data.cup, `Weekly Cup (${data.cup.week})`, { kind: 'cup' }),
    });
  };

  const left = data ? data.maxAttempts - data.attemptsUsed : 0;
  return (
    <>
      {error && <Problem>{error}</Problem>}
      {loading && <p className="muted">Loading the Cup... (a sleeping server can take up to a minute)</p>}
      {data && (
        <>
          <section className="panel">
            <h2 className="section-title">Weekly Cup</h2>
            <p>
              Everybody races the <strong>same {DIFFICULTY_LABEL[data.cup.difficulty]} text</strong> this week. Your best of {data.maxAttempts} attempts counts.
              A new Cup starts every Monday. <strong>{timeLeft(data.cup.endsAt)}</strong>.
            </p>
            {!linked ? (
              <SignInNeeded go={go} />
            ) : (
              <>
                <p className="muted">
                  Attempts used: {data.attemptsUsed}/{data.maxAttempts}
                  {data.me ? ` - your rank: #${data.me.rank} of ${data.players}` : ''}
                </p>
                <button className="btn btn-primary" onClick={play} disabled={left <= 0}>
                  {left <= 0 ? 'No attempts left this week' : 'Race now'}
                </button>
              </>
            )}
          </section>
          <section className="panel">
            <h2 className="section-title">Cup ranking ({data.players} players)</h2>
            {!data.persistent && <p className="muted">The server has no database yet, so the ranking resets when it restarts.</p>}
            <BoardTable entries={data.entries} youName={profile.name} />
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- classes

function ClassView({ summary, go, onBack }: { summary: ClassSummary; go: Go; onBack: () => void }) {
  const { profile } = useProfile();
  const token = profile.playerToken;
  const load = useCallback(() => fetchClass(token, summary.id), [token, summary.id]);
  const { loading, data, error, reload } = useLoad<ClassDetail>(load, true);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (error) {
    return (
      <>
        <Problem>{error}</Problem>
        <button className="btn" onClick={onBack}>
          Back to my classes
        </button>
      </>
    );
  }
  if (!data) return <p className="muted">{loading ? 'Loading...' : ''}</p>;
  const c = data.class;
  const play = () => {
    audio.unlock();
    audio.click();
    go({ name: 'solo', attempt: 0, config: assignmentConfig(data.assignment, `${c.name} (round ${c.round})`, { kind: 'class', classId: c.id }) });
  };
  return (
    <>
      <section className="panel">
        <h2 className="section-title">
          {c.name} <span className="tag">{c.owner ? 'teacher' : 'student'}</span>
        </h2>
        <p>
          Round {c.round} &middot; {DIFFICULTY_LABEL[data.assignment.difficulty]} &middot; {data.members} {data.members === 1 ? 'person' : 'people'}. Everyone types the same text.
          Your best attempt in this round counts, and you can try as often as you like.
        </p>
        <p>
          Class code: <span className="code-pill">{c.code}</span>
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={play}>
            Race this round
          </button>
          <button className="btn" onClick={() => void reload()}>
            Refresh ranking
          </button>
          <button className="btn" onClick={onBack}>
            My classes
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Ranking this round</h2>
        <BoardTable entries={data.entries} youName={profile.name} />
        {data.waiting && data.waiting.length > 0 && (
          <p className="muted">Not finished yet: {data.waiting.join(', ')}</p>
        )}
      </section>

      <section className="panel">
        {c.owner ? (
          <>
            <h2 className="section-title">Teacher tools</h2>
            <div className="row">
              <button
                className="btn"
                onClick={async () => {
                  const res = await newClassRound(token, c.id);
                  setNote(res.ok ? `Round ${res.data.round} started with a new text and an empty ranking.` : res.error);
                  void reload();
                }}
              >
                Start a new round (new text)
              </button>
              {!confirm ? (
                <button className="btn btn-danger" onClick={() => setConfirm(true)}>
                  Delete class...
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      const res = await deleteClass(token, c.id);
                      if (res.ok) onBack();
                      else setNote(res.error);
                    }}
                  >
                    Yes, delete it
                  </button>
                  <button className="btn" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <button
            className="btn"
            onClick={async () => {
              await leaveClass(token, c.id);
              onBack();
            }}
          >
            Leave this class
          </button>
        )}
        {note && <p role="status">{note}</p>}
      </section>
    </>
  );
}

function ClassTab({ go }: { go: Go }) {
  const { profile } = useProfile();
  const linked = profile.account.linked;
  const token = profile.playerToken;
  const load = useCallback(() => fetchClasses(token), [token]);
  const { loading, data, error, reload } = useLoad<{ classes: ClassSummary[] }>(load, linked);
  const [open, setOpen] = useState<ClassSummary | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [note, setNote] = useState<string | null>(null);

  if (!linked) return <SignInNeeded go={go} />;
  if (open) {
    return (
      <ClassView
        summary={open}
        go={go}
        onBack={() => {
          setOpen(null);
          void reload();
        }}
      />
    );
  }

  return (
    <>
      <section className="panel">
        <h2 className="section-title">My classes</h2>
        {error && <Problem>{error}</Problem>}
        {loading && <p className="muted">Loading...</p>}
        {data && data.classes.length === 0 && <p className="muted">You are not in a class yet. Join one with a code, or create your own below.</p>}
        {data && data.classes.length > 0 && (
          <ul className="list-plain">
            {data.classes.map((c) => (
              <li key={c.id} className="list-item">
                <span>
                  <strong>{c.name}</strong> <span className="tag">{c.owner ? 'teacher' : 'student'}</span>{' '}
                  <span className="muted">
                    {DIFFICULTY_LABEL[c.difficulty]} &middot; round {c.round}
                  </span>
                </span>
                <button className="btn" onClick={() => setOpen(c)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Join a class</h2>
        <label className="field">
          <span>Class code from your teacher</span>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CL-XXXXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} />
        </label>
        <button
          className="btn btn-primary"
          disabled={code.trim().length < 6}
          onClick={async () => {
            setNote(null);
            const res = await joinClass(token, code);
            if (res.ok) {
              setCode('');
              setOpen(res.data.class);
            } else setNote(res.error);
          }}
        >
          Join
        </button>
      </section>

      <section className="panel">
        <h2 className="section-title">Create a class (teachers)</h2>
        <p className="muted">You get a code to give your students. Everyone races the same text; you can start a new round whenever you like.</p>
        <label className="field">
          <span>Class name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="BCA Sem 3" maxLength={14} autoComplete="off" />
        </label>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} label="Class difficulty" />
        <button
          className="btn btn-primary"
          disabled={name.trim().length < 1}
          onClick={async () => {
            setNote(null);
            const res = await createClass(token, name, difficulty);
            if (res.ok) {
              setName('');
              setOpen(res.data.class);
            } else setNote(res.error);
          }}
        >
          Create class
        </button>
      </section>
      {note && <Problem>{note}</Problem>}
    </>
  );
}

// ---------------------------------------------------------------- page

export function Community({ go, initialTab }: { go: Go; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'cup');
  const tabs: [Tab, string][] = [
    ['cup', 'Weekly Cup'],
    ['friends', 'Friends'],
    ['class', 'Classes'],
  ];
  return (
    <div className="page">
      <TopBar title="Friends, Cup & Classes" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <div className="tabs" role="tablist" aria-label="Community">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'tab tab-on' : 'tab'} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'cup' && <CupTab go={go} />}
        {tab === 'friends' && <FriendsTab go={go} />}
        {tab === 'class' && <ClassTab go={go} />}
      </div>
      <AdSlot />
      <SupportLink />
    </div>
  );
}
