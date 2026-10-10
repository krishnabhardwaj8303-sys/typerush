interface Props {
  /** 3, 2, 1, 0 (= GO) or null for hidden. */
  value: number | null;
}

export function Countdown({ value }: Props) {
  if (value === null) return null;
  const label = value > 0 ? String(value) : 'GO!';
  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span key={label} className={value > 0 ? 'countdown-num' : 'countdown-num countdown-go'}>
        {label}
      </span>
    </div>
  );
}
