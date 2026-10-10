import { DIFFICULTIES, DIFFICULTY_BLURB, DIFFICULTY_LABEL, type Difficulty } from '@typerush/shared';

interface Props {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  disabled?: boolean;
  label?: string;
}

export function DifficultyPicker({ value, onChange, disabled, label = 'Difficulty' }: Props) {
  return (
    <div className="choice-grid" role="radiogroup" aria-label={label}>
      {DIFFICULTIES.map((d) => (
        <button
          key={d}
          role="radio"
          aria-checked={value === d}
          disabled={disabled}
          className={value === d ? 'choice choice-on' : 'choice'}
          onClick={() => onChange(d)}
        >
          <strong>{DIFFICULTY_LABEL[d]}</strong>
          <span>{DIFFICULTY_BLURB[d]}</span>
        </button>
      ))}
    </div>
  );
}
