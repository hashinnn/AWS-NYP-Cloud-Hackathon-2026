/**
 * The progress ring on a ranked row (UC-016 step 4).
 *
 * Colour comes from the shared status tokens, never a hard-coded hex, so it
 * matches the capacity bar and the heatmap in both themes.
 */

export default function ProgressRing({
  value, size = 22, label,
}: { value: number; size?: number; label?: string }) {
  const pct = Math.min(Math.max(Number(value) || 0, 0), 100);
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label || `${Math.round(pct)}% done`}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-hairline)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={pct >= 100 ? 'var(--color-good)' : 'var(--color-series-1)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        // Start at twelve o'clock rather than three, which is where a reader
        // expects a ring to begin.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
