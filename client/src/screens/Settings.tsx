import { useState } from 'react';
import { SCORING_EXPLANATION } from '@typerush/shared';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import { serverUrl } from '../net/OnlineContext';
import type { Go } from '../routes';

export function Settings({ go }: { go: Go }) {
  const { profile, setSettings, reset } = useProfile();
  const s = profile.settings;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="page">
      <TopBar title="Settings" onBack={() => go({ name: 'home' })} backLabel="Menu" />

      <section className="panel">
        <h2 className="section-title">Sound</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.musicOn}
            onChange={(e) => {
              audio.unlock();
              setSettings({ musicOn: e.target.checked });
            }}
          />
          <span>Background music</span>
        </label>
        <label className="field">
          <span>Music volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.musicVolume}
            disabled={!s.musicOn}
            onChange={(e) => setSettings({ musicVolume: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.sfxOn}
            onChange={(e) => {
              audio.unlock();
              setSettings({ sfxOn: e.target.checked });
              if (e.target.checked) audio.click();
            }}
          />
          <span>Sound effects (keys, engine, countdown)</span>
        </label>
        <label className="field">
          <span>Effects volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.sfxVolume}
            disabled={!s.sfxOn}
            onChange={(e) => setSettings({ sfxVolume: Number(e.target.value) })}
            onPointerUp={() => audio.click()}
          />
        </label>
        <p className="muted">All sounds are generated live in your browser. There are no audio files.</p>
      </section>

      <section className="panel">
        <h2 className="section-title">Motion</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.reduceMotion}
            onChange={(e) => setSettings({ reduceMotion: e.target.checked })}
          />
          <span>Reduce motion (no speed lines, flames, confetti or animated scenery)</span>
        </label>
      </section>

      <section className="panel">
        <h2 className="section-title">Typing text size</h2>
        <div className="segmented" role="radiogroup" aria-label="Typing text size">
          {([['m', 'Normal'], ['l', 'Large'], ['xl', 'Extra large']] as const).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={s.textSize === value}
              className={s.textSize === value ? 'seg seg-on' : 'seg'}
              onClick={() => setSettings({ textSize: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted">Changes the size of the moving line you type from.</p>
      </section>

      <section className="panel">
        <h2 className="section-title">How points are scored</h2>
        <ul className="plain-list">
          {SCORING_EXPLANATION.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="muted">Scores are always whole numbers and never negative.</p>
      </section>

      <section className="panel">
        <h2 className="section-title">Your data</h2>
        <p className="muted">
          Your nickname, progress, records and settings are saved only in this browser (localStorage). There are no
          accounts. Online races send your nickname, car and typing progress to the multiplayer server at{' '}
          <code>{serverUrl()}</code>.
        </p>
        {!confirming ? (
          <button className="btn btn-danger" onClick={() => setConfirming(true)}>
            Reset progress...
          </button>
        ) : (
          <div className="row">
            <span>This clears levels, points, records and your history. Your coins, unlocked items, badges and streak are kept. Continue?</span>
            <button
              className="btn btn-danger"
              onClick={() => {
                reset();
                setConfirming(false);
              }}
            >
              Yes, reset
            </button>
            <button className="btn" onClick={() => setConfirming(false)} autoFocus>
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
