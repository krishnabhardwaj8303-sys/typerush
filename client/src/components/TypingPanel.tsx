import { useLayoutEffect, useMemo, useRef, useState } from 'react';

const NON_ASCII = /[^\x00-\x7f]/;

/** Start index of every grapheme cluster (a Hindi letter with its vowel sign is one cluster). */
export function clusterStarts(text: string): number[] {
  const starts: number[] = [];
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ index: number }> } }).Segmenter;
  if (Seg) {
    for (const part of new Seg('hi', { granularity: 'grapheme' }).segment(text)) starts.push(part.index);
  } else {
    let i = 0;
    for (const ch of text) {
      starts.push(i);
      i += ch.length;
    }
  }
  return starts;
}

/** The cluster that contains position pos: [start, end). */
export function clusterAt(starts: number[], textLength: number, pos: number): [number, number] {
  let lo = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= pos) lo = i;
    else break;
  }
  const start = starts[lo] ?? pos;
  const end = starts[lo + 1] ?? textLength;
  return [start, Math.max(end, start + 1)];
}

interface Props {
  text: string;
  /** Number of characters typed correctly so far (the cursor position). */
  pos: number;
  /** Increments each time a wrong key is pressed (re-triggers the shake animation). */
  wrongTick: number;
  active: boolean;
  /** Shows a "tap to type" hint, mostly for touch devices. */
  onTap: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInput: (event: React.FormEvent<HTMLInputElement>) => void;
}

export function TypingPanel({ text, pos, wrongTick, active, onTap, inputRef, onInput }: Props) {
  const complex = useMemo(() => NON_ASCII.test(text), [text]);
  const starts = useMemo(() => (complex ? clusterStarts(text) : []), [complex, text]);
  const done = pos >= text.length;
  // English keeps the simple one-character-per-step layout. Scripts with combining marks are shown whole
  // clusters at a time and the ticker is moved by the real pixel width of the typed part.
  const [from, to] = complex && !done ? clusterAt(starts, text.length, pos) : [pos, pos + 1];
  const typed = text.slice(0, from);
  const current = text.slice(from, to);
  const rest = text.slice(to);
  const typedRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    if (!complex) return;
    const w = typedRef.current ? typedRef.current.getBoundingClientRect().width : 0;
    setOffset((old) => (Math.abs(old - w) < 0.5 ? old : w));
  }, [complex, from, text]);

  return (
    <div
      className={`typing ${active ? 'typing-active' : ''}`}
      onPointerDown={onTap}
      role="group"
      aria-label="Typing area. Type the highlighted text."
    >
      <div className={`typing-text ticker${complex ? ' typing-indic' : ''}`} aria-hidden="true">
        <div className="ticker-track" style={{ transform: complex ? `translateX(-${offset}px)` : `translateX(-${pos}ch)` }}>
          <span ref={typedRef} className="t-done">{typed}</span>
          {!done && (
            <span key={wrongTick} className={`t-cursor ${wrongTick > 0 ? 't-wrong' : ''}`}>
              {current === ' ' ? '\u00a0' : current}
            </span>
          )}
          <span className="t-rest">{rest}</span>
        </div>
      </div>
      <span className="sr-only">
        {done ? 'Finished typing.' : `Next character: ${current === ' ' ? 'space' : current}`}
      </span>
      <input
        ref={inputRef}
        className="typing-input"
        type="text"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Type here"
        onInput={onInput}
        tabIndex={-1}
      />
      {active && !done && (
        <p className="typing-hint">
          Just start typing - no clicking needed. Wrong keys never move your car.
          <span className="touch-only"> Tap here to open your keyboard.</span>
        </p>
      )}
    </div>
  );
}
