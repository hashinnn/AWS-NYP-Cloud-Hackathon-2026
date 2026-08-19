/**
 * UC-014 — the daily study plan.
 *
 * Concrete, ordered, hour-allocated, and every block traceable to a reason.
 * Reordering affects today's plan only — it never touches the priority scores,
 * which is why the rationale on each block still holds after a drag.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatDay, formatHours } from '../lib/countdown';
import { useTasks } from '../context/TasksContext';
import ModuleChip from '../components/ModuleChip';

export default function Today() {
  const { refresh } = useTasks();
  const [plan, setPlan] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/plan/today');
      setPlan(response.data);
      setBlocks(response.data.blocks || []);
      setProblem(null);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not build today’s plan.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function drop(target: number) {
    if (dragging === null || dragging === target) return;
    setBlocks((current) => {
      const next = [...current];
      const [moved] = next.splice(dragging, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setDragging(null);
  }

  async function complete(block: any) {
    try {
      await api.post(`/api/tasks/${block.taskId}/progress`, {
        hoursLogged: block.hours,
        ...(block.milestoneId ? { milestoneIds: [block.milestoneId] } : {}),
      });
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not log that block.'));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-2 p-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-hairline/60" />
        ))}
      </div>
    );
  }

  const planned = blocks.reduce((sum, block) => sum + block.hours, 0);
  const filled = plan?.availableHours > 0 ? Math.min(planned / plan.availableHours, 1) : 0;

  return (
    <section className="mx-auto max-w-2xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[26px] leading-tight text-ink">Today</h1>
          <p className="num mt-0.5 text-sm text-ink2">
            {formatHours(plan?.availableHours || 0)} of study time
            {plan?.spareHours > 0 ? ` · ${formatHours(plan.spareHours)} spare` : ''}
          </p>
        </div>
        {plan?.availableHours > 0 && (
          <div className="w-32">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full bg-ink" style={{ width: `${filled * 100}%` }} />
            </div>
            <p className="num mt-1 text-right text-[11px] text-muted">
              {formatHours(planned)} planned
            </p>
          </div>
        )}
      </header>

      {problem && <p className="mt-4 text-sm text-crittext">{problem}</p>}

      {/* UC-021 — overdue work needs a decision, not an hour allocation. */}
      {plan?.overdueStrip?.length > 0 && (
        <div className="mt-5 rounded-card border border-critical/30 bg-crittint p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-crittext">
            <span className="size-1.5 rounded-full bg-critical" aria-hidden="true" />
            Resolve these first — {plan.overdueStrip.length} overdue
          </p>
          <ul className="mt-2 space-y-1">
            {plan.overdueStrip.map((task: any) => (
              <li key={task.taskId} className="flex items-center gap-2 text-sm text-ink2">
                <ModuleChip code={task.module} size="sm" />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {/* `muted` only clears 2.9:1 on the light wash — not enough. */}
                <span className="text-xs text-ink2">was due {formatDay(task.dueAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Alt A — no hours today: what moves, and what that costs. */}
      {plan?.shift && (
        <div className="mt-5 rounded-card border border-warning/40 bg-warntint p-4 text-sm text-ink">
          {plan.shift.message}
        </div>
      )}

      {/* E1 — a rest state, never a blank page. */}
      {plan?.restState && (
        <div className="mt-5 rounded-card border border-hairline bg-surface p-8 text-center">
          <p className="text-lg font-medium text-ink">{plan.restState.message}</p>
          {plan.restState.nextStartBy && (
            <p className="mt-1 text-sm text-ink2">
              Next thing to start: {formatDay(plan.restState.nextStartBy)}
            </p>
          )}
        </div>
      )}

      <ol className="mt-5 space-y-2">
        {blocks.map((block, index) => (
          <li
            key={`${block.taskId}-${block.milestoneId || index}`}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(index)}
            className={`reorder group flex cursor-grab gap-4 rounded-card border bg-surface p-4 active:cursor-grabbing ${
              dragging === index ? 'border-ink opacity-60' : 'border-hairline'
            }`}
          >
            <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-plane py-2">
              <span className="num text-lg leading-none font-semibold text-ink">{block.hours}</span>
              <span className="text-[10px] tracking-wide text-muted uppercase">hours</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ModuleChip code={block.module} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {block.title}
                </span>
                <button
                  type="button"
                  onClick={() => complete(block)}
                  className="rounded-lg border border-hairline px-2.5 py-1 text-xs text-ink2 transition hover:bg-plane hover:text-ink"
                >
                  Log it
                </button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink2">{block.rationale}</p>
              {block.milestoneId && block.taskTitle !== block.title && (
                <p className="mt-0.5 text-xs text-muted">part of {block.taskTitle}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Alt B — spare capacity, with something specific to start early. */}
      {plan?.spare && (
        <div className="mt-4 rounded-card border border-good/30 bg-goodtint p-4 text-sm text-ink">
          {plan.spare.message}
        </div>
      )}
    </section>
  );
}
