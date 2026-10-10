import { useEffect, useRef, type FormEvent } from 'react';

/**
 * Captures typing for the race without the player having to click anything:
 *  - desktop: a window-level keydown listener
 *  - mobile: a hidden <input> (tap the text area to open the keyboard); its input events are
 *    turned into characters and the field is cleared again.
 */
export function useTypingInput(enabled: boolean, onChar: (char: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handler = useRef(onChar);
  handler.current = onChar;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.key.length === 1) {
        // Stops the browser from scrolling on Space or triggering quick-find on ' and /.
        event.preventDefault();
        handler.current(event.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  useEffect(() => {
    if (enabled) inputRef.current?.focus({ preventScroll: true });
  }, [enabled]);

  const onInput = (event: FormEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    const value = field.value;
    field.value = '';
    if (!enabled) return;
    for (const ch of value) handler.current(ch);
  };

  const focus = () => inputRef.current?.focus({ preventScroll: true });
  return { inputRef, onInput, focus };
}
