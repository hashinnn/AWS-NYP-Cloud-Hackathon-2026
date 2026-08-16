/**
 * UC-012 step 5 — the editable proposal.
 *
 * Nothing here is saved until the student accepts: the model proposes, the
 * student decides. Alt A rebalances the other rows whenever one changes, so
 * the running total always equals the task's effort estimate — the system
 * never shows an inconsistent total.
 */

import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatDay } from '../lib/countdown';

const round1 = (value: number) => Math.round(value * 10) / 10;

function rebalance(rows: any[], changedIndex: number, effortHours: number) {
  const fixed = Math.min(Math.max(Number(rows[changedIndex].hours) || 0, 0), effortHours);
  const others = rows.filter((_, i) => i !== changedIndex);
  const otherTotal = others.reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
  const remaining = Math.max(effortHours - fixed, 0);

  const scaled = rows.map((row, i) => {
    if (i === changedIndex) return { ...row, hours: round1(fixed) };
    const share = otherTotal > 0 ? (Number(row.hours) || 0) / otherTotal : 1 / others.length;
    return { ...row, hours: round1(remaining * share) };
  });

  // Absorb the rounding drift so the total is exact, not nearly right.
  const drift = round1(effortHours - scaled.reduce((sum, row) => sum + row.hours, 0));
  if (drift !== 0) {
    const target = scaled.findIndex((_, i) => i !== changedIndex);
    if (target !== -1) scaled[target].hours = round1(scaled[target].hours + drift);
  }
  return scaled;
}

export default function MilestoneEditor({
  task, onSaved, onCancel,
}: {
  task: any;
  onSaved?: (milestones: any[]) => void;
  onCancel?: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'declined'>('loading');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.post(`/api/tasks/${task.taskId}/milestones/generate`, {})
      .then((response) => {
        if (cancelled) return;
        setRows(response.data.proposed);
        setSource(response.data.source);
        setState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        // Alt B — a small task is declined gracefully, not padded out.
        setState('declined');
        setProblem(errorMessage(error, 'Could not build a breakdown.'));
      });
    return () => { cancelled = true; };
  }, [task.taskId]);

  const total = useMemo(
    () => round1(rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0)),
    [rows],
  );

  function updateHours(index: number, value: number) {
    setRows((current) => rebalance(
      current.map((row, i) => (i === index ? { ...row, hours: value } : row)),
      index,
      Number(task.effortHours) || total,
    ));
  }

  async function save() {
    setState('saving');
    setProblem(null);
    try {
      const response = await api.put(`/api/tasks/${task.taskId}/milestones`, {
        milestones: rows.map((row, index) => ({
          milestoneId: row.milestoneId,
          name: row.name,
          hours: Number(row.hours),
          dueAt: row.dueAt,
          order: index + 1,
        })),
      });
      onSaved?.(response.data.milestones);
    } catch (error) {
      setState('ready');
      setProblem(errorMessage(error, 'Could not save the breakdown.'));
    }
  }

  if (state === 'loading') {
    return (
      <div className="rounded-card border border-hairline bg-surface p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-hairline" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-hairline/60" />
          ))}
        </div>
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div className="rounded-card border border-hairline bg-surface p-5">
        <p className="text-sm text-ink2">{problem}</p>
        <button type="button" onClick={onCancel} className="mt-3 text-sm font-medium text-ink underline underline-offset-4">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="rise rounded-card border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">Proposed breakdown</h3>
        <span className="text-[11px] tracking-wide text-muted uppercase">
          {source === 'ai' ? 'AI proposal' : 'Template'} · nothing saved yet
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <li key={row.milestoneId} className="flex flex-wrap items-center gap-2">
            <span className="num w-5 shrink-0 text-xs text-muted">{index + 1}</span>
            <input
              value={row.name}
              onChange={(e) => setRows((current) => current
                .map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))}
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-plane px-2.5 py-1.5 text-sm text-ink"
              aria-label={`Milestone ${index + 1} name`}
            />
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={row.hours}
              onChange={(e) => updateHours(index, Number(e.target.value))}
              className="num w-16 rounded-lg border border-hairline bg-plane px-2 py-1.5 text-right text-sm text-ink"
              aria-label={`Milestone ${index + 1} hours`}
            />
            <input
              type="date"
              value={String(row.dueAt).slice(0, 10)}
              onChange={(e) => setRows((current) => current
                .map((r, i) => (i === index
                  ? { ...r, dueAt: new Date(`${e.target.value}T23:59:00Z`).toISOString() }
                  : r)))}
              className="num rounded-lg border border-hairline bg-plane px-2 py-1.5 text-sm text-ink"
              aria-label={`Milestone ${index + 1} date`}
            />
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              className="px-1 text-muted transition hover:text-crittext"
              aria-label={`Remove milestone ${index + 1}`}
            >
              ×
            </button>
            {row.notes?.length > 0 && (
              <p className="w-full pl-7 text-xs text-serioustext">
                {row.notes.join(' · ')} — {formatDay(row.dueAt)}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3 text-sm">
        <span className={`num ${total === Number(task.effortHours) ? 'text-ink2' : 'text-serioustext'}`}>
          Total {total} h of {task.effortHours} h estimated
        </span>
        <button
          type="button"
          onClick={() => setRows((current) => [...current, {
            milestoneId: `new-${current.length}-${Date.now()}`,
            name: 'New step',
            hours: 1,
            dueAt: current[current.length - 1]?.dueAt || task.dueAt,
            notes: [],
          }])}
          className="text-ink2 underline underline-offset-4 transition hover:text-ink"
        >
          Add a step
        </button>
      </div>

      {problem && <p className="mt-2 text-sm text-crittext">{problem}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={state === 'saving' || rows.length === 0}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving…' : 'Accept breakdown'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-hairline px-3.5 py-2 text-sm text-ink2 transition hover:bg-plane"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
