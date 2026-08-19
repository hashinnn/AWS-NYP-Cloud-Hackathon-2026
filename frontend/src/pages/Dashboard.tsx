/**
 * UC-016 — the dashboard [Z-03].
 *
 * Sorted by priorityScore descending BY DEFAULT. The default sort is not a
 * preference, it is the argument: a deadline tracker that opens in deadline
 * order has already conceded that nearest-first is good enough.
 *
 * One request (`/api/dashboard`) carries NEXT UP, capacity, counts, alerts and
 * the whole ranking, because the postcondition is five seconds and four
 * round trips is not five seconds on venue wifi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { openCapture } from '../lib/capture';
import { useTasks } from '../context/TasksContext';
import { formatHours } from '../lib/countdown';
import { capacityColour } from '../lib/chartTheme';
import { normaliseWeights } from '../lib/priority';
import RankedRow from '../components/RankedRow';
import Countdown from '../components/Countdown';
import ModuleChip from '../components/ModuleChip';
import CrashWeekCard from '../components/CrashWeekCard';
import OverdueDialog from '../components/OverdueDialog';
// Hasini's boundary is written generically (children + fallback), so E2 reuses
// it rather than adding a second copy of the same six lines.
import RowBoundary from '../components/ChartBoundary';

const SORTS = [
  { value: 'priority', label: 'By priority' },
  { value: 'deadline', label: 'By deadline' },
];

const FILTER_KEY = 'deadlineiq.dashboard.filters';

export default function Dashboard() {
  const { refresh: refreshRanking, ranking: cachedRanking } = useTasks();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<any[] | null>(null);

  // Step 6 — filters persist across navigation. sessionStorage rather than
  // state in the router, so coming back from a task detail keeps the view.
  const [view, setView] = useState(() => {
    try {
      return { sort: 'priority', module: '', ...JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') };
    } catch {
      return { sort: 'priority', module: '' };
    }
  });

  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(view));
  }, [view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/dashboard');
      setData(response.data);
      setDegraded(null);
    } catch (error) {
      // E1 — the app stays usable. The ranking the context already holds is
      // shown in deadline order behind a banner rather than a blank screen.
      setDegraded(errorMessage(error, 'Live prioritisation unavailable — showing deadline order.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const weights = useMemo(() => normaliseWeights(data?.weights), [data]);
  const ranking = data?.ranking || [];

  const modules = useMemo(
    () => [...new Set(ranking.map((task: any) => task.module).filter(Boolean))],
    [ranking],
  );

  const shown = useMemo(() => {
    const filtered = view.module
      ? ranking.filter((task: any) => task.module === view.module)
      : ranking;
    if (view.sort !== 'deadline') return filtered;
    return [...filtered].sort((a: any, b: any) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  }, [ranking, view]);

  const overdue = ranking.filter((task: any) => task.status === 'overdue');

  async function afterResolve() {
    await Promise.all([load(), refreshRanking()]);
  }

  if (loading && !data) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted sm:px-6">Loading your week…</div>;
  }

  // E1 — the ranking endpoint is down. The app stays usable: the tasks the
  // context already holds, in deadline order, behind a banner that says
  // exactly what is missing. A spinner or an error page would be a worse
  // answer than a slightly wrong order the student can still work from.
  if (degraded && !data) {
    const byDeadline = [...(cachedRanking || [])]
      .sort((a: any, b: any) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="display text-[26px] leading-tight text-ink">Dashboard</h1>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-warning/40 bg-warntint px-4 py-3">
          <p className="text-sm text-warntext">
            Live prioritisation unavailable — showing deadline order.
          </p>
          <button
            type="button"
            onClick={load}
            className="ml-auto rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-ink"
          >
            Retry
          </button>
        </div>

        {byDeadline.length === 0 ? (
          <p className="mt-6 text-sm text-muted">Nothing cached to show yet. Retry when you have a connection.</p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
            {byDeadline.map((task: any) => (
              <li key={task.taskId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <ModuleChip code={task.module} size="sm" />
                <Link to={`/tasks/${task.taskId}`} className="min-w-0 flex-1 truncate text-sm text-ink">
                  {task.title}
                </Link>
                <Countdown type={task.type} dueAt={task.dueAt} status={task.status} className="text-xs" />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const { nextUp, thisWeek, counts, alerts } = data;
  const ratio = thisWeek.ratio;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="display text-[26px] leading-tight text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link to="/calendar" className="text-sm text-ink2 underline underline-offset-2">
          Calendar and timeline
        </Link>
      </div>

      {/* Alt A — a new student gets a route in, not an empty page. */}
      {ranking.length === 0 && (
        <div className="mt-6 rounded-card border border-hairline bg-surface p-6">
          <h2 className="text-base font-semibold text-ink">Add your first deadline</h2>
          <p className="mt-1 text-sm text-muted">Three ways in — all of them end in a confirmation you can edit.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([
              ['Type it', 'Quick-add understands “report due next Friday 11:59pm, 30% of IT2214”.', 'nl'],
              ['Upload a brief', 'Pull the deadline, weighting and deliverables out of a PDF.', 'brief'],
              ['Full form', 'Every field, with sensible defaults by task type.', 'form'],
            ] as const).map(([title, hint, mode]) => (
              <button
                key={title}
                type="button"
                onClick={() => openCapture(mode)}
                className="rounded-lg border border-hairline p-3 text-left transition hover:border-ink"
              >
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="mt-1 text-xs text-muted">{hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {ranking.length > 0 && (
        <>
          {/* ── Above the fold: what's next, how loaded, what's late ── */}
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <section className="rounded-card border border-hairline bg-surface p-5 shadow-card lg:col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Next up</p>
              {nextUp ? (
                <>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <ModuleChip code={nextUp.module} />
                    {nextUp.status === 'overdue' && (
                      <span className="rounded-full bg-crittint px-2 py-0.5 text-[11px] font-medium text-crittext">
                        overdue
                      </span>
                    )}
                  </div>
                  <h2 className="display mt-1.5 text-[30px] leading-[1.12] text-ink">{nextUp.title}</h2>
                  <p className="mt-1.5 text-[15px]">
                    <Countdown type={nextUp.type} dueAt={nextUp.dueAt} status={nextUp.status} precise />
                  </p>
                  {nextUp.explanation && (
                    <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink2">{nextUp.explanation}</p>
                  )}
                  <Link
                    to="/focus"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-plane transition hover:opacity-90"
                  >
                    Open Focus Mode
                    <span aria-hidden="true">→</span>
                  </Link>
                </>
              ) : (
                // Alt B — everything done is a real state worth showing well.
                <p className="mt-2 text-sm text-ink2">You’re on top of everything. Nothing is due.</p>
              )}
            </section>

            <section className="rounded-card border border-hairline bg-surface p-5 shadow-card">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">This week</p>
              <p className="display num mt-2 text-[28px] text-ink">
                {formatHours(thisWeek.required)}
                <span className="text-base text-muted"> / {formatHours(thisWeek.available)}</span>
              </p>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    // Amber above 80%, red above 100% — the shared tokens, so
                    // this bar and the heatmap always agree.
                    width: `${Math.min((ratio || 0) * 100, 100)}%`,
                    backgroundColor: capacityColour(ratio || 0),
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                {thisWeek.unavailable
                  ? 'No study time available this week.'
                  : `${Math.round((ratio || 0) * 100)}% of your capacity`}
              </p>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
                {[
                  ['Due in 7d', counts.dueIn7, 'text-ink'],
                  ['Overdue', counts.overdue, counts.overdue > 0 ? 'text-crittext' : 'text-ink'],
                  ['Done', counts.completedThisWeek, 'text-goodtext'],
                ].map(([label, value, tone]) => (
                  <div key={label as string}>
                    <dd className={`num text-lg font-semibold ${tone}`}>{value as number}</dd>
                    <dt className="text-[11px] text-muted">{label as string}</dt>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {/* UC-021 step 6 — overdue demands a decision, above everything. */}
          {overdue.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-critical/40 bg-crittint px-4 py-3">
              <p className="text-sm text-crittext">
                <span className="font-medium">
                  {overdue.length === 1 ? '1 task is overdue' : `${overdue.length} tasks are overdue`}
                </span>
                {' — resolve these first.'}
              </p>
              <button
                type="button"
                onClick={() => setResolving(overdue)}
                className="ml-auto rounded-lg bg-critical px-3 py-1.5 text-sm font-medium text-plane"
              >
                Resolve
              </button>
            </div>
          )}

          {/* UC-013's card, on the surface the student actually opens. */}
          {alerts?.length > 0 && (
            <div className="mt-4">
              <CrashWeekCard week={alerts[0]} onApplied={afterResolve} onDismissed={afterResolve} />
            </div>
          )}

          {/* ── The ranked list ── */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">Your tasks</h2>
            <span className="num text-sm text-muted">{shown.length}</span>

            <div className="ml-auto flex flex-wrap items-center gap-1">
              {modules.length > 1 && (
                <select
                  value={view.module}
                  onChange={(e) => setView({ ...view, module: e.target.value })}
                  className="rounded-lg border border-hairline bg-surface px-2 py-1 text-sm text-ink2"
                >
                  <option value="">All modules</option>
                  {modules.map((code: any) => <option key={code} value={code}>{code}</option>)}
                </select>
              )}
              {SORTS.map((sort) => (
                <button
                  key={sort.value}
                  type="button"
                  onClick={() => setView({ ...view, sort: sort.value })}
                  className={`rounded-lg px-2.5 py-1 text-sm transition ${
                    view.sort === sort.value ? 'bg-accent font-medium text-plane' : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {sort.label}
                </button>
              ))}
            </div>
          </div>

          {degraded && (
            <p className="mt-2 text-xs text-warntext">{degraded}</p>
          )}

          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
            {/* E2 — one malformed task must cost one row, not the list. */}
            {shown.map((task: any, index: number) => (
              <RowBoundary
                key={task.taskId}
                fallback={(
                  <li className="flex items-baseline gap-3 px-2 py-3 text-sm text-muted">
                    <span className="num w-7 shrink-0 text-center">{index + 1}</span>
                    <Link to={`/tasks/${task.taskId}`} className="truncate text-ink">
                      {task.title || 'Untitled task'}
                    </Link>
                    <span className="ml-auto text-xs">couldn’t render this card</span>
                  </li>
                )}
              >
                <RankedRow
                  task={task}
                  rank={view.sort === 'priority' ? index + 1 : ranking.indexOf(task) + 1}
                  weights={weights}
                  onResolve={(one) => setResolving([one])}
                />
              </RowBoundary>
            ))}
          </ul>
        </>
      )}

      {resolving && (
        <OverdueDialog
          tasks={resolving}
          onClose={() => setResolving(null)}
          onResolved={afterResolve}
        />
      )}
    </div>
  );
}
