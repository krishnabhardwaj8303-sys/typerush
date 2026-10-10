const COLORS = ['#ffc233', '#22d3ee', '#ff3ea5', '#34d399', '#8a4dff', '#ff7a1a'];

/** Pure-CSS confetti burst. Hidden automatically when the user prefers reduced motion. */
export function Confetti({ count = 46 }: { count?: number }) {
  const pieces = Array.from({ length: count }, (_, i) => {
    const left = (i * 53) % 100;
    const delay = ((i * 37) % 100) / 100;
    const duration = 2.4 + ((i * 17) % 20) / 10;
    const size = 6 + ((i * 7) % 7);
    return (
      <i
        key={i}
        style={{
          left: `${left}%`,
          background: COLORS[i % COLORS.length],
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          width: size,
          height: size * 1.6,
        }}
      />
    );
  });
  return (
    <div className="confetti" aria-hidden="true">
      {pieces}
    </div>
  );
}
