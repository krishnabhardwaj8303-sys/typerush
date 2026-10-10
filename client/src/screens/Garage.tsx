import { useState } from 'react';
import { CARS, NAME_MAX_LENGTH } from '@typerush/shared';
import { CarArt, TrailPreview } from '../components/CarArt';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import { isOwned, type ShopKind } from '../lib/rewards';
import { SKINS, TRAILS } from '../lib/shop';
import type { Go } from '../routes';

type Tab = 'cars' | 'skins' | 'trails';

export function Garage({ go }: { go: Go }) {
  const { profile, setName, setCar, setSkin, setTrail, buy } = useProfile();
  const [draft, setDraft] = useState(profile.name);
  const [tab, setTab] = useState<Tab>('cars');
  const [message, setMessage] = useState<string | null>(null);
  const valid = draft.trim().length >= 1;
  const motion = !profile.settings.reduceMotion;

  const commit = (value: string) => {
    const clean = value.replace(/[<>&"'`\\]/g, '').trim().slice(0, NAME_MAX_LENGTH);
    if (clean) setName(clean);
    setDraft(clean || profile.name);
  };

  const press = (kind: ShopKind, id: string, name: string, price: number) => {
    audio.unlock();
    audio.click();
    setMessage(null);
    const equip = () => (kind === 'car' ? setCar(id as never) : kind === 'skin' ? setSkin(id as never) : setTrail(id as never));
    if (isOwned(profile, kind, id)) {
      equip();
      return;
    }
    const result = buy(kind, id);
    if (result.ok) {
      equip();
      setMessage(`Unlocked ${name}! It is equipped now.`);
    } else if (result.reason === 'poor') {
      setMessage(`You need ${price - profile.coins} more coins for ${name}. Race to earn coins!`);
    }
  };

  const status = (kind: ShopKind, id: string, price: number, equipped: boolean) => {
    if (equipped) return <span className="shop-state shop-on">Equipped</span>;
    if (isOwned(profile, kind, id)) return <span className="shop-state">Tap to equip</span>;
    return (
      <span className={`shop-state ${profile.coins >= price ? 'shop-buy' : 'shop-locked'}`}>
        <span className="coin" aria-hidden="true" /> {price} &middot; {profile.coins >= price ? 'Buy' : 'Locked'}
      </span>
    );
  };

  return (
    <div className="page">
      <TopBar title="Garage & Shop" onBack={() => { commit(draft); go({ name: 'home' }); }} backLabel="Menu" />
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

        <div className="shop-preview">
          <CarArt car={profile.car} skin={profile.skin} size={190} animate={motion} />
          <p className="muted center">
            You have <strong className="gold">{profile.coins} coins</strong>. Earn more by racing, clearing levels,
            playing the Daily Challenge and keeping your streak.
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="Shop sections">
          {(['cars', 'skins', 'trails'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'tab tab-on' : 'tab'}
              onClick={() => {
                setTab(t);
                setMessage(null);
              }}
            >
              {t === 'cars' ? 'Cars' : t === 'skins' ? 'Paint skins' : 'Trails'}
            </button>
          ))}
        </div>
        {message && (
          <p className="banner banner-info" role="status">
            {message}
          </p>
        )}
        <p className="muted center">
          Cars are shown to other players online. Skins and trails are drawn on your own screen.
        </p>

        {tab === 'cars' && (
          <div className="car-grid" role="radiogroup" aria-label="Car">
            {CARS.map((car) => {
              const selected = profile.car === car.id;
              return (
                <button
                  key={car.id}
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'car-card car-card-on' : isOwned(profile, 'car', car.id) ? 'car-card' : 'car-card car-card-locked'}
                  onClick={() => press('car', car.id, car.name, car.price)}
                >
                  <CarArt car={car.id} skin={profile.skin} size={130} animate={selected && motion} />
                  <strong>{car.name}</strong>
                  {status('car', car.id, car.price, selected)}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'skins' && (
          <div className="car-grid" role="radiogroup" aria-label="Paint skin">
            {SKINS.map((skin) => {
              const selected = profile.skin === skin.id;
              return (
                <button
                  key={skin.id}
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'car-card car-card-on' : isOwned(profile, 'skin', skin.id) ? 'car-card' : 'car-card car-card-locked'}
                  onClick={() => press('skin', skin.id, skin.name, skin.price)}
                >
                  <CarArt car={profile.car} skin={skin.id} size={130} />
                  <strong>{skin.name}</strong>
                  <small className="muted">{skin.blurb}</small>
                  {status('skin', skin.id, skin.price, selected)}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'trails' && (
          <div className="car-grid" role="radiogroup" aria-label="Trail">
            {TRAILS.map((trail) => {
              const selected = profile.trail === trail.id;
              return (
                <button
                  key={trail.id}
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'car-card car-card-on' : isOwned(profile, 'trail', trail.id) ? 'car-card' : 'car-card car-card-locked'}
                  onClick={() => press('trail', trail.id, trail.name, trail.price)}
                >
                  <TrailPreview trail={trail.id} car={profile.car} skin={profile.skin} />
                  <strong>{trail.name}</strong>
                  <small className="muted">{trail.blurb}</small>
                  {status('trail', trail.id, trail.price, selected)}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
