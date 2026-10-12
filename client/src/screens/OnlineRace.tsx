import { useCallback, useEffect, useRef, useState } from 'react';
import { TRACK_THEME_NAMES, type Difficulty } from '@typerush/shared';
import { RaceStage } from '../components/RaceStage';
import { ResultsView } from '../components/ResultsView';
import type { HudStats, StandingRow } from '../components/Hud';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import type { Reward } from '../lib/rewards';
import { TypingSession } from '../lib/typingSession';
import { useTypingInput } from '../lib/useTypingInput';
import { useOnline } from '../net/OnlineContext';
import {
  emptyRenderState,
  seededTrack,
  type RenderCar,
  type RenderState,
} from '../render/raceRenderer';
import type { Go } from '../routes';

/**
 * Online race (private rooms and public matches).
 * The server owns the start time, validates progress and decides the final results.
 * This component only sends "how many characters I have typed correctly" and draws what the server says.
 */
export function OnlineRace({ go }: { go: Go }) {
  const online = useOnline();
  const { profile, addRace } = useProfile();
  const reduceMotion = profile.settings.reduceMotion;
  const room = online.room!;
  const text = room.text ?? '';

  const roomRef = useRef(room);
  roomRef.current = room;
  const selfIdRef = useRef(online.selfId);
  selfIdRef.current = online.selfId;
  const disqualifiedRef = useRef(online.disqualified);
  disqualifiedRef.current = online.disqualified;

  const sessionRef = useRef<TypingSession | null>(null);
  if (!sessionRef.current || sessionRef.current.text !== text) {
    const session = new TypingSession(text);
    const mine = room.players.find((p) => p.id === online.selfId);
    if (mine && mine.correct > 0) session.restore(mine.correct, mine.errors); // came back mid-race
    sessionRef.current = session;
  }
  const session = sessionRef.current;

  // Same room code => same theme and layout on every player's screen.
  const renderRef = useRef<RenderState>({ ...emptyRenderState(), track: seededTrack(room.code, room.difficulty) });
  const display = useRef<Map<string, { progress: number; last: number; speed: number }>>(new Map());
  const recentKeys = useRef<number[]>([]);
  const dirty = useRef(false);
  const lastShown = useRef(-1);
  const goDone = useRef(false);
  const goUntil = useRef(0);
  const savedRef = useRef(false);
  const [reward, setReward] = useState<Reward | null>(null);

  const [pos, setPos] = useState(session.pos);
  const [wrongTick, setWrongTick] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [typingEnabled, setTypingEnabled] = useState(false);
  const [hud, setHud] = useState<HudStats>({ wpm: 0, accuracy: 100, elapsedMs: 0, progressPct: 0 });
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canType = useCallback(() => {
    const r = roomRef.current;
    if (r.startAt === null || r.status === 'finished' || session.done || disqualifiedRef.current) return false;
    const me = r.players.find((p) => p.id === selfIdRef.current);
    if (!me || me.left || me.disqualified) return false;
    return online.serverNow() >= r.startAt;
  }, [online, session]);

  const flush = useCallback(() => {
    if (!dirty.current) return;
    if (online.sendProgress(session.correct, session.errors)) dirty.current = false;
  }, [online, session]);

  const onChar = useCallback(
    (ch: string) => {
      if (!canType()) return;
      const raceMs = online.serverNow() - (roomRef.current.startAt ?? 0);
      const result = session.press(ch, raceMs);
      if (result === 'ignored') return;
      if (result === 'wrong') {
        audio.wrong();
        setWrongTick((t) => t + 1);
        dirty.current = true; // errors count towards accuracy
        return;
      }
      audio.key();
      recentKeys.current.push(performance.now());
      setPos(session.pos);
      dirty.current = true;
      if (result === 'done') {
        audio.stopEngine();
        flush();
      }
    },
    [canType, flush, online, session],
  );

  const { inputRef, onInput, focus } = useTypingInput(typingEnabled, onChar);

  // Send progress ~10 times per second while something changed. Retries automatically after a reconnect.
  useEffect(() => {
    const id = window.setInterval(flush, 100);
    return () => window.clearInterval(id);
  }, [flush]);

  // Animation / sync loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudClock = 0;
    let engineOn = false;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const r = roomRef.current;
      const serverNow = online.serverNow();
      const startAt = r.startAt ?? serverNow + 1e9;
      const msLeft = startAt - serverNow;
      const raceMs = Math.max(0, serverNow - startAt);
      const meId = selfIdRef.current;
      const len = text.length;

      // Countdown overlay: 3, 2, 1 from the server's start time, then a short "GO!".
      if (r.status !== 'finished' && r.startAt !== null) {
        if (msLeft > 0) {
          const shown = Math.ceil(msLeft / 1000);
          if (shown !== lastShown.current) {
            lastShown.current = shown;
            audio.countdownBeep(false);
            setCountdown(shown);
          }
        } else if (!goDone.current) {
          goDone.current = true;
          if (msLeft > -1500) {
            // Only celebrate GO if we were actually here for the start (not after a reconnect).
            audio.countdownBeep(true);
            setCountdown(0);
            goUntil.current = now + 700;
          }
        }
        if (goUntil.current && now > goUntil.current) {
          goUntil.current = 0;
          setCountdown(null);
        }
      } else {
        setCountdown(null);
      }

      const allowed = canType();
      setTypingEnabled((prev) => (prev === allowed ? prev : allowed));

      // Engine sound while actively racing
      const racingNow = allowed;
      if (racingNow && !engineOn) {
        audio.startEngine();
        engineOn = true;
      } else if (!racingNow && engineOn) {
        audio.stopEngine();
        engineOn = false;
      }
      const cutoff = now - 1500;
      recentKeys.current = recentKeys.current.filter((t) => t > cutoff);
      const keysPerSec = recentKeys.current.length / 1.5;
      if (engineOn) audio.setEngineSpeed(Math.min(1, keysPerSec / 8));

      // Cars
      const smooth = (id: string, target: number) => {
        const d = display.current.get(id) ?? { progress: 0, last: 0, speed: 0 };
        d.progress += (target - d.progress) * Math.min(1, dt * (id === meId ? 14 : 8));
        const rate = dt > 0 ? ((target - d.last) * len) / dt / 8 : 0;
        d.speed += (Math.min(1, Math.max(0, rate)) - d.speed) * Math.min(1, dt * 4);
        d.last = target;
        display.current.set(id, d);
        return d;
      };
      const others = r.players.filter((p) => p.id !== meId);
      const me = r.players.find((p) => p.id === meId);
      const cars: RenderCar[] = others.map((p) => {
        const target = len > 0 ? p.correct / len : 0;
        const d = smooth(p.id, target);
        return {
          id: p.id,
          name: p.name,
          car: p.car,
          skin: p.skin,
          trail: p.trail,
          progress: p.finished ? 1 : d.progress,
          speed: p.finished || p.left ? 0 : d.speed,
          isYou: false,
          finished: p.finished,
          position: p.position,
          dnf: p.left || p.disqualified,
          offline: !p.connected && !p.left,
        };
      });
      const myTarget = session.progress();
      const md = smooth(meId ?? 'me', myTarget);
      cars.push({
        id: meId ?? 'me',
        name: profile.name,
        car: me?.car ?? profile.car,
        progress: session.done ? 1 : md.progress,
        speed: session.done ? 0 : md.speed,
        isYou: true,
        finished: session.done,
        position: me?.position ?? null,
        offline: online.status !== 'online',
        skin: profile.skin,
        trail: profile.trail,
      });

      const state = renderRef.current;
      state.reduceMotion = reduceMotion;
      state.view = profile.settings.raceView;
      state.wpm = session.liveWpm(raceMs);
      state.time += dt;
      state.cars = cars;
      state.scroll += (racingNow ? 80 + md.speed * 700 : 30) * dt;

      hudClock += dt;
      if (hudClock > 0.12) {
        hudClock = 0;
        if (r.startAt !== null && serverNow >= r.startAt) {
          setHud({
            wpm: session.liveWpm(raceMs),
            accuracy: session.accuracy(),
            elapsedMs: session.finishedAtMs ?? raceMs,
            progressPct: session.progress() * 100,
          });
        }
        const rows: StandingRow[] = r.players
          .map((p) => ({
            id: p.id,
            name: p.name,
            progressPct: p.id === meId ? session.progress() * 100 : len > 0 ? (p.correct / len) * 100 : 0,
            you: p.id === meId,
            finished: p.finished || (p.id === meId && session.done),
            position: p.position,
            status: p.disqualified ? 'Disqualified' : p.left ? 'Left' : !p.connected ? 'Offline' : undefined,
          }))
          .sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished && b.finished) return (a.position ?? 99) - (b.position ?? 99);
            return b.progressPct - a.progressPct;
          });
        setStandings(rows);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      audio.stopEngine();
    };
  }, [canType, online, profile.car, profile.name, profile.skin, profile.trail, profile.settings.raceView, reduceMotion, session, text.length]);

  // Save the validated result to the local profile exactly once.
  const results = online.results;
  const myRow = results?.rows.find((r) => r.playerId === online.selfId);
  useEffect(() => {
    if (!results || !myRow || savedRef.current) return;
    savedRef.current = true;
    const earned = addRace({
      mode: room.type === 'public' ? 'public' : 'friends',
      difficulty: room.difficulty,
      wpm: myRow.wpm,
      accuracy: myRow.accuracy,
      score: myRow.score.total,
      position: myRow.position,
      racers: results.rows.length,
      finished: myRow.finished,
    });
    setReward(earned);
  }, [addRace, myRow, results, room.difficulty, room.type]);

  const leaveToMenu = async () => {
    await online.leave();
    go({ name: 'home' });
  };

  const findAgain = async (difficulty: Difficulty) => {
    setBusy(true);
    setActionError(null);
    await online.leave();
    const res = await online.findMatch(
      { name: profile.name, car: profile.car, skin: profile.skin, trail: profile.trail, token: profile.playerToken },
      difficulty,
    );
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      go({ name: 'match', difficulty });
    }
  };

  // ------------------------------------------------------------------ results

  if (room.status === 'finished' && results) {
    const isPrivate = room.type === 'private';
    return (
      <>
        <ResultsView
          rows={results.rows}
          youId={online.selfId ?? ''}
          difficulty={room.difficulty}
          reduceMotion={reduceMotion}
          reward={reward}
          banner={
            myRow?.disqualified
              ? { tone: 'warn', text: 'You were disqualified because your typing speed was not humanly possible.' }
              : { tone: 'info', text: 'Results were calculated and verified by the server.' }
          }
          actions={
            <>
              {isPrivate ? (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  autoFocus
                  onClick={async () => {
                    setBusy(true);
                    const res = await online.rematch();
                    setBusy(false);
                    if (!res.ok) setActionError(res.error);
                  }}
                >
                  Rematch (back to lobby)
                </button>
              ) : (
                <button className="btn btn-primary" disabled={busy} autoFocus onClick={() => findAgain(room.difficulty)}>
                  Find another match
                </button>
              )}
              <button className="btn" onClick={leaveToMenu}>
                Back to menu
              </button>
            </>
          }
        />
        {actionError && (
          <p className="banner banner-warn" role="alert">
            {actionError}
          </p>
        )}
      </>
    );
  }

  // ------------------------------------------------------------------ live race

  const me = room.players.find((p) => p.id === online.selfId);
  const waitingForResults = room.status === 'finished' && !results;
  let overlay: React.ReactNode = null;
  if (waitingForResults) {
    overlay = (
      <div className="overlay-card" role="status">
        <h2>Race over</h2>
        <p className="muted">Waiting for the final results from the server...</p>
      </div>
    );
  } else if (online.disqualified) {
    overlay = null;
  } else if (session.done && me) {
    overlay = (
      <div className="overlay-card" role="status">
        <h2>You finished{me.position ? ` in position ${me.position}` : ''}!</h2>
        <p className="muted">Waiting for the other racers (they have a limited time to finish)...</p>
      </div>
    );
  } else if (room.status === 'countdown') {
    overlay = (
      <div className="overlay-card overlay-light" role="status">
        <h2>Get ready!</h2>
        <p className="muted">Hands on the keyboard. Typing unlocks at GO.</p>
      </div>
    );
  }

  return (
    <>
      {online.status !== 'online' && (
        <p className="banner banner-warn" role="alert">
          Connection lost. Trying to reconnect... If you are back within about 30 seconds your car keeps its place.
        </p>
      )}
      <RaceStage
        stateRef={renderRef}
        lanes={Math.max(2, room.players.length)}
        trackName={TRACK_THEME_NAMES[renderRef.current.track?.theme ?? 0]}
        hud={hud}
        standings={standings}
        text={text}
        pos={pos}
        wrongTick={wrongTick}
        typingActive={typingEnabled}
        countdown={countdown}
        onTap={focus}
        inputRef={inputRef}
        onInput={onInput}
        overlay={overlay}
        alert={online.disqualified}
        toolbar={
          room.status !== 'finished' ? (
            confirmLeave ? (
              <>
                <span>Leave and forfeit this race?</span>
                <button className="btn btn-danger" onClick={leaveToMenu}>
                  Yes, leave
                </button>
                <button className="btn" onClick={() => setConfirmLeave(false)} autoFocus>
                  Stay
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>
                Leave race
              </button>
            )
          ) : null
        }
      />
    </>
  );
}
