import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AiTypist,
  calculateScore,
  computeAccuracy,
  computeWpm,
  generateText,
  TRACK_THEME_NAMES,
  type AiProfile,
  type Difficulty,
  type ResultRow,
} from '@typerush/shared';
import { RaceStage } from '../components/RaceStage';
import { ResultsView } from '../components/ResultsView';
import type { HudStats, StandingRow } from '../components/Hud';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import type { Reward } from '../lib/rewards';
import { TypingSession } from '../lib/typingSession';
import { useTypingInput } from '../lib/useTypingInput';
import {
  emptyRenderState,
  levelTrack,
  seededTrack,
  type RenderCar,
  type RenderState,
} from '../render/raceRenderer';

export interface SoloConfig {
  mode: 'level' | 'quick' | 'daily';
  levelId?: number;
  difficulty: Difficulty;
  tier: number;
  chars: number;
  /** Minimum accuracy to clear a level (levels only). */
  minAccuracy: number | null;
  opponents: AiProfile[];
  seed: number;
  title: string;
}

interface Props {
  config: SoloConfig;
  onExit: () => void;
  onRetry: () => void;
  onNext?: () => void;
}

type Phase = 'ready' | 'countdown' | 'racing' | 'paused' | 'finishing' | 'finished';

const YOU = 'you';
const COUNTDOWN_SECONDS = 3;

interface Outcome {
  rows: ResultRow[];
  cleared: boolean;
  stars: number;
  you: ResultRow;
}

function computeOutcome(config: SoloConfig, session: TypingSession, textLength: number): Outcome {
  const playerMs = session.finishedAtMs ?? 1;
  const bots = config.opponents.map((profile, i) => {
    const sim = new AiTypist(profile, textLength, botSeed(config.seed, i));
    sim.update(1e9);
    return { profile, sim };
  });
  const entries = [
    { id: YOU, finishMs: playerMs },
    ...bots.map((b) => ({ id: b.profile.id, finishMs: b.sim.finishMs ?? 1e9 })),
  ].sort((a, b) => a.finishMs - b.finishMs);
  const positionOf = (id: string) => entries.findIndex((e) => e.id === id) + 1;
  const total = entries.length;

  const make = (
    id: string,
    name: string,
    car: ResultRow['car'],
    finishMs: number,
    correct: number,
    errors: number,
    isBot: boolean,
  ): ResultRow => {
    const position = positionOf(id);
    const wpm = computeWpm(correct, finishMs);
    const accuracy = computeAccuracy(correct, errors);
    return {
      playerId: id,
      name,
      car,
      position,
      finished: true,
      finishMs,
      wpm,
      accuracy,
      progressPct: 100,
      disqualified: false,
      left: false,
      isBot,
      score: calculateScore({
        position,
        totalRacers: total,
        wpm,
        accuracy,
        finished: true,
        progress: 1,
        difficulty: config.difficulty,
      }),
    };
  };

  const rows = [
    make(YOU, '', 'rocket', playerMs, session.correct, session.errors, false),
    ...bots.map((b) =>
      make(b.profile.id, b.profile.name, b.profile.car, b.sim.finishMs ?? 1e9, b.sim.correct, b.sim.errors, true),
    ),
  ].sort((a, b) => a.position - b.position);

  const you = rows.find((r) => r.playerId === YOU)!;
  const cleared = config.mode === 'level' && config.minAccuracy !== null && you.accuracy >= config.minAccuracy;
  const stars = cleared ? (you.position === 1 ? 3 : you.position < total ? 2 : 1) : 0;
  return { rows, cleared, stars, you };
}

function botSeed(seed: number, index: number): number {
  return (seed * 31 + index * 7919 + 17) >>> 0;
}

