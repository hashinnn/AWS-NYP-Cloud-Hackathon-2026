/**
 * The task index — the way into UC-003's detail screen.
 *
 * Deliberately plain. UC-016's dashboard is the view that interprets the
 * ranking (NEXT UP, capacity, alerts); this one just lists what exists so a
 * student can reach any task to edit it. Sorted by priority rather than
 * deadline, because that is the claim the whole product makes.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { listCountdown } from '../lib/countdown';
import ModuleChip from '../components/ModuleChip';

const FILTERS = [
  { value: '', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'deleted', label: 'Deleted' },
];

const STATUS_TONE: Record<string, string> = {
  overdue: 'text-crittext',
  completed: 'text-goodtext',
  archived: 'text-muted',
  deleted: 'text-muted',
};

export default function Tasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'priority' | 'deadline'>('priority');
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/tasks', { params: { ...(status ? { status } : {}), sort } });
      setTasks(response.data.tasks || []);
      setProblem(null);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not load your tasks.'));
    } finally {
      setLoading(false);
    }
  }, [status, sort]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="display text-[26px] leading-tight text-ink">Tasks</h1>
        <span className="num text-sm text-muted">{tasks.length}</span>

        {/* Wraps under the heading rather than pushing five buttons off-screen. */}
        <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={`rounded-lg px-2.5 py-1 text-sm transition ${
                status === filter.value ? 'bg-ink font-medium text-plane' : 'text-ink2 hover:text-ink'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSort(sort === 'priority' ? 'deadline' : 'priority')}
            className="ml-2 rounded-lg border border-hairline px-2.5 py-1 text-sm text-ink2"
          >
            {sort === 'priority' ? 'By priority' : 'By deadline'}
          </button>
        </div>
      </div>

      {problem && <p className="mt-4 text-sm text-crittext">{problem}</p>}
      {loading && <p className="mt-6 text-sm text-muted">Loading…</p>}

      {!loading && tasks.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Nothing here yet. Use <span className="font-medium text-ink">Add task</span> above.
        </p>
      )}

      <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
        {tasks.map((task) => (
          <li key={task.taskId}>
            <Link
              to={`/tasks/${task.taskId}`}
              className="flex items-baseline gap-3 py-3 transition hover:bg-surface"
            >
              <span className="num w-12 shrink-0 text-right text-sm font-medium text-ink">
                {task.priorityScore ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <ModuleChip code={task.module} size="sm" />
                  <span className="truncate text-sm text-ink">{task.title}</span>
                  {task.tight && (
                    <span className="rounded-full bg-crittint px-1.5 py-0.5 text-[10px] font-medium text-crittext">
                      doesn’t fit
                    </span>
                  )}
                </span>
                <span className={`mt-0.5 block text-xs ${STATUS_TONE[task.status] || 'text-muted'}`}>
                  {task.status === 'active'
                    ? listCountdown(task.type, task.dueAt)
                    : `${task.status} · ${listCountdown(task.type, task.dueAt)}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
