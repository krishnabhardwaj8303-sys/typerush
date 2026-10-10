import { useState } from 'react';
import { DIFFICULTIES, DIFFICULTY_BLURB, DIFFICULTY_LABEL, randomSeed, type Difficulty } from '@typerush/shared';
import { TopBar } from '../components/TopBar';
import { audio } from '../lib/audio';
import type { Go } from '../routes';
import { quickConfig } from './levelConfig';

export function QuickPractice({ go }: { go: Go }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [count, setCount] = useState(2);

  return (
    <div className="page">
      <TopBar title="Practice vs AI" onBack={() => go({ name: 'home' })} backLabel="Menu" />
      <section className="panel">
        <h2 className="section-title">Difficulty</h2>
        <div className="choice-grid" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={difficulty === d}
              className={difficulty === d ? 'choice choice-on' : 'choice'}
              onClick={() => setDifficulty(d)}
            >
              <strong>{DIFFICULTY_LABEL[d]}</strong>
              <span>{DIFFICULTY_BLURB[d]}</span>
            </button>
          ))}
        </div>

        <h2 className="section-title">AI opponents</h2>
        <div className="segmented" role="radiogroup" aria-label="Number of AI opponents">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={count === n}
              className={count === n ? 'seg seg-on' : 'seg'}
              onClick={() => setCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="muted">
          Practice races do not unlock levels, but they still earn points and count towards your records. Want
          progression? Open <button className="link" onClick={() => go({ name: 'levels' })}>Levels</button>.
        </p>

        <button
          className="btn btn-primary btn-lg"
          onClick={() => {
            audio.unlock();
            audio.click();
            go({ name: 'solo', config: quickConfig(difficulty, count, randomSeed()), attempt: 0 });
          }}
        >
          Start practice
        </button>
      </section>
    </div>
  );
}
