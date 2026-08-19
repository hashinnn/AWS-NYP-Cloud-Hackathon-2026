/**
 * UC-004 — modules, grade weights and study availability.
 *
 * The organising idea is step 8: a setting whose effect is invisible is a
 * setting a student cannot reason about. Every availability change comes back
 * with the recomputed ranking, and the page says in words what moved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorCode, errorMessage } from '../lib/api';
import { PALETTE, moduleColour } from '../lib/chartTheme';
import { useTasks } from '../context/TasksContext';

const WEEKDAYS: [string, string][] = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
];

const PALETTE_HEXES = PALETTE.light.series;
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-muted';
const inputClass = 'mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-sm text-ink';

/**
 * Step 8 — name the biggest mover between two rankings.
 * Returns null when nothing moved, so the page stays quiet rather than
 * claiming an effect it cannot point at (Alt B of UC-015 uses the same idea).
 */
function describeMove(before: any[], after: any[]): string | null {
  if (!before.length || !after.length) return null;

  const rankBefore = new Map(before.map((task, i) => [task.taskId, i + 1]));
  let biggest: { title: string; from: number; to: number } | null = null;

  after.forEach((task, i) => {
    const from = rankBefore.get(task.taskId);
    if (!from) return;
    const delta = Math.abs(from - (i + 1));
    if (delta > 0 && (!biggest || delta > Math.abs(biggest.from - biggest.to))) {
      biggest = { title: task.title, from, to: i + 1 };
    }
  });

  if (!biggest) return null;
  return `Moved your ${biggest.title} from #${biggest.from} to #${biggest.to}.`;
}

