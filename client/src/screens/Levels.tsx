import { useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_BLURB,
  DIFFICULTY_LABEL,
  LEVELS,
  TRACK_THEME_NAMES,
  isLevelUnlocked,
  levelsFor,
  randomSeed,
  type Difficulty,
} from '@typerush/shared';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import { totalStars } from '../lib/storage';
import type { Go } from '../routes';
import { levelToConfig } from './levelConfig';

export function Levels({ go }: { go: Go }) {
  const { profile } = useProfile();
  const firstOpen =
    LEVELS.find((l) => !profile.completed[l.id] && isLevelUnlocked(l.id, profile.completed))?.difficulty ?? 'easy';
  const [tab, setTab] = useState<Difficulty>(firstOpen);
  const cleared = Object.keys(profile.completed).length;

  return (
    <div className="page">
      <TopBar title="Levels" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <p className="muted center">
        {cleared} of {LEVELS.length} levels cleared &middot; {totalStars(profile)} / {LEVELS.length * 3} stars. Finish a
        level with enough accuracy to unlock the next one.
      </p>

      <div className="tabs" role="tablist" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => {
          const done = levelsFor(d).filter((l) => profile.completed[l.id]).length;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={tab === d}
              className={tab === d ? 'tab tab-on' : 'tab'}
              onClick={() => setTab(d)}
            >
              {DIFFICULTY_LABEL[d]} <small>{done}/{levelsFor(d).length}</small>
            </button>
          );
        })}
      </div>
      <p className="muted center">{DIFFICULTY_BLURB[tab]}</p>

      <div className="level-grid" role="tabpanel">
        {levelsFor(tab).map((level) => {
          const unlocked = isLevelUnlocked(level.id, profile.completed);
          const stars = profile.completed[level.id] ?? 0;
          return (
            <button
              key={level.id}
              className={`level-card ${unlocked ? '' : 'level-locked'} ${stars ? 'level-done' : ''}`}
              disabled={!unlocked}
              aria-label={`Level ${level.id}, ${level.name}. ${unlocked ? (stars ? `${stars} stars` : 'Not cleared yet') : 'Locked. Clear the previous level first.'}`}
              onClick={() => {
                audio.unlock();
                audio.click();
                go({ name: 'solo', config: levelToConfig(level, randomSeed()), attempt: 0 });
              }}
            >
              <span className="level-num">{level.id}</span>
              <strong>{level.name}</strong>
              <small className="track-tag">{TRACK_THEME_NAMES[level.theme]} &middot; {level.turns} {level.turns === 1 ? 'turn' : 'turns'}</small>
              <span className="stars" aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={i <= stars ? 'star star-on' : 'star'}>
                    &#9733;
                  </span>
                ))}
              </span>
              <small className="muted">
                {level.chars} chars &middot; AI up to {Math.round(level.topBotWpm)} WPM &middot; {level.minAccuracy}%+
                accuracy
              </small>
              {!unlocked && <span className="lock">Locked</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
