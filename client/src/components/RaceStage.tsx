import { type RefObject } from 'react';
import { Countdown } from './Countdown';
import { Hud, Standings, type HudStats, type StandingRow } from './Hud';
import { TypingPanel } from './TypingPanel';
import { RaceCanvas } from '../render/RaceCanvas';
import type { RenderState } from '../render/raceRenderer';

interface Props {
  stateRef: { current: RenderState };
  lanes: number;
  hud: HudStats;
  standings: StandingRow[];
  text: string;
  pos: number;
  wrongTick: number;
  typingActive: boolean;
  countdown: number | null;
  onTap: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onInput: (event: React.FormEvent<HTMLInputElement>) => void;
  /** Overlay content shown over the typing area (pause menu, waiting messages...). */
  overlay?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Short message shown under the HUD (e.g. disqualification). */
  alert?: string | null;
  /** Name of the track theme, shown on the corner of the race area. */
  trackName?: string;
}

export function RaceStage(props: Props) {
  return (
    <div className="stage">
      <div className="track-wrap">
        <RaceCanvas stateRef={props.stateRef} lanes={props.lanes} label="Race track with all cars. Standings are listed below." />
        <Countdown value={props.countdown} />
        {props.trackName && <span className="track-name">{props.trackName}</span>}
      </div>
      <Hud stats={props.hud} />
      {props.alert && (
        <p className="banner banner-warn" role="alert">
          {props.alert}
        </p>
      )}
      <div className="typing-wrap">
        <TypingPanel
          text={props.text}
          pos={props.pos}
          wrongTick={props.wrongTick}
          active={props.typingActive}
          onTap={props.onTap}
          inputRef={props.inputRef}
          onInput={props.onInput}
        />
        {props.overlay && <div className="overlay">{props.overlay}</div>}
      </div>
      {props.toolbar && <div className="race-toolbar">{props.toolbar}</div>}
      <Standings rows={props.standings} />
    </div>
  );
}
