import { useState } from 'react';
import { CARS, NAME_MAX_LENGTH } from '@typerush/shared';
import { CarArt } from '../components/CarArt';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import type { Go } from '../routes';

export function Garage({ go }: { go: Go }) {
  const { profile, setName, setCar } = useProfile();
  const [draft, setDraft] = useState(profile.name);
  const valid = draft.trim().length >= 1;

  const commit = (value: string) => {
    const clean = value.replace(/[<>&"'`\\]/g, '').trim().slice(0, NAME_MAX_LENGTH);
    if (clean) setName(clean);
    setDraft(clean || profile.name);
  };

  return (
    <div className="page">
      <TopBar title="Garage" onBack={() => { commit(draft); go({ name: 'home' }); }} backLabel="Menu" />
      <section className="panel">
        <label className="field">
          <span>Nickname</span>
          <input
            type="text"
            value={draft}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            aria-invalid={!valid}
            aria-describedby="name-help"
            autoComplete="off"
          />
          <small id="name-help" className={valid ? 'muted' : 'error'}>
            {valid ? `Up to ${NAME_MAX_LENGTH} characters. Other players will see this.` : 'Please enter a nickname.'}
          </small>
        </label>

        <h2 className="section-title">Choose your car</h2>
        <div className="car-grid" role="radiogroup" aria-label="Car">
          {CARS.map((car) => {
            const selected = profile.car === car.id;
            return (
              <button
                key={car.id}
                role="radio"
                aria-checked={selected}
                className={selected ? 'car-card car-card-on' : 'car-card'}
                onClick={() => {
                  audio.unlock();
                  audio.click();
                  setCar(car.id);
                }}
              >
                <CarArt car={car.id} size={130} animate={selected && !profile.settings.reduceMotion} />
                <strong>{car.name}</strong>
                <span className="muted">{selected ? 'Selected' : 'Tap to select'}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
