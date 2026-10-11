import type { Difficulty } from '@typerush/shared';
import type { SoloConfig } from './screens/SoloRace';

export type Route =
  | { name: 'home' }
  | { name: 'garage' }
  | { name: 'levels' }
  | { name: 'quick' }
  | { name: 'solo'; config: SoloConfig; attempt: number }
  | { name: 'friends'; code?: string }
  | { name: 'match'; difficulty?: Difficulty }
  | { name: 'leaderboard' }
  | { name: 'settings' }
  | { name: 'account' };

export type Go = (route: Route) => void;
