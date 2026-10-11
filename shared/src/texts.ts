import { createRng, shuffle } from './rng';
import type { Difficulty } from './types';
import {
  HINDI_EXPERT, HINDI_HARD, HINDI_MEDIUM, HINDI_WORDS,
  HINGLISH_EXPERT, HINGLISH_HARD, HINGLISH_MEDIUM, HINGLISH_WORDS,
} from './textsIndic';

export type TextLang = 'en' | 'hinglish' | 'hindi';
export const TEXT_LANGS: TextLang[] = ['en', 'hinglish', 'hindi'];
export const TEXT_LANG_LABEL: Record<TextLang, string> = { en: 'English', hinglish: 'Hinglish', hindi: 'Hindi (Devanagari)' };
export function isTextLang(value: unknown): value is TextLang {
  return typeof value === 'string' && (TEXT_LANGS as string[]).includes(value);
}

// English and Hinglish text is plain printable ASCII so every character can be typed on a
// standard keyboard (no smart quotes, no accents). Hindi lives in textsIndic.ts (see its header).

/** Easy levels 1-2: words built only from the home row (a s d f g h j k l). */
const HOME_ROW_WORDS = [
  'sad', 'dad', 'ask', 'all', 'add', 'fall', 'hall', 'had', 'has', 'gas',
  'lad', 'lass', 'dash', 'flash', 'salad', 'glass', 'flask', 'shall', 'half',
  'lash', 'sash', 'hash', 'slash', 'glad', 'fads', 'hags', 'gall', 'alas',
  'shad', 'ska',
];

/** Easy levels 3-5: short, friendly everyday words. */
const SIMPLE_WORDS = [
  'cat', 'dog', 'sun', 'hat', 'run', 'jump', 'play', 'book', 'tree', 'fish',
  'bird', 'milk', 'rain', 'star', 'moon', 'road', 'car', 'fast', 'slow', 'red',
  'blue', 'green', 'home', 'door', 'ball', 'game', 'song', 'hand', 'foot',
  'nice', 'kind', 'help', 'good', 'time', 'word', 'type', 'race', 'win', 'go',
  'stop', 'wheel', 'speed', 'lane', 'flag', 'gear', 'turn', 'zoom', 'fuel',
  'map', 'sky', 'wind', 'boat', 'cake', 'rice', 'tea', 'cup', 'pen', 'bag',
];

const MEDIUM_SENTENCES = [
  'The sun is warm today.',
  'We can race after school.',
  'My friend types very fast.',
  'Please open the window.',
  'Keep your eyes on the road.',
  'The team won the game.',
  'I like to read before bed.',
  'A small dog ran across the street.',
  'She plays music every morning.',
  'Turn left at the next corner.',
  'Practice a little every day.',
  'The train arrives at noon.',
  'He found a quiet place to study.',
  'Fresh bread smells wonderful.',
  'Look at the stars tonight.',
  'Our class goes to the park on Friday.',
  'Can you help me find my keys?',
  'Slow and steady wins many races.',
  'It was a long, sunny afternoon.',
  'They built a boat from old wood.',
  'Water the plants before you leave.',
  'The bus was late, so we walked.',
  'Good habits start with small steps.',
  'Where did you put the blue book?',
  'Rain made the road shiny and slick.',
  'Always check your work twice.',
  'The market opens early on Sunday.',
  'Ask questions when you are not sure.',
];

const HARD_SENTENCES = [
  'Accuracy matters more than raw speed; fast hands follow a calm mind.',
  'Although the weather was unpredictable, the Mumbai express arrived exactly on schedule.',
  '"Consistency," she said, "is the quiet engine behind every champion."',
  'Engineers measure performance carefully, because small improvements accumulate over time.',
  'The mountain road twisted through three villages before reaching the old fort.',
  "Don't rush the difficult words; rhythm will carry you through them.",
  'Our neighbourhood library organises a reading challenge every September.',
  'Long-distance runners and fast typists share one habit: steady breathing.',
  'The committee approved the proposal, although several members remained skeptical.',
  'Brilliant designs often begin as messy sketches on crumpled paper.',
  'Whenever the signal turned green, the motorcycles roared forward together.',
  'Photographers wait patiently for golden light over the river.',
  'Students who practise daily usually improve faster than those who cram.',
  "The festival's lanterns glowed along Park Street, reflecting in every puddle.",
  'Mechanics inspect the engine, tighten the bolts, and test the brakes.',
  'A thoughtful reply is better than a quick, careless one.',
  "Delhi's metro network keeps expanding, connecting suburbs once considered remote.",
  'Curious travellers collect stories, not souvenirs.',
  'Without a clear plan, even talented teams lose precious time.',
  "The chess champion studied his opponent's last three games overnight.",
  'Hydrogen-powered vehicles may reshape how cities handle transport.',
  'Courage is simply taking the next step while your hands are still shaking.',
];