export function SoloRace({ config, onExit, onRetry, onNext }: Props) {
  const { profile, addRace } = useProfile();
  const reduceMotion = profile.settings.reduceMotion;

  const text = useMemo(
    () => generateText(config.difficulty, config.chars, config.seed, config.tier),
    [config.difficulty, config.chars, config.seed, config.tier],
  );

  const sessionRef = useRef<TypingSession>(new TypingSession(text));
  const aisRef = useRef<AiTypist[]>(
    config.opponents.map((p, i) => new AiTypist(p, text.length, botSeed(config.seed, i))),
  );
  const phaseRef = useRef<Phase>('ready');
  const raceMsRef = useRef(0);
  const countdownLeft = useRef(COUNTDOWN_SECONDS);
  const lastBeep = useRef(0);
  const goUntil = useRef(0);
  const recentKeys = useRef<number[]>([]);
  const savedRef = useRef(false);
  const finishedAtWall = useRef(0);
  const renderRef = useRef<RenderState>({
    ...emptyRenderState(),
    track: config.mode === 'level' && config.levelId ? levelTrack(config.levelId) : seededTrack(config.seed, config.difficulty),
  });
  const display = useRef<Map<string, { progress: number; last: number; speed: number }>>(new Map());

  const [phase, setPhaseState] = useState<Phase>('ready');
  const [pos, setPos] = useState(0);
  const [wrongTick, setWrongTick] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hud, setHud] = useState<HudStats>({ wpm: 0, accuracy: 100, elapsedMs: 0, progressPct: 0 });
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // -------------------------------------------------------------- controls

  const startCountdown = useCallback(() => {
    audio.unlock();
    audio.click();
    countdownLeft.current = COUNTDOWN_SECONDS;
    lastBeep.current = 0;
    setPhase('countdown');
  }, [setPhase]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'racing') return;
    audio.stopEngine();
    setPhase('paused');
  }, [setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    audio.startEngine();
    setPhase('racing');
  }, [setPhase]);

  const finishPlayer = useCallback(() => {
    const result = computeOutcome(config, sessionRef.current, text.length);
    // The player's name is filled in here so the row reads naturally.
    result.you.name = profile.name;
    result.you.car = profile.car;
    audio.stopEngine();
    finishedAtWall.current = performance.now();
    setOutcome(result);
    setPhase('finishing');

    if (!savedRef.current) {
      savedRef.current = true;
      const earned = addRace({
        mode: config.mode,
        difficulty: config.difficulty,
        levelId: config.levelId,
        wpm: result.you.wpm,
        accuracy: result.you.accuracy,
        score: result.you.score.total,
        position: result.you.position,
        racers: result.rows.length,
        finished: true,
        stars: result.stars,
      });
      setReward(earned);
    }
  }, [addRace, config, profile.car, profile.name, setPhase, text.length]);

  const onChar = useCallback(
    (ch: string) => {
      if (phaseRef.current !== 'racing') return;
      const session = sessionRef.current;
      const result = session.press(ch, raceMsRef.current);
      if (result === 'ignored') return;
      if (result === 'wrong') {
        audio.wrong();
        setWrongTick((t) => t + 1);
        return;
      }
      audio.key();
      recentKeys.current.push(performance.now());
      setPos(session.pos);
      if (result === 'done') finishPlayer();
    },
    [finishPlayer],
  );

  const typingEnabled = phase === 'racing';
  const { inputRef, onInput, focus } = useTypingInput(typingEnabled, onChar);

  // -------------------------------------------------------------- game loop

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudClock = 0;
    const session = sessionRef.current;

    const buildCars = (dt: number): RenderCar[] => {
      const len = text.length;
      const finished = phaseRef.current === 'finishing' || phaseRef.current === 'finished';
      const make = (id: string, name: string, car: RenderCar['car'], target: number, isYou: boolean, position?: number) => {
        const d = display.current.get(id) ?? { progress: 0, last: 0, speed: 0 };
        d.progress += (target - d.progress) * Math.min(1, dt * 14);
        const rate = dt > 0 ? ((target - d.last) * len) / dt / 8 : 0; // 8 chars/sec ~ full speed
        d.speed += (Math.min(1, Math.max(0, rate)) - d.speed) * Math.min(1, dt * 5);
        d.last = target;
        display.current.set(id, d);
        const done = target >= 1;
        return {
          id,
          name,
          car,
          progress: done ? target : d.progress,
          speed: done ? Math.max(0, d.speed - 0.2) : d.speed,
          isYou,
          finished: done,
          position: done ? position : null,
        } satisfies RenderCar;
      };
      const ranks = outcome?.rows ?? [];
      const posOf = (id: string) => ranks.find((r) => r.playerId === id)?.position;
      const cars: RenderCar[] = aisRef.current.map((ai) =>
        make(ai.profile.id, ai.profile.name, ai.profile.car, ai.progress, false, posOf(ai.profile.id)),
      );
      cars.push({
        ...make(YOU, profile.name, profile.car, session.progress(), true, posOf(YOU)),
        skin: profile.skin,
        trail: profile.trail,
      });
      void finished;
      return cars;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const phase = phaseRef.current;

      if (phase === 'countdown') {
        countdownLeft.current -= dt;
        const shown = Math.ceil(countdownLeft.current);
        if (shown !== lastBeep.current && shown > 0) {
          lastBeep.current = shown;
          audio.countdownBeep(false);
          setCountdown(shown);
        }
        if (countdownLeft.current <= 0) {
          audio.countdownBeep(true);
          goUntil.current = now + 700;
          setCountdown(0);
          raceMsRef.current = 0;
          audio.startEngine();
          setPhase('racing');
        }
      } else if (phase === 'racing' || phase === 'finishing') {
        raceMsRef.current += dt * 1000;
        for (const ai of aisRef.current) ai.update(raceMsRef.current);
        if (goUntil.current && now > goUntil.current) {
          goUntil.current = 0;
          setCountdown(null);
        }
        if (phase === 'finishing' && now - finishedAtWall.current > 1800) setPhase('finished');
      }

      // Rolling speed of the player's car (keys over the last 1.5s).
      const cutoff = now - 1500;
      recentKeys.current = recentKeys.current.filter((t) => t > cutoff);
      const keysPerSec = recentKeys.current.length / 1.5;

      const state = renderRef.current;
      const racing = phase === 'racing' || phase === 'finishing' || phase === 'countdown';
      state.reduceMotion = reduceMotion;
      state.time += dt;
      state.cars = buildCars(dt);
      const youCar = state.cars[state.cars.length - 1];
      const moving = phase === 'racing' || phase === 'finishing';
      state.scroll += (moving ? 80 + youCar.speed * 700 : racing ? 40 : 25) * dt;
      if (phase === 'racing') audio.setEngineSpeed(Math.min(1, keysPerSec / 8));

      hudClock += dt;
      if (hudClock > 0.12) {
        hudClock = 0;
        const raceMs = raceMsRef.current;
        if (phase === 'racing' || phase === 'finishing' || phase === 'finished') {
          setHud({
            wpm: session.liveWpm(raceMs),
            accuracy: session.accuracy(),
            elapsedMs: session.finishedAtMs ?? raceMs,
            progressPct: session.progress() * 100,
          });
        }
        const rows: StandingRow[] = [
          {
            id: YOU,
            name: profile.name,
            progressPct: session.progress() * 100,
            you: true,
            finished: session.done,
            position: outcome?.rows.find((r) => r.playerId === YOU)?.position ?? null,
          },
          ...aisRef.current.map((ai) => ({
            id: ai.profile.id,
            name: ai.profile.name,
            progressPct: ai.progress * 100,
            you: false,
            finished: ai.finished,
            position: outcome?.rows.find((r) => r.playerId === ai.profile.id)?.position ?? null,
          })),
        ].sort((a, b) => b.progressPct - a.progressPct);
        setStandings(rows);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [outcome, profile.car, profile.name, profile.skin, profile.trail, reduceMotion, setPhase, text.length]);

  // Pause with Escape or when the tab is hidden; always silence the engine on exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (phaseRef.current === 'racing') pause();
      else if (phaseRef.current === 'paused') resume();
    };
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      audio.stopEngine();
    };
  }, [pause, resume]);

  // -------------------------------------------------------------- render

  if (phase === 'finished' && outcome) {
    const { rows, cleared, stars, you } = outcome;
    const banner =
      config.mode === 'level'
        ? cleared
          ? { tone: 'good' as const, text: 'Level cleared! The next level is unlocked.' }
          : {
              tone: 'warn' as const,
              text: `Not cleared yet: this level needs ${config.minAccuracy}% accuracy and you had ${you.accuracy.toFixed(1)}%. Slow down a little and try again.`,
            }
        : config.mode === 'daily'
          ? {
              tone: 'info' as const,
              text: `Daily Challenge: everyone gets this same text today. Your best today: ${Math.round(
                Math.max(profile.daily?.best.wpm ?? 0, you.wpm),
              )} WPM. Come back tomorrow for a new one!`,
            }
          : null;
    return (
      <ResultsView
        rows={rows}
        youId={YOU}
        difficulty={config.difficulty}
        banner={banner}
        stars={config.mode === 'level' ? stars : null}
        reward={reward}
        title={config.mode === 'daily' ? 'Daily Challenge complete' : undefined}
        reduceMotion={reduceMotion}
        actions={
          <>
            <button className="btn btn-primary" onClick={onRetry} autoFocus>
              {cleared || config.mode !== 'level' ? 'Race again' : 'Retry level'}
            </button>
            {cleared && onNext && (
              <button className="btn btn-accent" onClick={onNext}>
                Next level
              </button>
            )}
            <button className="btn" onClick={onExit}>
              {config.mode === 'level' ? 'Level select' : 'Back to menu'}
            </button>
          </>
        }
      />
    );
  }

  const overlay =
    phase === 'ready' ? (
      <div className="overlay-card">
        <h2>{config.title}</h2>
        <p className="muted">
          {config.opponents.length} AI {config.opponents.length === 1 ? 'opponent' : 'opponents'} &middot;{' '}
          {text.length} characters
          {config.minAccuracy ? ` - clear it with ${config.minAccuracy}%+ accuracy` : ''}
        </p>
        <p>Type the text exactly as shown. Wrong keys never move your car, and there is no backspace to worry about.</p>
        <button className="btn btn-primary btn-lg" onClick={startCountdown} autoFocus>
          Start race
        </button>
      </div>
    ) : phase === 'paused' ? (
      <div className="overlay-card">
        <h2>Paused</h2>
        <p className="muted">The AI cars and the clock are frozen.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={resume} autoFocus>
            Resume
          </button>
          <button className="btn" onClick={onRetry}>
            Restart
          </button>
          <button className="btn btn-ghost" onClick={onExit}>
            Quit
          </button>
        </div>
      </div>
    ) : null;

  return (
    <RaceStage
      stateRef={renderRef}
      lanes={config.opponents.length + 1}
      trackName={TRACK_THEME_NAMES[renderRef.current.track?.theme ?? 0]}
      hud={hud}
      standings={standings}
      text={text}
      pos={pos}
      wrongTick={wrongTick}
      typingActive={phase === 'racing'}
      countdown={countdown}
      onTap={focus}
      inputRef={inputRef}
      onInput={onInput}
      overlay={overlay}
      toolbar={
        phase === 'racing' || phase === 'countdown' ? (
          <>
            <button className="btn btn-ghost" onClick={pause} disabled={phase !== 'racing'}>
              Pause (Esc)
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              Quit
            </button>
          </>
        ) : null
      }
    />
  );
}
