import { useState } from 'react';
import { DIFFICULTY_LABEL } from '@typerush/shared';
import { CarArt } from '../components/CarArt';
import { ConnectionNotice } from '../components/ConnectionNotice';
import { DifficultyPicker } from '../components/DifficultyPicker';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useOnline } from '../net/OnlineContext';
import type { Go } from '../routes';

function inviteLink(code: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?room=${code}`;
}

export function Lobby({ go }: { go: Go }) {
  const online = useOnline();
  const room = online.room!;
  const me = room.players.find((p) => p.id === online.selfId);
  const isHost = room.hostId === online.selfId;
  const present = room.players.filter((p) => !p.left);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const copy = async (what: 'code' | 'link') => {
    audio.click();
    const value = what === 'code' ? room.code : inviteLink(room.code);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Copy was blocked by your browser. Select the code and copy it manually.');
    }
  };

  const share = async () => {
    try {
      await navigator.share?.({ title: 'TypeRush', text: `Race me on TypeRush! Room code: ${room.code}`, url: inviteLink(room.code) });
    } catch {
      /* user cancelled */
    }
  };

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const res = await action();
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
  };

  const others = present.filter((p) => p.id !== room.hostId);
  const allReady = others.length > 0 && others.every((p) => p.ready && p.connected);
  const startHint =
    present.length < room.minPlayers
      ? 'Waiting for at least one friend to join...'
      : !allReady
        ? 'Waiting for everyone to press Ready...'
        : 'Everyone is ready!';

  return (
    <div className="page">
      <TopBar
        title="Private lobby"
        onBack={async () => {
          await online.leave();
          go({ name: 'home' });
        }}
        backLabel="Leave"
      />
      <ConnectionNotice />

      <section className="panel center">
        <p className="muted">Share this code with your friends</p>
        <div className="room-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>
          {room.code}
        </div>
        <div className="row row-center">
          <button className="btn" onClick={() => copy('code')}>
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </button>
          <button className="btn" onClick={() => copy('link')}>
            {copied === 'link' ? 'Link copied!' : 'Copy invite link'}
          </button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button className="btn" onClick={share}>
              Share...
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">
          Racers ({present.length}/{room.maxPlayers})
        </h2>
        <ul className="player-list" aria-label="Players in the lobby">
          {present.map((p) => {
            const label = !p.connected ? 'Offline' : p.host ? 'Host' : p.ready ? 'Ready' : 'Not ready';
            const cls = !p.connected ? 'pill pill-bad' : p.host || p.ready ? 'pill pill-ok' : 'pill';
            return (
              <li key={p.id} className="player-row">
                <CarArt car={p.car} size={84} />
                <strong>
                  {p.name}
                  {p.id === online.selfId ? ' (you)' : ''}
                </strong>
                <span className={cls}>{label}</span>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, room.maxPlayers - present.length) }, (_, i) => (
            <li key={`empty-${i}`} className="player-row player-empty">
              <span className="muted">Waiting for a player...</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="section-title">Difficulty: {DIFFICULTY_LABEL[room.difficulty]}</h2>
        {isHost ? (
          <DifficultyPicker
            value={room.difficulty}
            onChange={(d) => run(() => online.setDifficulty(d))}
            label="Race difficulty (host only)"
          />
        ) : (
          <p className="muted">Only the host can change the difficulty.</p>
        )}
      </section>

      <section className="panel center">
        {isHost ? (
          <>
            <button
              className="btn btn-primary btn-xl"
              disabled={present.length < room.minPlayers || !allReady || online.status !== 'online'}
              onClick={() => run(() => online.startRace())}
            >
              Start race
            </button>
            <p className="muted" role="status">{startHint}</p>
          </>
        ) : (
          <>
            <button
              className={me?.ready ? 'btn btn-accent btn-xl' : 'btn btn-primary btn-xl'}
              onClick={() => run(() => online.setReady(!me?.ready))}
              aria-pressed={!!me?.ready}
              disabled={online.status !== 'online'}
            >
              {me?.ready ? 'Ready! (tap to undo)' : "I'm ready"}
            </button>
            <p className="muted" role="status">
              {me?.ready ? 'Waiting for the host to start the race...' : 'Press Ready when you are set.'}
            </p>
          </>
        )}
      </section>

      {error && (
        <p className="banner banner-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
