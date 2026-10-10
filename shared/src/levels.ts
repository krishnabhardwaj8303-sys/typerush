import type { AiProfile } from './ai';
import type { CarId, Difficulty } from './types';

export interface LevelDef {
  /** 1..100, global order. */
  id: number;
  difficulty: Difficulty;
  /** 1..25 inside its difficulty. */
  tier: number;
  name: string;
  chars: number;
  /** Minimum accuracy (%) needed to clear the level and unlock the next one. */
  minAccuracy: number;
  /** Approximate speed a player needs to beat the whole field. */
  topBotWpm: number;
  /** Index into TRACK_THEME_NAMES: decides the scenery of the race track. */
  theme: number;
  /** How many U-turns the track has (more turns = a more twisty track). */
  turns: number;
  opponents: AiProfile[];
}

/** Names of the 10 track themes (the drawing code lives in the client renderer). */
export const TRACK_THEME_NAMES = [
  'Sunset City',
  'Desert Highway',
  'Pine Forest',
  'Sunny Beach',
  'Snow Peaks',
  'Neon Night',
  'Rocky Mountain',
  'Volcano Rim',
  'Rainy Harbour',
  'Moon Base',
];

interface Tier {
  name: string;
  chars: number;
  baseWpm: number;
  accuracy: number;
  minAccuracy: number;
  turns: number;
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

const BOT_NAMES: Record<Difficulty, [string, string, string]> = {
  easy: ['Pip', 'Dot', 'Moss'],
  medium: ['Nova', 'Rex', 'Juno'],
  hard: ['Blaze', 'Vega', 'Orion'],
  expert: ['Apex', 'Cipher', 'Zenith'],
};

const BOT_CARS: Record<Difficulty, [CarId, CarId, CarId]> = {
  easy: ['mint', 'flare', 'wave'],
  medium: ['bolt', 'viper', 'mint'],
  hard: ['wave', 'rocket', 'flare'],
  expert: ['viper', 'bolt', 'rocket'],
};

const LEVEL_NAMES: Record<Difficulty, string[]> = {
  easy: [
    'Home Row Warm-up', 'Garage Door', 'Sunny Street', 'Park Loop', 'Village Lane',
    'School Run', 'Market Road', 'Lakeside Drive', 'Hill Climb', 'Bakery Bend',
    'Farm Track', 'Cycle Path', 'Tea Stall Turn', 'Rickshaw Row', 'Temple Road',
    'Riverbank Ride', 'Garden Gate', 'Bridge Lane', 'Fair Ground', 'Orchard Loop',
    'Station Road', 'Sunrise Strip', 'Meadow Run', 'Harvest Haul', 'Easy Finale',
  ],
  medium: [
    'City Cruise', 'Main Avenue', 'Harbour Road', 'Midtown Sprint', 'Riverside Run',
    'Old Town Loop', 'Airport Link', 'Bridge Dash', 'Downtown Rush', 'Metro Mile',
    'Market Maze', 'Cinema Circuit', 'Tower Turn', 'Bazaar Blitz', 'Flyover Fast',
    'Ring Road', 'Stadium Sprint', 'Tech Park Run', 'Port Pursuit', 'Sunset Boulevard',
    'Rush Hour', 'Skybridge Sprint', 'Night Market', 'Overpass Open', 'Medium Finale',
  ],
  hard: [
    'Mountain Pass', 'Desert Highway', 'Coastal Curves', 'Night Tunnel', 'Canyon Run',
    'Forest Twist', 'Glacier Road', 'Highland Fling', 'Thunder Road', 'Cliffside Chase',
    'Dune Dash', 'Switchback Sprint', 'Misty Mile', 'Ravine Rally', 'Frostbite Pass',
    'Storm Chaser', 'Lava Lane', 'Eagle Ridge', 'Crosswind Run', 'Hairpin Haven',
    'Avalanche Alley', 'Summit Surge', 'Ghost Road', 'Red Rock Run', 'Hard Finale',
  ],
  expert: [
    'Neon Circuit', 'Grand Prix', 'Storm Run', 'Turbo Tunnel', 'Volcano Rim',
    'Skyline Sprint', 'Lunar Loop', 'Redline Rally', 'Blitz Boulevard', 'Nitro Nights',
    'Photon Pass', 'Overdrive Oval', 'Apex Alley', 'Quantum Quarter', 'Meltdown Mile',
    'Crimson Circuit', 'Gravity Gauntlet', 'Hyper Highway', 'Zero-G Zone', 'Thunderdome',
    'WarpWay', 'Supernova Sprint', 'Black Hole Bend', 'Champion Chase', 'TypeRush Final',
  ],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 25 tiers per difficulty. Speed, text length, accuracy requirement and track
 * twistiness all grow smoothly, so the whole campaign gets harder step by step.
 */
function buildTiers(difficulty: Difficulty): Tier[] {
  const names = LEVEL_NAMES[difficulty];
  return names.map((name, i) => {
    switch (difficulty) {
      case 'easy':
        return {
          name,
          chars: 24 + i * 4, // 24 .. 120
          baseWpm: round1(8 + i), // 8 .. 32
          accuracy: Math.round(90 + i * 0.25),
          minAccuracy: Math.round(60 + i * 0.6), // 60 .. 74
          turns: 1 + Math.floor(i / 6), // 1 .. 5
        };
      case 'medium':
        return {
          name,
          chars: 100 + i * 8, // 100 .. 292
          baseWpm: round1(33 + 0.9 * i), // 33 .. 54.6
          accuracy: Math.round(93 + i * 0.12),
          minAccuracy: Math.round(75 + i * 0.42), // 75 .. 85
          turns: 2 + Math.floor(i / 6), // 2 .. 6
        };
      case 'hard':
        return {
          name,
          chars: 180 + i * 10, // 180 .. 420
          baseWpm: round1(55 + 1.2 * i), // 55 .. 83.8
          accuracy: Math.round(95 + i * 0.08),
          minAccuracy: Math.round(85 + i * 0.21), // 85 .. 90
          turns: 3 + Math.floor(i / 6), // 3 .. 7
        };
      default:
        return {
          name,
          chars: 240 + i * 12, // 240 .. 528
          baseWpm: round1(85 + 1.8 * i), // 85 .. 128.2
          accuracy: Math.round(96 + i * 0.08),
          minAccuracy: Math.round(88 + i * 0.17), // 88 .. 92
          turns: 4 + Math.floor(i / 6), // 4 .. 8
        };
    }
  });
}

/** Three opponents per level: a slower one, a steady mid-pack car and a fast one. */
function buildOpponents(difficulty: Difficulty, tier: Tier, levelId: number): AiProfile[] {
  const names = BOT_NAMES[difficulty];
  const cars = BOT_CARS[difficulty];
  const factors = [0.75, 1.0, 1.22];
  const accuracyOffset = [3, 0, -3];
  const jitter = [0.15, 0.25, 0.35];
  return names.map((name, i) => ({
    id: `bot-${levelId}-${i}`,
    name,
    car: cars[i],
    wpm: round1(tier.baseWpm * factors[i]),
    accuracy: Math.min(99, tier.accuracy + accuracyOffset[i]),
    jitter: jitter[i],
  }));
}

export const LEVELS: LevelDef[] = (() => {
  const levels: LevelDef[] = [];
  let id = 1;
  DIFFICULTY_ORDER.forEach((difficulty, difficultyIndex) => {
    buildTiers(difficulty).forEach((tier, index) => {
      const opponents = buildOpponents(difficulty, tier, id);
      levels.push({
        id,
        difficulty,
        tier: index + 1,
        name: tier.name,
        chars: tier.chars,
        minAccuracy: tier.minAccuracy,
        topBotWpm: Math.max(...opponents.map((o) => o.wpm)),
        // Every difficulty walks through all 10 themes (repeating), starting at a different one.
        theme: (index + difficultyIndex * 3) % TRACK_THEME_NAMES.length,
        turns: tier.turns,
        opponents,
      });
      id++;
    });
  });
  return levels;
})();

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}

export function levelsFor(difficulty: Difficulty): LevelDef[] {
  return LEVELS.filter((level) => level.difficulty === difficulty);
}

export function isLevelUnlocked(levelId: number, completed: Record<number, number>): boolean {
  if (levelId <= 1) return true;
  return (completed[levelId - 1] ?? 0) > 0;
}

/** Bot line-up for a free "Quick Race" at a difficulty (mid tier of that difficulty). */
export function quickRaceOpponents(difficulty: Difficulty, count: number): AiProfile[] {
  const levels = levelsFor(difficulty);
  const mid = levels[Math.floor(levels.length / 2)];
  return mid.opponents.slice(0, Math.max(1, Math.min(3, count))).map((bot, i) => ({
    ...bot,
    id: `quick-${difficulty}-${i}`,
  }));
}

export function quickRaceChars(difficulty: Difficulty): number {
  const levels = levelsFor(difficulty);
  return levels[Math.floor(levels.length / 2)].chars;
}
