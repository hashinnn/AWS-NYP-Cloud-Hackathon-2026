/**
 * UC-022 — completed tasks and estimation accuracy [Z-08].
 *
 * The interesting number is the last one: how far the student's effort
 * estimates sit from reality. It is offered back at task creation, which makes
 * every future EffortPressure calculation more honest — a self-correcting loop
 * that costs almost nothing once hours are being logged.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { formatDay, formatHours } from '../lib/countdown';
import ModuleChip from '../components/ModuleChip';

function Stat({ label, value, hint, tone = 'text-ink' }: {
  label: string; value: string; hint?: string; tone?: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function Completed() {
  const [data, setData] = useState<any>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/completed')
      .then((response) => { setData(response.data); setProblem(null); })
      .catch((error) => setProblem(errorMessage(error, 'Could not load your completed tasks.')));
  }, []);

  if (problem) return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-crittext sm:px-6">{problem}</div>;
  if (!data) return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted sm:px-6">Loading…</div>;

  const { weeks, stats } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Completed</h1>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Completed"
          value={String(stats.completedThisWeek)}
          hint={`${stats.completedThisMonth} in the last month`}
        />
        <Stat
          label="On time"
          value={stats.onTimeRate === null ? '—' : `${Math.round(stats.onTimeRate * 100)}%`}
          hint="Submitted on or before the deadline"
          tone={stats.onTimeRate !== null && stats.onTimeRate < 0.7 ? 'text-warntext' : 'text-ink'}
        />
        <Stat
          label="Estimation"
          // Alt A — below three usable samples this is honestly blank rather
          // than a figure derived from one data point.
          value={stats.estimationAccuracy === null ? '—' : `${stats.estimationAccuracy}×`}
          hint={stats.estimationAccuracy === null
            ? (stats.hoursLogged
              ? `Not enough data yet (${stats.minSample} needed, you have ${stats.sampleSize})`
              : 'Log hours when you update progress to unlock this')
            : `Your ${stats.sampleSize} logged tasks took ${stats.estimationAccuracy}× your estimate`}
          tone={stats.estimationAccuracy && stats.estimationAccuracy > 1.2 ? 'text-warntext' : 'text-ink'}
        />
      </div>

      {/* Alt B — say what turns the panel on, and link to where it happens. */}
      {!stats.hoursLogged && (
        <p className="mt-3 text-xs text-muted">
          Estimation accuracy compares hours logged against hours estimated.{' '}
          <Link to="/tasks" className="text-ink underline underline-offset-2">Log hours on a task</Link> to start it.
        </p>
      )}

      {data.hint && (
        <p className="mt-3 rounded-card border border-hairline bg-warntint px-4 py-3 text-sm text-warntext">
          {data.hint.message} This is offered as a suggestion the next time you add a task.
        </p>
      )}

      {stats.perModule.length > 1 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink">Where your estimates slip</h2>
          <ul className="mt-2 space-y-1.5">
            {stats.perModule.map((row: any) => (
              <li key={row.module} className="flex items-center gap-3 text-sm">
                <ModuleChip code={row.module === '—' ? null : row.module} size="sm" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((row.ratio / 2) * 100, 100)}%`,
                      backgroundColor: row.ratio > 1.2 ? 'var(--color-warning)' : 'var(--color-good)',
                    }}
                  />
                </div>
                <span className="num w-12 text-right text-ink2">{row.ratio}×</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* E2 — an outlier is flagged for correction, not silently binned. */}
      {stats.outliers.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Excluded as likely mis-logged:{' '}
          {stats.outliers.map((outlier: any) => `${outlier.title} (${outlier.ratio}×)`).join(', ')}.{' '}
          Correct the hours on those tasks and this figure improves.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">By week</h2>

        {weeks.length === 0 && (
          <p className="mt-2 text-sm text-muted">Nothing completed yet. Finished tasks land here.</p>
        )}

        {weeks.map((week: any) => (
          <div key={week.weekStart} className="mt-4">
            <p className="flex items-baseline gap-2 text-xs text-muted">
              <span className="font-medium text-ink2">Week of {formatDay(`${week.weekStart}T00:00:00Z`)}</span>
              <span className="num">{week.tasks.length} done</span>
              {week.late > 0 && <span className="num text-crittext">{week.late} late</span>}
            </p>

            <ul className="mt-1 divide-y divide-hairline border-y border-hairline">
              {week.tasks.map((task: any) => (
                <li key={task.taskId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <ModuleChip code={task.module} size="sm" />
                  <Link to={`/tasks/${task.taskId}`} className="min-w-0 flex-1 truncate text-sm text-ink">
                    {task.title}
                  </Link>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      task.onTime ? 'bg-goodtint text-goodtext' : 'bg-crittint text-crittext'
                    }`}
                  >
                    {task.onTime ? 'on time' : 'late'}
                  </span>
                  <span className="num text-xs text-muted">
                    {formatHours(task.hoursSpent || 0)} of {formatHours(task.effortHours || 0)} est
                  </span>
                  {task.gradeWeight != null && (
                    <span className="num text-xs text-muted">{task.gradeWeight}%</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