const EXPERT_SENTENCES = [
  'On 14 March 2024, the team shipped version 3.2.1 (after 47 test runs) and cut load time by 38%.',
  'Order #4821 costs $129.50; with a 15% discount, you pay $110.08.',
  "Dr. Rao's lab recorded 2,500 samples between 09:30 and 17:45 -- an average of 4.4 per minute.",
  "Use the formula: speed = distance / time; for 240 km in 3 hours, that's 80 km/h.",
  '"Is it 6:15 or 6:50?" she asked; nobody was certain, so they checked the schedule: 6:50.',
  'Passwords like Tr0ub4dor&3 look strong, yet long passphrases (4+ random words) are safer.',
  'The 2023-24 budget allocated Rs. 5,40,000 to labs, 1,25,000 to sports, and 75,000 to events.',
  'Between January and June, revenue grew from $1.2M to $3.7M (+208%), exceeding every forecast.',
  'Initialize the array [3, 7, 11, 15]; then loop until index >= 4 and print each value.',
  "Her marathon time -- 3:42:18 -- beat last year's record by exactly 6 minutes & 12 seconds.",
  'Mount Everest stands 8,849 m tall; Kanchenjunga, at 8,586 m, ranks third in the world.',
  'Wait: did you say 25 or 52 passengers? The bus (model X-90) seats only 48!',
  'Conversion rates dropped 12.5% after the redesign; therefore, the team rolled back 2 of 5 changes.',
  'Flight AI-203 departs at 22:10 from Gate B7, arriving in Bengaluru by 00:55 the next day.',
  "She typed 'hello, world!' 100 times; he typed it 87 times -- accuracy beat speed again.",
  'Set the timer to 25 minutes, work without distraction, then rest for 5; repeat 4 times.',
  'Interest of 7.5% on 20,000 rupees for 3 years equals 4,500 rupees (simple interest).',
  'Version 2.0.4 fixes 11 bugs, adds 3 features, and removes 2 deprecated options.',
  '"Never skip warm-ups," the coach repeated; 15 minutes of drills saves 150 minutes of regret.',
  'Server logs showed 1,024 requests/second at peak; latency stayed under 120 ms.',
  'Room 305 (third floor) is booked 10:00-11:30 on Tuesdays; room 112 is free all day.',
  'The recipe needs 2 cups of flour, 1/2 tsp of salt, 3 eggs, and 250 ml of milk.',
];

const SENTENCE_POOLS: Record<Exclude<Difficulty, 'easy'>, string[]> = {
  medium: MEDIUM_SENTENCES,
  hard: HARD_SENTENCES,
  expert: EXPERT_SENTENCES,
};

function buildWordText(pool: string[], targetChars: number, seed: number): string {
  const rng = createRng(seed);
  const words: string[] = [];
  let length = 0;
  let last = '';
  while (length < targetChars) {
    const word = pool[Math.floor(rng() * pool.length)];
    if (word === last) continue;
    last = word;
    const addition = (words.length ? 1 : 0) + word.length;
    if (words.length > 0 && length + addition > targetChars) break;
    words.push(word);
    length += addition;
  }
  return words.join(' ');
}

function buildSentenceText(pool: string[], targetChars: number, seed: number): string {
  const rng = createRng(seed);
  let order = shuffle(pool, rng);
  let index = 0;
  let text = '';
  let guard = 0;
  while (text.length < targetChars * 0.9 && guard < 500) {
    guard++;
    if (index >= order.length) {
      order = shuffle(pool, rng);
      index = 0;
    }
    const sentence = order[index++];
    if (text.length === 0) {
      text = sentence;
    } else if (text.length + 1 + sentence.length <= targetChars * 1.2) {
      text += ' ' + sentence;
    }
  }
  return text;
}

/**
 * Generates the race text. Deterministic for a given (difficulty, chars, seed, tier).
 * @param tier 1..5 position inside the difficulty (only used by Easy to move from
 *             home-row words to everyday words).
 */
export function generateText(
  difficulty: Difficulty,
  targetChars: number,
  seed: number,
  tier = 1,
  lang: TextLang = 'en',
): string {
  const chars = Math.max(10, Math.floor(targetChars));
  if (lang === 'hindi' || lang === 'hinglish') {
    const hindi = lang === 'hindi';
    if (difficulty === 'easy') return buildWordText(hindi ? HINDI_WORDS : HINGLISH_WORDS, chars, seed);
    const pools = hindi
      ? { medium: HINDI_MEDIUM, hard: HINDI_HARD, expert: HINDI_EXPERT }
      : { medium: HINGLISH_MEDIUM, hard: HINGLISH_HARD, expert: HINGLISH_EXPERT };
    return buildSentenceText(pools[difficulty], chars, seed);
  }
  if (difficulty === 'easy') {
    const pool = tier <= 2 ? HOME_ROW_WORDS : SIMPLE_WORDS;
    return buildWordText(pool, chars, seed);
  }
  return buildSentenceText(SENTENCE_POOLS[difficulty], chars, seed);
}

export function isTypableText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) return false;
  }
  return true;
}
