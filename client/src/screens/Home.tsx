import { LEVELS, getLevel, isLevelUnlocked, levelsFor, randomSeed } from '@typerush/shared';
import { CarArt } from '../components/CarArt';
import { audio } from '../lib/audio';
import { useProfile } from '../lib/ProfileContext';
import { totalStars } from '../lib/storage';
import type { Go } from '../routes';
import { levelToConfig } from './levelConfig';

export function Home({ go }: { go: Go }) {
  const { profile } = useProfile();
  const nextLevel =
    LEVELS.find((l) => !profile.completed[l.id] && isLevelUnlocked(l.id, profile.completed)) ?? LEVELS[LEVELS.length - 1];
  const cleared = Object.keys(profile.completed).length;
  const allDone = cleared >= LEVELS.length;
  const bestWpm = Math.max(0, ...Object.values(profile.bestWpm));

  const click = (route: Parameters<Go>[0]) => () => {
    audio.unlock();
    audio.click();
    go(route);
  };

  const playCampaign = () => {
    audio.unlock();
    audio.click();
    const level = getLevel(nextLevel.id) ?? levelsFor('easy')[0];
    go({ name: 'solo', config: levelToConfig(level, randomSeed()), attempt: 0 });
  };

  return (
    <div className="home">
      <section className="hero">
        <div className="logo" aria-label="TypeRush">
          <span className="logo-type">TYPE</span>
          <span className="logo-rush">RUSH</span>
        </div>
        <p className="tagline">Type Fast. Drive Faster. Win the Race.</p>
        <div className="hero-car">
          <CarArt car={profile.car} size={260} animate={!profile.settings.reduceMotion} />
          <div className="hero-road" aria-hidden="true" />
        </div>
        <button className="btn btn-primary btn-xl" onClick={playCampaign}>
          {allDone ? 'Play again' : cleared === 0 ? 'Play' : `Continue: Level ${nextLevel.id}`}
        </button>
        <p className="muted center">
          {allDone ? 'You cleared every level - amazing!' : `Next up: ${nextLevel.name}`}
        </p>
      </section>

      <nav className="menu-grid" aria-label="Main menu">
        <button className="menu-card" onClick={click({ name: 'quick' })}>
          <strong>Practice</strong>
          <span>Race AI opponents at any difficulty</span>
        </button>
        <button className="menu-card" onClick={click({ name: 'friends' })}>
          <strong>Friends Race</strong>
          <span>Private room with a shareable code</span>
        </button>
        <button className="menu-card" onClick={click({ name: 'match' })}>
          <strong>Find Match</strong>
          <span>Race random players online</span>
        </button>
        <button className="menu-card" onClick={click({ name: 'levels' })}>
          <strong>Levels</strong>
          <span>
            {cleared}/{LEVELS.length} cleared &middot; {totalStars(profile)} stars
          </span>
        </button>
        <button className="menu-card" onClick={click({ name: 'leaderboard' })}>
          <strong>Leaderboard</strong>
          <span>Your records and the online hall of fame</span>
        </button>
        <button className="menu-card" onClick={click({ name: 'settings' })}>
          <strong>Settings</strong>
          <span>Sound, motion and your data</span>
        </button>
      </nav>

      <aside className="profile-card" aria-label="Your profile">
        <CarArt car={profile.car} size={96} />
        <div className="profile-info">
          <strong>{profile.name}</strong>
          <span className="muted">
            {profile.totalPoints} pts &middot; {profile.wins} wins &middot; best {Math.round(bestWpm)} WPM
          </span>
        </div>
        <button className="btn" onClick={click({ name: 'garage' })}>
          Change name &amp; car
        </button>
      </aside>
    </div>
  );
}
