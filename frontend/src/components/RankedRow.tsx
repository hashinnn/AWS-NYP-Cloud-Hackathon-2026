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
import SubScoreBar from './SubScoreBar';
import TypeIcon from './TypeIcon';

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
    <li className={`transition-colors ${overdue ? 'bg-crittint/40' : 'hover:bg-plane/60'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`display num grid size-8 shrink-0 place-items-center rounded-full border text-[15px] ${
            overdue
              ? 'border-critical bg-critical text-plane'
              : rank === 1
                ? 'border-ink bg-ink text-plane'
                : 'border-hairline bg-plane text-ink'
          }`}
        >
          {overdue ? '!' : rank}
        </span>

        <button type="button" onClick={expand} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <TypeIcon type={task.type} className="size-4 text-muted" />
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
          {/* The product's signature, on every row: the same weighted bar the
              explanation expands into, at whisper size. Colour = arithmetic. */}
          {!open && task.subScores && contributions.length > 0 && (
            <span className="mt-2 block max-w-64">
              <SubScoreBar contributions={contributions} compact />
            </span>
          )}
        </button>

        <ProgressRing value={task.progressPct} label={`${task.progressPct || 0}% done`} />
        <span className="display num w-11 shrink-0 text-right text-[17px] text-ink">
          {task.priorityScore ?? '—'}
        </span>
      </div>

      {open && (
        <div className="px-4 pb-4 pl-[60px]">
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
