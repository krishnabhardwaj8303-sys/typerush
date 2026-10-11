import { TEXT_LANGS, TEXT_LANG_LABEL, type TextLang } from '@typerush/shared';

interface Props {
  value: TextLang;
  onChange: (lang: TextLang) => void;
  label?: string;
}

/** Text language choice. Hindi needs a Devanagari (Inscript) keyboard on a computer, so it says so. */
export function LangPicker({ value, onChange, label = 'Text language' }: Props) {
  return (
    <>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {TEXT_LANGS.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={value === l}
            className={value === l ? 'seg seg-on' : 'seg'}
            onClick={() => onChange(l)}
          >
            {TEXT_LANG_LABEL[l]}
          </button>
        ))}
      </div>
      {value === 'hinglish' && <p className="muted">Hindi written in English letters. Works on every keyboard and phone.</p>}
      {value === 'hindi' && (
        <p className="muted">
          Needs a Hindi keyboard. On Windows add <strong>Hindi Traditional (Inscript)</strong> in Settings &gt; Time &amp; language &gt; Language &amp; region, then switch with Windows+Space. Phone keyboards that compose
          words (Hindi phonetic) may not work.
        </p>
      )}
    </>
  );
}
