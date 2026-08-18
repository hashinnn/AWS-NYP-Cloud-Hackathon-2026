/**
 * UC-016 steps 4–5 — one row of the ranked list.
 *
 * The row carries the claim: a rank badge, then the figures behind it one
 * click away. Expanding fetches nothing it can avoid — the sub-scores were
 * persisted by UC-009 and arrived with the ranking, so the bar is instant and
 * only the sentence (UC-010) may need a request.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { contributionsOf } from '../lib/priority';
import ModuleChip from './ModuleChip';
import ProgressRing from './ProgressRing';
import Countdown from './Countdown';
import PriorityExplanation from './PriorityExplanation';

const TYPE_ICON: Record<string, string> = {
  assignment: '📄',
  test: '📝',
  project: '🧩',
  presentation: '🎤',
};

export default function RankedRow({
  task, rank, weights, onResolve,
}: {
  task: any;
  rank: number;
  weights: any;
  onResolve?: (task: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<any>(
    task.explanation
      ? { text: task.explanation, source: task.explanationSource || 'template' }
      : null,
  );
  const [loading, setLoading] = useState(false);

  const overdue = task.status === 'overdue';
  const contributions = contributionsOf(task.subScores || {}, weights);

  async function expand() {
    const next = !open;
    setOpen(next);
    if (!next || explanation || !task.subScores) return;

    // UC-010: the sentence is the only thing on this screen that can involve a
    // model, and it is requested after the row is already readable — the bar
    // and every figure are on screen whether it answers or not.
    setLoading(true);
    try {
      const response = await api.post('/api/explain', { taskIds: [task.taskId] });
      setExplanation(response.data.explanations?.[task.taskId] || null);
    } catch {
      setExplanation(null); // the bar alone still explains the ranking
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className={overdue ? 'bg-crittint/40' : ''}>
      <div className="flex items-baseline gap-3 px-2 py-3">
        <span
          className={`num w-7 shrink-0 rounded-md py-0.5 text-center text-sm font-semibold ${
            overdue ? 'bg-critical text-plane' : 'bg-plane text-ink'
          }`}
        >
          {overdue ? '!' : rank}
        </span>

        <button type="button" onClick={expand} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true">{TYPE_ICON[task.type] || '•'}</span>
            <ModuleChip code={task.module} size="sm" />
            <span className="truncate text-sm font-medium text-ink">{task.title}</span>
            {task.tight && (
              <span
                className="rounded-full bg-crittint px-1.5 py-0.5 text-[10px] font-medium text-crittext"
                title="The work left does not fit in the hours you have before the deadline"
              >
                doesn’t fit
              </span>
            )}
            {task.dataGap?.length > 0 && (
              <span className="rounded-full bg-warntint px-1.5 py-0.5 text-[10px] font-medium text-warntext">
                add {task.dataGap[0]}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs">
            <Countdown type={task.type} dueAt={task.dueAt} status={task.status} />
            {task.priorityScore === null && (
              <span className="ml-2 text-muted">score pending</span>
            )}
          </span>
        </button>

        <ProgressRing value={task.progressPct} label={`${task.progressPct || 0}% done`} />
        <span className="num w-9 shrink-0 text-right text-sm font-medium text-ink">
          {task.priorityScore ?? '—'}
        </span>
      </div>

      {open && (
        <div className="px-2 pb-4 pl-12">
          {task.subScores ? (
            <PriorityExplanation
              text={explanation?.text || null}
              source={explanation?.source || null}
              contributions={explanation?.contributions || contributions}
              figures={task.figures}
              total={task.priorityScore ?? undefined}
              loading={loading && !explanation}
            />
          ) : (
            <p className="text-sm text-muted">
              No score yet — the next hourly run will fill this in.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link to={`/tasks/${task.taskId}`} className="text-ink underline underline-offset-2">
              Open task
            </Link>
            <Link to="/focus" className="text-ink2 underline underline-offset-2">
              Focus on this
            </Link>
            {/* UC-021 step 4 — the three resolutions, offered where the
                overdue task actually is. */}
            {overdue && onResolve && (
              <button
                type="button"
                onClick={() => onResolve(task)}
                className="font-medium text-crittext underline underline-offset-2"
              >
                Resolve this
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
