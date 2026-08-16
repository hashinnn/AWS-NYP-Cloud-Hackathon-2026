/**
 * UC-010 step 7 — the sentence, directly above the arithmetic that produced it.
 *
 * The `source` badge is deliberately visible: whether the words came from the
 * model or from the template, the numbers underneath are identical. That is
 * the whole argument, rendered.
 */

import SubScoreBar from './SubScoreBar';

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
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="h-6 w-2/3 animate-pulse rounded bg-hairline" />
      ) : (
        <p className="text-[17px] leading-relaxed text-ink">{text}</p>
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
