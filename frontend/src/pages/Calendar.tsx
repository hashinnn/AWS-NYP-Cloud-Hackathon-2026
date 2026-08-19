/**
 * UC-017 — calendar and timeline [Z-04].
 *
 * The calendar plots deadline POINTS. The timeline plots work PERIODS: each
 * task as a span from the date work should start to the date it is due, with
 * elapsed time shaded against progress actually recorded. Most teams will plot
 * the point and stop; the gap between the two shadings is the part that tells
 * a student they are behind before the deadline does.
 *
 * Rendered with layout, not a chart library — a span is a positioned div, and
 * every colour comes from the shared theme so modules match everywhere.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { moduleColour } from '../lib/chartTheme';
import { formatDate, formatDay, formatHours } from '../lib/countdown';
import ModuleChip from '../components/ModuleChip';

const DAY = 86400000;
const VIEWS = ['week', 'month', 'timeline'] as const;
type View = typeof VIEWS[number];

const RANGE_DAYS: Record<View, number> = { week: 7, month: 35, timeline: 56 };
const MAX_ENTRIES = 40; // E3 — beyond this the view paginates rather than crawls

/** Monday 00:00 local, for the week containing `at`. */
function weekStart(at: number) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime() - ((date.getDay() + 6) % 7) * DAY;
}

