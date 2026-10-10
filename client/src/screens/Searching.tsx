import { useEffect, useState } from 'react';
import { DIFFICULTY_LABEL } from '@typerush/shared';
import { CarArt } from '../components/CarArt';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useOnline } from '../net/OnlineContext';
import type { Go } from '../routes';

/** Shown while a public room is in its lobby: waiting for opponents, then a short fill window. */
export function Searching({ go }: { go: Go }) {
  const online = useOnline();
  const room = online.room!;
  const [waited, setWaited] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setWaited(Math.floor((Date.now() - started) / 1000));
      setTick((t) => t + 1);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const present = room.players.filter((p) => !p.left);
  const autoLeft =
    room.autoStartAt !== null ? Math.max(0, Math.ceil((room.autoStartAt - online.serverNow()) / 1000)) : null;
  void tick;

  const cancel = async () => {
    audio.click();
    await online.cancelMatch();
    go({ name: 'match', difficulty: room.difficulty });
  };

  return (
    <div className="page">
      <TopBar title="Finding opponents" />
      <section className="panel center">
        <div className="spinner" aria-hidden="true" />
        <h2 className="section-title" aria-live="polite">
          {present.length < room.minPlayers
            ? 'Searching for opponents...'
            : autoLeft !== null
              ? `Opponent found! Race starts in ${autoLeft}s (waiting for more players)`
              : 'Starting...'}
        </h2>
        <p className="muted">
          {DIFFICULTY_LABEL[room.difficulty]} &middot; waited {waited}s &middot; {present.length}/{room.maxPlayers}{' '}
          players
        </p>

        <ul className="player-list" aria-label="Players in this match">
          {present.map((p) => (
            <li key={p.id} className="player-row">
              <CarArt car={p.car} size={84} />
              <strong>
                {p.name}
                {p.id === online.selfId ? ' (you)' : ''}
              </strong>
              <span className={p.connected ? 'pill pill-ok' : 'pill'}>{p.connected ? 'Ready' : 'Offline'}</span>
            </li>
          ))}
        </ul>

        {online.noOpponent && present.length < room.minPlayers && (
          <div className="banner banner-info" role="status">
            <p>
              <strong>Nobody else is searching right now.</strong> You can keep waiting here (we will start as soon as
              someone joins), or race AI opponents while you wait.
            </p>
            <div className="row">
              <button className="btn btn-primary" onClick={async () => { await online.cancelMatch(); go({ name: 'quick' }); }}>
                Practice vs AI
              </button>
              <button className="btn" onClick={online.resetMatchFlags}>
                Keep waiting
              </button>
            </div>
          </div>
        )}

        <button className="btn btn-ghost" onClick={cancel}>
          Cancel search
        </button>
      </section>
    </div>
  );
}
