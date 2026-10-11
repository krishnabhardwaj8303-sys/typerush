import { useEffect, useState } from 'react';
import { getLevel, randomSeed } from '@typerush/shared';
import { audio } from './lib/audio';
import { useProfile } from './lib/ProfileContext';
import { useOnline } from './net/OnlineContext';
import type { Route } from './routes';
import { FindMatch } from './screens/FindMatch';
import { FriendsMenu } from './screens/FriendsMenu';
import { Account } from './screens/Account';
import { Community } from './screens/Community';
import { Garage } from './screens/Garage';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { Levels } from './screens/Levels';
import { Lobby } from './screens/Lobby';
import { OnlineRace } from './screens/OnlineRace';
import { QuickPractice } from './screens/QuickPractice';
import { Searching } from './screens/Searching';
import { Settings } from './screens/Settings';
import { SoloRace } from './screens/SoloRace';
import { levelToConfig, nextLevelOf } from './screens/levelConfig';

function initialRoute(): Route {
  try {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      // Remove the invite from the address bar so a refresh does not re-join by accident.
      window.history.replaceState({}, '', window.location.pathname);
      return { name: 'friends', code: room };
    }
  } catch {
    /* ignore */
  }
  return { name: 'home' };
}

export function App() {
  const online = useOnline();
  const { profile } = useProfile();
  const [route, go] = useState<Route>(initialRoute);

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const room = online.room;
  // Every new screen (or restarted race) opens at the top, so the whole track is visible.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, room?.status]);

  const inRace = route.name === 'solo' || (!!room && room.status !== 'lobby');
  useEffect(() => {
    audio.setMusicWanted(!inRace);
  }, [inRace]);

  useEffect(() => {
    document.documentElement.dataset.textSize = profile.settings.textSize;
  }, [profile.settings.textSize]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = profile.settings.reduceMotion ? 'true' : 'false';
  }, [profile.settings.reduceMotion]);

  let screen: React.ReactNode;
  if (room) {
    if (room.type === 'public' && room.status === 'lobby') screen = <Searching go={go} />;
    else if (room.status === 'lobby') screen = <Lobby go={go} />;
    else screen = <OnlineRace go={go} />;
  } else {
    switch (route.name) {
      case 'home':
        screen = <Home go={go} />;
        break;
      case 'garage':
        screen = <Garage go={go} />;
        break;
      case 'levels':
        screen = <Levels go={go} />;
        break;
      case 'quick':
        screen = <QuickPractice go={go} />;
        break;
      case 'friends':
        screen = <FriendsMenu go={go} initialCode={route.code} />;
        break;
      case 'match':
        screen = <FindMatch go={go} initialDifficulty={route.difficulty} />;
        break;
      case 'leaderboard':
        screen = <Leaderboard go={go} />;
        break;
      case 'settings':
        screen = <Settings go={go} />;
        break;
      case 'account':
        screen = <Account go={go} />;
        break;
      case 'community':
        screen = <Community go={go} initialTab={route.tab} />;
        break;
      case 'solo': {
        const { config } = route;
        const exit = () =>
          go(
            config.submit
              ? { name: 'community', tab: config.submit.kind === 'cup' ? 'cup' : 'class' }
              : config.mode === 'level'
                ? { name: 'levels' }
                : config.mode === 'daily'
                  ? { name: 'home' }
                  : { name: 'quick' },
          );
        // The Daily Challenge keeps its seed, so a retry is the same text for the same day.
        const retry = () =>
          go({
            name: 'solo',
            attempt: route.attempt + 1,
            config: config.mode === 'daily' || config.submit ? config : { ...config, seed: randomSeed() },
          });
        const next = config.levelId ? nextLevelOf(config.levelId) : undefined;
        screen = (
          <SoloRace
            key={`${config.title}-${route.attempt}`}
            config={config}
            onExit={exit}
            onRetry={retry}
            onNext={
              next
                ? () => go({ name: 'solo', attempt: 0, config: levelToConfig(getLevel(next.id) ?? next, randomSeed()) })
                : undefined
            }
          />
        );
        break;
      }
    }
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      {online.notice && room && (
        <div className="toast" role="status">
          {online.notice} <button className="link" onClick={online.dismissNotice}>OK</button>
        </div>
      )}
      <main id="main">{screen}</main>
      <footer className="footer">
        <span>TypeRush &middot; free &amp; open source &middot; your progress is saved in this browser only</span>
      </footer>
    </div>
  );
}