export default function Setup() {
  const { ranking, prefs, modules, refresh, refreshPrefs, refreshModules } = useTasks();

  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');
  const [consequence, setConsequence] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // E3 — the last values the server confirmed, to revert to on failure.
  const persisted = useRef<{ availability: Record<string, number>; blockedDates: string[] } | null>(null);

  useEffect(() => {
    if (!prefs) return;
    setAvailability(prefs.availability || {});
    setBlockedDates(prefs.blockedDates || []);
    persisted.current = { availability: prefs.availability || {}, blockedDates: prefs.blockedDates || [] };
  }, [prefs]);

  const totalHours = useMemo(
    () => Object.values(availability).reduce((sum, h) => sum + (Number(h) || 0), 0),
    [availability],
  );

  const save = useCallback(async (changes: any) => {
    const before = ranking;
    setProblem(null);
    try {
      const response = await api.put('/api/prefs', changes);
      persisted.current = {
        availability: response.data.prefs.availability,
        blockedDates: response.data.prefs.blockedDates || [],
      };
      setWarning(response.data.warnings?.[0]?.message || null);
      setConsequence(describeMove(before, response.data.ranking || []));
      refresh();
      refreshPrefs();
    } catch (error) {
      // E3 — revert the sliders to their last persisted values.
      if (persisted.current) {
        setAvailability(persisted.current.availability);
        setBlockedDates(persisted.current.blockedDates);
      }
      setProblem(errorMessage(error, 'Settings could not be saved.'));
    }
  }, [ranking, refresh, refreshPrefs]);

  async function addModule(event: any) {
    event.preventDefault();
    setBusy(true);
    setDuplicate(null);
    setProblem(null);
    try {
      await api.post('/api/modules', { code: code.trim(), ...(name.trim() ? { name: name.trim() } : {}) });
      setCode('');
      setName('');
      refreshModules();
    } catch (error) {
      // E1 — offer the existing one rather than a second of the same code.
      if (errorCode(error) === 'module_exists') setDuplicate(code.trim().toUpperCase());
      else setProblem(errorMessage(error, 'That module could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function setModuleField(moduleCode: string, changes: any) {
    try {
      await api.patch(`/api/modules/${moduleCode}`, changes);
      refreshModules();
    } catch (error) {
      setProblem(errorMessage(error, 'That change could not be saved.'));
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="display text-[26px] leading-tight text-ink">Setup</h1>
      <p className="mt-0.5 text-sm text-ink2">
        Your modules and the hours you actually have. Both feed the ranking directly.
      </p>

      {problem && <p className="mt-4 text-sm text-crittext">{problem}</p>}

      {/* ── modules ──────────────────────────────────────────────────── */}
      <h2 className={`${labelClass} mt-8`}>Modules</h2>

      <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
        {modules.map((module: any) => {
          const over = module.assignedWeight > module.totalWeight;
          return (
            <li key={module.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: moduleColour(module.code) }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-ink">{module.code}</span>
              <input
                defaultValue={module.name}
                onBlur={(e) => e.target.value.trim() !== module.name
                  && setModuleField(module.code, { name: e.target.value.trim() })}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-ink2 hover:border-hairline focus:border-hairline"
                aria-label={`Name for ${module.code}`}
              />

              {/* Alt B — informational, never a block. */}
              <span
                className={`num rounded-full px-2 py-0.5 text-[11px] ${
                  over ? 'bg-warntint text-warntext' : 'text-muted'
                }`}
              >
                {module.assignedWeight}% of {module.totalWeight}%
              </span>

              <span className="flex gap-1">
                {PALETTE_HEXES.map((hex, i) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setModuleField(module.code, { colour: hex })}
                    aria-label={`Colour ${i + 1} for ${module.code}`}
                    className={`size-4 rounded-full border transition ${
                      module.colour === hex ? 'border-ink scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      {modules.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          No modules yet. Adding one here, or typing a new code when you add a task, both work.
        </p>
      )}

      <form onSubmit={addModule} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-24 flex-1">
          <span className={labelClass}>Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="IT2214" className={inputClass} maxLength={10} />
        </label>
        <label className="min-w-32 flex-[2]">
          <span className={labelClass}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Database Systems" className={inputClass} maxLength={80} />
        </label>
        <button
          type="submit"
          disabled={busy || code.trim().length < 2}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-plane disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {duplicate && (
        <p className="mt-2 text-sm text-warntext">
          {duplicate} already exists — it’s in the list above.
        </p>
      )}

      {/* ── availability ─────────────────────────────────────────────── */}
      <h2 className={`${labelClass} mt-10`}>Study hours per day</h2>
      <p className="mt-0.5 text-xs text-muted">
        What you realistically have, not what you wish you had. This is what decides whether a task
        still fits before its deadline.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {WEEKDAYS.map(([day, label]) => (
          <div key={day}>
            <label htmlFor={`setup-${day}`} className="flex items-baseline justify-between text-xs text-ink2">
              <span>{label}</span>
              <span className="num font-medium text-ink">{availability[day] ?? 0} h</span>
            </label>
            <input
              id={`setup-${day}`}
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={availability[day] ?? 0}
              onChange={(e) => setAvailability({ ...availability, [day]: Number(e.target.value) })}
              // Saved on release, not on every pixel of the drag — one write
              // per decision rather than one per frame.
              onMouseUp={(e) => save({ availability: { [day]: Number((e.target as HTMLInputElement).value) } })}
              onTouchEnd={(e) => save({ availability: { [day]: Number((e.target as HTMLInputElement).value) } })}
              onKeyUp={(e) => save({ availability: { [day]: Number((e.target as HTMLInputElement).value) } })}
              className="mt-1 w-full"
            />
          </div>
        ))}
      </div>

      <p className="num mt-3 text-xs text-muted">{totalHours} hours a week</p>

      {/* E2 — allowed, but never silently. */}
      {warning && (
        <p className="mt-2 rounded-lg bg-warntint px-3 py-2 text-sm text-warntext">{warning}</p>
      )}

      {/* Step 8 — the consequence of the setting, in words. */}
      {consequence && (
        <p className="rise mt-2 rounded-lg bg-plane px-3 py-2 text-sm text-ink">{consequence}</p>
      )}

      {/* ── blocked dates ────────────────────────────────────────────── */}
      <h2 className={`${labelClass} mt-10`}>Blocked days</h2>
      <p className="mt-0.5 text-xs text-muted">
        Work shifts, CCA, anything that takes a whole day. These count as zero study hours.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {blockedDates.map((date) => (
          <span key={date} className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-xs text-ink2">
            <span className="num">{date}</span>
            <button
              type="button"
              aria-label={`Unblock ${date}`}
              onClick={() => {
                const next = blockedDates.filter((d) => d !== date);
                setBlockedDates(next);
                save({ blockedDates: next });
              }}
              className="text-muted hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        {blockedDates.length === 0 && <span className="text-sm text-muted">None.</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label>
          <span className={labelClass}>Block a day</span>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
        </label>
        <button
          type="button"
          disabled={!newDate || blockedDates.includes(newDate)}
          onClick={() => {
            const next = [...blockedDates, newDate].sort();
            setBlockedDates(next);
            save({ blockedDates: next });
            setNewDate('');
          }}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-plane disabled:opacity-50"
        >
          Block
        </button>
      </div>

      <p className="mt-10 text-xs text-muted">
        Weightings for the five priority factors live on{' '}
        <Link to="/settings" className="text-ink underline underline-offset-2">Prioritisation</Link>.
      </p>
    </section>
  );
}
