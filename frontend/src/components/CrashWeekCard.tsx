/**
 * UC-013 step 5 — the crash-week card.
 *
 * Every recommendation names a task, a number of days and a number of hours,
 * and it was computed deterministically — a student can check all three. Where
 * no plan exists, the card says so and offers no Apply button, because an
 * Apply that cannot change anything is worse than no Apply at all (Alt A).
 */

import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatHours } from '../lib/countdown';

export default function CrashWeekCard({
  week, onApplied, onDismissed,
}: {
  week: any;
  onApplied?: (result: any) => void;
  onDismissed?: () => void;
}) {
  const [busy, setBusy] = useState<null | 'apply' | 'dismiss'>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const recommendation = week.recommendation;
  const canApply = recommendation && recommendation.kind !== 'no_capacity';
  const weekKey = encodeURIComponent(week.weekStart);

  async function apply() {
    setBusy('apply');
    setProblem(null);
    try {
      const response = await api.post(`/api/workload/crash-weeks/${weekKey}/apply`);
      onApplied?.(response.data);
    } catch (error) {
      setProblem(errorMessage(error, 'Nothing could be moved.'));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy('dismiss');
    try {
      await api.post(`/api/workload/crash-weeks/${weekKey}/dismiss`);
      onDismissed?.();
    } catch (error) {
      setProblem(errorMessage(error, 'Could not dismiss this.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rise overflow-hidden rounded-card border border-hairline bg-surface">
      <div className="h-1 w-full bg-critical" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-critical" aria-hidden="true" />
              <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">
                Crash week
              </h3>
            </div>
            <p className="mt-1 text-lg font-semibold text-ink">
              Week of {week.label}
            </p>
          </div>

          <div className="text-right">
            <p className="num text-2xl font-semibold text-crittext">
              {week.overloadHours > 0 ? `+${formatHours(week.overloadHours)}` : 'over'}
            </p>
            <p className="text-xs text-muted">
              {week.unavailable
                ? 'no study time available'
                : `${formatHours(week.requiredHours)} needed · ${formatHours(week.availableHours)} free`}
            </p>
          </div>
        </div>

        {recommendation && (
          <p className="mt-4 border-l-2 border-rule pl-3 text-sm leading-relaxed text-ink2">
            {recommendation.text}
          </p>
        )}

        {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}

        <div className="mt-5 flex items-center gap-2">
          {canApply && (
            <button
              type="button"
              onClick={apply}
              disabled={busy !== null}
              className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'apply' ? 'Applying…' : 'Apply this plan'}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            disabled={busy !== null}
            className="rounded-lg border border-hairline px-3.5 py-2 text-sm text-ink2 transition hover:bg-plane disabled:opacity-50"
          >
            Dismiss for 48 h
          </button>
        </div>
      </div>
    </div>
  );
}
