/**
 * UC-018 — the semester workload heatmap, with UC-013's crash-week card.
 *
 * The whole semester's shape at a glance, and the worst week actionable in two
 * clicks. The grid is CSS rather than a Chart.js matrix: 12 cells need hatching
 * for blocked weeks, rich hover content and click targets, and avoiding the
 * matrix plugin keeps the dependency list — and the venue-wifi risk — smaller.
 * The capacity trend beneath is Chart.js, themed from chartTheme.ts.
 *
 * Every cell carries its percentage and its hours as text, so the load band is
 * never communicated by colour alone.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CategoryScale, Chart as ChartJS, Filler, Legend, LineController, LineElement,
  LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { api, errorMessage } from '../lib/api';
import {
  LOAD_BANDS, STATUS, chartDefaults, chartTokens, loadBand,
} from '../lib/chartTheme';
import { resolvedMode } from '../lib/theme';
import { formatHours } from '../lib/countdown';
import { useTasks } from '../context/TasksContext';
import CrashWeekCard from '../components/CrashWeekCard';
import ChartBoundary from '../components/ChartBoundary';
import ModuleChip from '../components/ModuleChip';

// LineController is not optional: without it Chart.js sizes the canvas and
// then draws nothing at all, silently.
ChartJS.register(
  LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
);

const WEEKDAYS: Array<[string, string]> = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
];

const LEGEND: Array<[string, string]> = [
  ['light', 'under half'], ['moderate', 'steady'], ['busy', 'busy'], ['crash', 'over capacity'],
];

export default function Workload() {
  const { prefs, setPrefs, refresh } = useTasks();
  const [weeks, setWeeks] = useState<any[]>([]);
  const [crashWeeks, setCrashWeeks] = useState<any[]>([]);
  const [sparse, setSparse] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(resolvedMode());

  // Canvas colours are baked in at paint time, so the chart is rebuilt when the
  // theme changes — by the toggle, or by the device switching underneath us.
  useEffect(() => {
    const sync = () => setMode(resolvedMode());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('themechange', sync);
    media.addEventListener('change', sync);
    return () => {
      window.removeEventListener('themechange', sync);
      media.removeEventListener('change', sync);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/workload/heatmap', { params: { weeks: 12 } });
      setWeeks(response.data.weeks || []);
      setCrashWeeks(response.data.crashWeeks || []);
      setSparse(response.data.sparse);
      setProblem(null);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not load your workload.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedWeek = useMemo(
    () => crashWeeks.find((week: any) => week.weekStart === selected) || crashWeeks[0] || null,
    [crashWeeks, selected],
  );
  const hoveredWeek = weeks.find((week: any) => week.weekStart === hovered);
  const peak = Math.max(1, ...weeks.map((w: any) => Math.max(w.requiredHours, w.availableHours)));

  // Alt B — adjust availability here and watch the grid re-shade. The
  // consequence of the setting is shown, not hidden.
  async function setAvailability(day: string, hours: number) {
    if (!prefs) return;
    const next = { ...prefs, availability: { ...prefs.availability, [day]: hours } };
    setPrefs(next);
    try {
      await api.put('/api/prefs', next);
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not save that availability change.'));
    }
  }

  const tokens = chartTokens();
  const trend = {
    labels: weeks.map((week: any) => week.label),
    datasets: [
      {
        label: 'Required',
        data: weeks.map((week: any) => week.requiredHours),
        borderColor: tokens.series(1),
        backgroundColor: `${tokens.series(1)}1a`, // the same hue at ~10%
        fill: true,
      },
      {
        label: 'Available',
        data: weeks.map((week: any) => week.availableHours),
        borderColor: tokens.axis,
        borderDash: [4, 4],
        fill: false,
      },
    ],
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-hairline/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Workload</h1>
          <p className="mt-0.5 text-sm text-ink2">
            The next 12 weeks — hours of work against hours you actually have
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          {LEGEND.map(([band, label]) => (
            <li key={band} className="flex items-center gap-1.5 text-xs text-ink2">
              <span
                className="inline-block size-2.5 rounded-[3px] border"
                style={{
                  backgroundColor: (LOAD_BANDS as any)[band].fill,
                  borderColor: (LOAD_BANDS as any)[band].edge,
                }}
              />
              {label}
            </li>
          ))}
        </ul>
      </header>

      {problem && <p className="mt-4 text-sm text-crittext">{problem}</p>}

      <div className="relative mt-5">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {weeks.map((week: any) => {
            const band = loadBand(week.loadRatio, week.unavailable);
            const tone = LOAD_BANDS[band];
            const isCrash = week.crash;
            const isSelected = selectedWeek?.weekStart === week.weekStart;
            return (
              <button
                key={week.weekStart}
                type="button"
                onClick={() => isCrash && setSelected(week.weekStart)}
                onMouseEnter={() => setHovered(week.weekStart)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(week.weekStart)}
                onBlur={() => setHovered(null)}
                className={`reorder relative overflow-hidden rounded-xl border p-3 text-left ${
                  week.unavailable ? 'hatched' : ''
                } ${isCrash ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'} ${
                  isSelected ? 'ring-2 ring-critical ring-offset-2 ring-offset-plane' : ''
                }`}
                style={{
                  backgroundColor: tone.fill,
                  borderColor: isCrash ? STATUS.critical : 'var(--color-hairline)',
                }}
                aria-label={`Week of ${week.label}, ${
                  week.unavailable
                    ? 'no study time available'
                    : `${Math.round((week.loadRatio || 0) * 100)} percent loaded`
                }${isCrash ? ', over capacity' : ''}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium tracking-wide text-ink2 uppercase">
                    {week.label}
                  </span>
                  {isCrash && (
                    <span className="size-1.5 rounded-full bg-critical" aria-hidden="true" />
                  )}
                </div>

                <div className="num mt-2 text-2xl leading-none font-semibold text-ink">
                  {week.unavailable ? '—' : `${Math.round(week.loadRatio * 100)}%`}
                </div>

                <div className="num mt-1.5 text-[11px] text-ink2">
                  {week.unavailable
                    ? 'unavailable'
                    : `${formatHours(week.requiredHours)} / ${formatHours(week.availableHours)}`}
                </div>

                {isCrash && week.overloadHours > 0 && (
                  <div className="num mt-1 text-[11px] font-semibold text-crittext">
                    +{formatHours(week.overloadHours)} over
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Alt A — an empty grid would read as "you're fine", which is a lie. */}
        {sparse && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-plane/70 backdrop-blur-[1px]">
            <p className="rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-ink2 shadow-sm">
              Add more deadlines to see your semester shape
            </p>
          </div>
        )}
      </div>

      {/* Hover detail — reserved space, so the page never jumps. */}
      <div className="mt-3 min-h-14">
        {hoveredWeek && hoveredWeek.tasks.length > 0 && (
          <div className="rounded-xl border border-hairline bg-surface p-3">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Week of {hoveredWeek.label}
            </p>
            <ul className="mt-2 space-y-1">
              {hoveredWeek.tasks.map((entry: any, i: number) => (
                <li
                  key={`${entry.taskId}-${entry.milestoneId || i}`}
                  className="flex items-center gap-2 text-sm text-ink2"
                >
                  <ModuleChip code={entry.module} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="num font-medium text-ink">{formatHours(entry.hours)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selectedWeek && (
        <div className="mt-4">
          <CrashWeekCard
            week={selectedWeek}
            onApplied={async () => { await Promise.all([load(), refresh()]); }}
            onDismissed={load}
          />
        </div>
      )}

      <div className="mt-8 rounded-card border border-hairline bg-surface p-5">
        <h2 className="text-sm font-medium text-ink">Required versus available</h2>
        <div className="mt-3 h-56">
          <ChartBoundary
            fallback={(
              <ul className="space-y-1.5">
                {weeks.map((week: any) => (
                  <li key={week.weekStart} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-ink2">{week.label}</span>
                    <span className="h-2 rounded-full bg-hairline" style={{ width: `${(week.availableHours / peak) * 60}%` }} />
                    <span className="num text-ink2">
                      {formatHours(week.requiredHours)} / {formatHours(week.availableHours)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          >
            <Line key={mode} data={trend} options={chartDefaults() as any} />
          </ChartBoundary>
        </div>
      </div>

      {prefs?.availability && (
        <div className="mt-6 rounded-card border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Study hours per day</h2>
          <p className="mt-0.5 text-xs text-muted">
            Drag one down and watch the grid above re-shade.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            {WEEKDAYS.map(([day, label]) => (
              <div key={day}>
                <label htmlFor={`av-${day}`} className="flex items-baseline justify-between text-xs text-ink2">
                  <span>{label}</span>
                  <span className="num font-medium text-ink">{prefs.availability[day] ?? 0} h</span>
                </label>
                <input
                  id={`av-${day}`}
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={prefs.availability[day] ?? 0}
                  onChange={(e) => setPrefs({
                    ...prefs,
                    availability: { ...prefs.availability, [day]: Number(e.target.value) },
                  })}
                  onMouseUp={(e) => setAvailability(day, Number((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => setAvailability(day, Number((e.target as HTMLInputElement).value))}
                  className="mt-1 w-full"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
