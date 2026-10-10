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
  const typed = text.slice(0, pos);
  const current = text.charAt(pos);
  const rest = text.slice(pos + 1);
  const done = pos >= text.length;

  return (
    <div
      className={`typing ${active ? 'typing-active' : ''}`}
      onPointerDown={onTap}
      role="group"
      aria-label="Typing area. Type the highlighted text."
    >
      <div className="typing-text" aria-hidden="true">
        <span className="t-done">{typed}</span>
        {!done && (
          <span key={wrongTick} className={`t-cursor ${wrongTick > 0 ? 't-wrong' : ''}`}>
            {current === ' ' ? '\u00a0' : current}
          </span>
        )}
        <span className="t-rest">{rest}</span>
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
