/**
 * UC-010 step 7 — the explanation, directly above the arithmetic that
 * produced it.
 *
 * The facts lead as labelled tiles — one number, one meaning each — because
 * "worth 40% of IT2214, 10 hours left but only 7.4 free, due in 3 days" is
 * three separate facts wearing one sentence. The sentence still renders
 * beneath them (it is the narration the model writes), and the `source`
 * badge stays visible: model or template, the numbers are identical.
 */

import SubScoreBar from './SubScoreBar';

type Tile = { value: string; label: string; alarm?: boolean };

/** The same figures payload the narration is written from, tiled. */
function tilesFrom(figures: any): Tile[] {
  if (!figures) return [];
  const tiles: Tile[] = [];

  if (figures.daysOverdue !== undefined) {
    tiles.push({
      value: `${figures.daysOverdue} day${figures.daysOverdue === 1 ? '' : 's'}`,
      label: 'overdue',
      alarm: true,
    });
  } else if (figures.daysUntilDue !== undefined) {
    tiles.push({
      value: `${figures.daysUntilDue} day${figures.daysUntilDue === 1 ? '' : 's'}`,
      label: 'until the deadline',
    });
  }

  if (figures.gradeWeight !== undefined) {
    tiles.push({
      value: `${figures.gradeWeight}%`,
      label: `of your ${figures.module || 'module'} grade`,
    });
  }

  if (figures.remainingHours !== undefined && figures.availableHours !== undefined) {
    tiles.push({
      value: `${figures.remainingHours} h / ${figures.availableHours} h`,
      label: 'work left vs time you have',
      alarm: Number(figures.remainingHours) > Number(figures.availableHours),
    });
  }

  if (figures.clashCount) {
    tiles.push({
      value: String(figures.clashCount),
      label: `other deadline${figures.clashCount === 1 ? '' : 's'} within 3 days`,
    });
  }

  return tiles.slice(0, 4);
}

export default function PriorityExplanation({
  text, source, contributions, figures, total, loading = false,
}: {
  text?: string | null;
  source?: 'ai' | 'template' | null;
  contributions: any[];
  figures?: any;
  total?: number;
  loading?: boolean;
}) {
  const tiles = tilesFrom(figures);

  return (
    <div className="space-y-4">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className={`rounded-lg px-3 py-2 ${tile.alarm ? 'bg-crittint' : 'bg-plane'}`}
            >
              <p className={`display num text-lg leading-tight ${tile.alarm ? 'text-crittext' : 'text-ink'}`}>
                {tile.value}
              </p>
              <p className={`mt-0.5 text-[11px] leading-snug ${tile.alarm ? 'text-crittext' : 'text-muted'}`}>
                {tile.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-6 w-2/3 animate-pulse rounded bg-hairline" />
      ) : (
        <p className={tiles.length > 0
          ? 'text-sm leading-relaxed text-ink2'
          : 'text-[17px] leading-relaxed text-ink'}
        >
          {text}
        </p>
      )}

      <SubScoreBar contributions={contributions} figures={figures} total={total} />

      {source && !loading && (
        <p className="text-[11px] text-muted">
          {source === 'ai'
            ? 'Wording by the model — every figure in it was checked against the score above.'
            : 'Wording generated from the same numbers, with no model involved.'}
        </p>
      )}
    </div>
  );
}
