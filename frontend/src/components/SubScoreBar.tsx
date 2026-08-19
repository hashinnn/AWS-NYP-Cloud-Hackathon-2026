/**
 * UC-010 step 7 / UC-011 step 4 — the stacked contribution bar.
 *
 * The bar shows each sub-score's WEIGHTED contribution, so its widths are
 * honestly proportional and the five segments add up to the number on the
 * badge. Every segment is labelled in the legend with its own figure, which is
 * what lets three of the palette hues sit below 3:1 contrast safely: the colour
 * never carries the meaning alone.
 *
 * Hovering a segment shows the arithmetic that produced it — this is where
 * "understandable rather than arbitrary" becomes literal.
 */

import { useState } from 'react';
import { SUBSCORE_COLOURS, SUBSCORE_LABELS } from '../lib/chartTheme';

type Contribution = { key: string; label?: string; value: number; weighted: number };

const FIGURE_HINT: Record<string, (f: any) => string | null> = {
  urgency: (f) => (f?.daysOverdue !== undefined
    ? `overdue by ${f.daysOverdue} days`
    : (f?.daysUntilDue !== undefined ? `${f.daysUntilDue} days until the deadline` : null)),
  stakes: (f) => (f?.gradeWeight !== undefined
    ? `${f.gradeWeight}% of ${f.module || 'the module'}` : null),
  effortPressure: (f) => (f?.remainingHours !== undefined
    ? `${f.remainingHours} h of work against ${f.availableHours} h free` : null),
  progressDeficit: (f) => (f?.progressPct !== undefined ? `${f.progressPct}% done so far` : null),
  clashPenalty: (f) => (f?.clashCount !== undefined
    ? `${f.clashCount} other deadlines within 3 days` : null),
};

export default function SubScoreBar({
  contributions, figures, total, compact = false,
}: {
  contributions: Contribution[];
  figures?: any;
  total?: number;
  compact?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // UC-015 Alt A — a zero weight removes the bar as well as the words.
  const shown = (contributions || []).filter((c) => c.weighted > 0);
  const sum = shown.reduce((acc, c) => acc + c.weighted, 0) || 1;
  const active = shown.find((c) => c.key === hovered);

  if (shown.length === 0) return null;

  return (
    <div className="w-full">
      <div
        className={`flex w-full gap-[2px] ${compact ? 'h-1.5' : 'h-3'}`}
        role="img"
        aria-label={shown
          .map((c) => `${SUBSCORE_LABELS[c.key] || c.key} ${c.weighted}`)
          .join(', ')}
      >
        {shown.map((c, i) => (
          <div
            key={c.key}
            className={`reorder cursor-help ${i === 0 ? 'rounded-l-[4px]' : ''} ${
              i === shown.length - 1 ? 'rounded-r-[4px]' : ''
            }`}
            style={{
              width: `${(c.weighted / sum) * 100}%`,
              backgroundColor: SUBSCORE_COLOURS[c.key] || 'var(--color-muted)',
              opacity: hovered && hovered !== c.key ? 0.32 : 1,
            }}
            onMouseEnter={() => setHovered(c.key)}
            onMouseLeave={() => setHovered(null)}
            title={`${SUBSCORE_LABELS[c.key] || c.key}: ${c.value} × weight = ${c.weighted}`}
          />
        ))}
      </div>

      {!compact && (
        <>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            {shown.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  hovered === c.key ? 'text-ink' : 'text-ink2'
                }`}
                onMouseEnter={() => setHovered(c.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(c.key)}
                onBlur={() => setHovered(null)}
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: SUBSCORE_COLOURS[c.key] || 'var(--color-muted)' }}
                />
                {SUBSCORE_LABELS[c.key] || c.key}
                <span className="num font-medium">{c.weighted.toFixed(1)}</span>
              </button>
            ))}
            {total !== undefined && (
              <span className="num ml-auto text-xs font-semibold text-ink">
                {total.toFixed(1)}
              </span>
            )}
          </div>

          {/* Reserve the line so the layout does not jump on hover. */}
          <p className="mt-1.5 min-h-4 text-xs text-muted">
            {active && (
              <>
                <span className="font-medium text-ink2">
                  {SUBSCORE_LABELS[active.key] || active.key}
                </span>
                {' '}
                <span className="num">{active.value} × weight = {active.weighted.toFixed(1)}</span>
                {FIGURE_HINT[active.key]?.(figures) ? ` — ${FIGURE_HINT[active.key]!(figures)}` : ''}
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