export default function Calendar() {
  const [view, setView] = useState<View>('month');
  const [offset, setOffset] = useState(0); // in whole ranges, from today
  const [data, setData] = useState<any>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [plainList, setPlainList] = useState(false);

  // E3 — a range dense enough to hurt the render is paged BY WEEK rather than
  // silently truncated, so every deadline stays reachable. The flag is set by
  // the load below, once we know how many entries the range actually holds.
  const [pagedByWeek, setPagedByWeek] = useState(false);

  const rangeDays = pagedByWeek ? 7 : RANGE_DAYS[view];
  const from = useMemo(
    () => weekStart(Date.now()) + offset * rangeDays * DAY,
    [rangeDays, offset],
  );
  const to = from + rangeDays * DAY;

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/calendar', {
        params: { view, from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      });
      setData(response.data);
      // Once a range comes back over the limit, drop to weekly paging and stay
      // there for this view — flipping back and forth as the student navigates
      // would move the ← → buttons under their cursor.
      if ((response.data.entries || []).length > MAX_ENTRIES) setPagedByWeek(true);
      setProblem(null);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not load your calendar.'));
    }
  }, [view, from, to]);

  useEffect(() => { load(); }, [load]);

  const entries = data?.entries || [];
  const spans = data?.spans || [];
  // Weekly paging keeps the count honest even in the rare week that is still
  // dense: nothing is hidden without the number being on screen.
  const visible = entries.length > MAX_ENTRIES ? entries.slice(0, MAX_ENTRIES) : entries;

  const days = useMemo(() => {
    const count = view === 'month' && !pagedByWeek ? 35 : 7;
    return Array.from({ length: count }, (ignored, i) => from + i * DAY);
  }, [from, view, pagedByWeek]);

  const today = Date.now();
  const todayPct = ((today - from) / (to - from)) * 100;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="display text-[26px] leading-tight text-ink">Calendar</h1>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setView(value); setOffset(0); }}
              className={`rounded-lg px-2.5 py-1 text-sm capitalize transition ${
                view === value ? 'bg-accent font-medium text-plane' : 'text-ink2 hover:text-ink'
              }`}
            >
              {value}
            </button>
          ))}
          <div className="ml-2 flex items-center gap-1">
            <button type="button" onClick={() => setOffset(offset - 1)} className="rounded-lg border border-hairline px-2 py-1 text-sm text-ink2" aria-label="Previous">←</button>
            <button type="button" onClick={() => setOffset(0)} className="rounded-lg border border-hairline px-2 py-1 text-sm text-ink2">Today</button>
            <button type="button" onClick={() => setOffset(offset + 1)} className="rounded-lg border border-hairline px-2 py-1 text-sm text-ink2" aria-label="Next">→</button>
          </div>
        </div>
      </div>

      <p className="mt-1 text-xs text-muted">
        {formatDay(new Date(from).toISOString())} → {formatDay(new Date(to - DAY).toISOString())}
        {' · '}
        <span className="num">{entries.length}</span> deadline{entries.length === 1 ? '' : 's'}
        {pagedByWeek && ' · paging a week at a time — use ← → for the rest'}
        {entries.length > MAX_ENTRIES && ` · showing the first ${MAX_ENTRIES}`}
      </p>

      {problem && (
        <div className="mt-4 rounded-card border border-hairline bg-surface p-4">
          <p className="text-sm text-crittext">{problem}</p>
          <button type="button" onClick={load} className="mt-2 text-sm text-ink underline underline-offset-2">Retry</button>
        </div>
      )}

      {/* E2 — the view is never blank: a plain list of the period's deadlines
          is always one click away, and takes over if a render fails. */}
      {!problem && (
        <button
          type="button"
          onClick={() => setPlainList(!plainList)}
          className="mt-3 text-xs text-muted underline underline-offset-2"
        >
          {plainList ? 'Show the calendar' : 'Show a plain list instead'}
        </button>
      )}

      {plainList && (
        <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
          {visible.map((entry: any) => (
            <li key={entry.taskId} className="flex items-baseline gap-3 py-2.5">
              <span className="w-28 shrink-0 text-xs text-muted">{formatDate(entry.dueAt)}</span>
              <ModuleChip code={entry.module} size="sm" />
              <Link to={`/tasks/${entry.taskId}`} className="truncate text-sm text-ink">{entry.title}</Link>
            </li>
          ))}
        </ul>
      )}

      {/* ── Week / month grid: deadlines positioned by day, coloured by module ── */}
      {!plainList && view !== 'timeline' && (
        <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-card border border-hairline bg-hairline">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div key={label} className="bg-surface px-2 py-1.5 text-center text-[11px] font-medium text-muted">
              {label}
            </div>
          ))}

          {days.map((dayStart) => {
            const dayEnd = dayStart + DAY;
            const onDay = visible.filter((entry: any) => {
              const due = Date.parse(entry.dueAt);
              return due >= dayStart && due < dayEnd;
            });
            const isToday = today >= dayStart && today < dayEnd;

            return (
              <div
                key={dayStart}
                className={`min-h-24 bg-surface p-1.5 ${isToday ? 'ring-1 ring-inset ring-ink' : ''}`}
              >
                <p className={`num text-[11px] ${isToday ? 'font-semibold text-ink' : 'text-muted'}`}>
                  {new Date(dayStart).getDate()}
                </p>
                <div className="mt-1 space-y-1">
                  {onDay.map((entry: any) => (
                    <Link
                      key={entry.taskId}
                      to={`/tasks/${entry.taskId}`}
                      title={`${entry.title} — ${entry.gradeWeight ?? '?'}% · priority ${entry.priorityScore ?? '—'}`}
                      className="block truncate rounded border-l-2 bg-plane px-1 py-0.5 text-[11px] text-ink"
                      style={{
                        borderLeftColor: moduleColour(entry.module),
                        // Grade weight as border weight: a 40% report reads
                        // heavier than a 5% quiz without needing a number.
                        borderLeftWidth: `${Math.min(2 + (entry.gradeWeight || 0) / 12, 6)}px`,
                      }}
                    >
                      {entry.rank && <span className="num mr-1 font-semibold">{entry.rank}</span>}
                      {entry.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Timeline: the work period, not just the endpoint ── */}
      {!plainList && view === 'timeline' && (
        <div className="mt-4 rounded-card border border-hairline bg-surface p-4">
          <div className="relative">
            {/* Step 8 — today, as a line you can see the spans cross. */}
            {todayPct >= 0 && todayPct <= 100 && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent"
                style={{ left: `calc(${todayPct}% )` }}
                aria-hidden="true"
              />
            )}

            <div className="space-y-2">
              {spans.length === 0 && <p className="text-sm text-muted">Nothing scheduled in this range.</p>}

              {spans.map((span: any) => {
                const start = Math.max(Date.parse(span.startAt), from);
                const end = Math.min(Date.parse(span.dueAt), to);
                const left = ((start - from) / (to - from)) * 100;
                const width = Math.max(((end - start) / (to - from)) * 100, 1.5);

                return (
                  <Link key={span.taskId} to={`/tasks/${span.taskId}`} className="block">
                    <p className="flex items-center gap-2 text-xs text-ink2">
                      <span className="truncate font-medium text-ink">{span.title}</span>
                      <ModuleChip code={span.module} size="sm" />
                      {/* Alt A — an estimated period is labelled as one. */}
                      {!span.planned && <span className="text-[10px] text-muted">estimated work period</span>}
                      {span.startedLate && <span className="text-[10px] text-warntext">started late</span>}
                      {span.behindBy > 0 && (
                        <span className="num ml-auto text-[10px] text-crittext">{span.behindBy}% behind</span>
                      )}
                    </p>

                    <div className="relative mt-1 h-6 w-full rounded bg-plane">
                      <div
                        className={`absolute inset-y-0 rounded ${span.planned ? '' : 'border border-dashed'}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: `color-mix(in srgb, ${moduleColour(span.module)} 22%, transparent)`,
                          borderColor: moduleColour(span.module),
                        }}
                      >
                        {/* Two shadings, deliberately overlaid: how much of the
                            period has gone, and how much work is actually done. */}
                        <div
                          className="absolute inset-y-0 left-0 rounded-l opacity-30"
                          style={{ width: `${span.elapsedPct}%`, backgroundColor: 'var(--color-muted)' }}
                        />
                        <div
                          className="absolute inset-y-1 left-0 rounded-l"
                          style={{ width: `${span.progressPct}%`, backgroundColor: moduleColour(span.module) }}
                        />

                        {span.milestones.map((milestone: any) => {
                          const at = Date.parse(milestone.dueAt);
                          const within = ((at - start) / Math.max(end - start, 1)) * 100;
                          if (within < 0 || within > 100) return null;
                          return (
                            <span
                              key={milestone.milestoneId}
                              title={`${milestone.name}${milestone.hours ? ` — ${formatHours(milestone.hours)}` : ''}`}
                              className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                                milestone.done ? 'bg-accent' : 'bg-surface'
                              }`}
                              style={{ left: `${within}%`, borderColor: 'var(--color-ink)' }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <p className="mt-4 flex flex-wrap gap-4 border-t border-hairline pt-3 text-[11px] text-muted">
            <span>Solid fill — progress recorded</span>
            <span>Grey wash — time elapsed</span>
            <span>Dashed border — estimated period</span>
            <span>Dots — milestones, filled when done</span>
          </p>
        </div>
      )}
    </div>
  );
}
