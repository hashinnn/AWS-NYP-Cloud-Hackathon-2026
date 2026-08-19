/**
 * The CGPA calculator — project a CGPA from expected grades, or the semester
 * GPA needed to hit a target.
 *
 * Entirely client-side, like the weight-tuning preview: the arithmetic is in
 * lib/gpa.ts as pure functions, nothing touches a server, and the state
 * persists in localStorage only. Module rows prefill from the student's own
 * modules so the semester starts one keystroke away from real.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTasks } from '../context/TasksContext';
import { moduleColour } from '../lib/chartTheme';
import { SCALES, scaleById, projectCgpa, gpaNeeded, type GpaModule } from '../lib/gpa';

const STORE_KEY = 'deadlineiq.gpa';

const labelClass = 'block text-sm text-ink2';
const inputClass = 'mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-sm text-ink';

const emptyRow = (name = ''): GpaModule => ({ name, grade: '', credits: null, su: false });

type Stored = {
  scaleId: string;
  /** Simple is grades → semester GPA; advanced adds projection and targets. */
  view: 'simple' | 'advanced';
  mode: 'project' | 'needed';
  currentCgpa: string;
  creditsDone: string;
  target: string;
  rows: GpaModule[];
};

export default function Gpa() {
  const { modules } = useTasks();

  const [state, setState] = useState<Stored>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '');
      if (stored && Array.isArray(stored.rows)) return { view: 'simple', ...stored };
    } catch { /* first visit */ }
    return {
      scaleId: 'poly', view: 'simple', mode: 'project', currentCgpa: '', creditsDone: '', target: '', rows: [emptyRow()],
    };
  });

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);

  const scale = scaleById(state.scaleId);
  const currentCgpa = state.currentCgpa === '' ? null : Number(state.currentCgpa);
  const creditsDone = state.creditsDone === '' ? null : Number(state.creditsDone);
  const target = state.target === '' ? null : Number(state.target);

  const projection = useMemo(
    () => projectCgpa(currentCgpa, creditsDone, state.rows, scale),
    [currentCgpa, creditsDone, state.rows, scale],
  );
  const needed = useMemo(
    () => gpaNeeded(currentCgpa, creditsDone, target, state.rows, scale),
    [currentCgpa, creditsDone, target, state.rows, scale],
  );

  const set = (changes: Partial<Stored>) => setState((s) => ({ ...s, ...changes }));
  const setRow = (index: number, changes: Partial<GpaModule>) => setState((s) => ({
    ...s,
    rows: s.rows.map((row, i) => (i === index ? { ...row, ...changes } : row)),
  }));

  const moduleNames: string[] = (modules || []).map((m: any) => m.code).filter(Boolean);
  const pristine = (rows: GpaModule[]) => rows.every(
    (row) => !row.name && row.grade === '' && row.credits === null,
  );

  function prefillFromModules() {
    if (moduleNames.length === 0) return;
    set({ rows: moduleNames.map((name) => emptyRow(name)) });
  }

  // The modules configured in Setup ARE this semester — start from them.
  // Only while the rows are untouched, so a half-filled sheet is never
  // overwritten by the module list arriving late.
  useEffect(() => {
    if (moduleNames.length === 0) return;
    setState((s) => (pristine(s.rows)
      ? { ...s, rows: moduleNames.map((name) => emptyRow(name)) }
      : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules]);

  function reset() {
    set({
      currentCgpa: '',
      creditsDone: '',
      target: '',
      rows: moduleNames.length > 0 ? moduleNames.map((name) => emptyRow(name)) : [emptyRow()],
    });
  }

  const advanced = state.view === 'advanced';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-[26px] leading-tight text-ink">
            {advanced ? 'CGPA calculator' : 'GPA calculator'}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {advanced
              ? 'Project the CGPA your expected grades would produce, or the GPA you need to hit a target.'
              : 'Pick grades for this semester’s modules and see your GPA — that’s all.'}
            {' '}All arithmetic runs in your browser — nothing is stored on a server.
          </p>
        </div>
        {/* Simple is the front door; everything heavier is one toggle away. */}
        <div className="flex gap-1 rounded-lg border border-hairline bg-plane p-1" role="radiogroup" aria-label="Calculator mode">
          {([['simple', 'Simple'], ['advanced', 'Advanced']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={state.view === value}
              onClick={() => set({ view: value })}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                state.view === value ? 'bg-accent font-medium text-plane' : 'text-ink2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* ── the inputs ── */}
        <section className="rounded-card border border-hairline bg-surface p-5 shadow-card lg:col-span-2">
          <label className="block" htmlFor="gpa-scale">
            <span className={labelClass}>Your grading scale</span>
            <select
              id="gpa-scale"
              value={state.scaleId}
              onChange={(e) => set({ scaleId: e.target.value })}
              className={inputClass}
            >
              {SCALES.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          {advanced && (
          <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block" htmlFor="gpa-current">
              <span className={labelClass}>Current CGPA</span>
              <input
                id="gpa-current"
                type="number"
                min={0}
                max={scale.max}
                step={0.01}
                placeholder="e.g. 3.50"
                value={state.currentCgpa}
                onChange={(e) => set({ currentCgpa: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block" htmlFor="gpa-credits">
              <span className={labelClass}>Credits completed</span>
              <input
                id="gpa-credits"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 60"
                value={state.creditsDone}
                onChange={(e) => set({ creditsDone: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>

          {/* ── mode ── */}
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">What do you want to calculate?</span>
            <button type="button" onClick={reset} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
              Clear
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-hairline bg-plane p-1">
            {([['project', 'Project CGPA'], ['needed', 'GPA needed']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ mode: value })}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  state.mode === value ? 'bg-accent font-medium text-plane' : 'text-ink2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {state.mode === 'project'
              ? 'Enter expected grades for this semester’s modules to see your new CGPA.'
              : 'Enter a target CGPA and this semester’s credits to see the GPA you must average.'}
          </p>

          {state.mode === 'needed' && (
            <label className="mt-3 block" htmlFor="gpa-target">
              <span className={labelClass}>Target CGPA</span>
              <input
                id="gpa-target"
                type="number"
                min={0}
                max={scale.max}
                step={0.01}
                placeholder={`up to ${scale.max.toFixed(1)}`}
                value={state.target}
                onChange={(e) => set({ target: e.target.value })}
                className={inputClass}
              />
            </label>
          )}
          </>
          )}

          {/* ── the semester's modules ── */}
          <div className={`flex items-center justify-between ${advanced ? 'mt-6' : 'mt-5'}`}>
            <h2 className="text-sm font-medium text-ink">Modules this semester</h2>
            <div className="flex items-center gap-3">
              {(modules || []).length > 0 && (
                <button
                  type="button"
                  onClick={prefillFromModules}
                  className="text-xs text-ink2 underline underline-offset-2 hover:text-ink"
                >
                  Use my modules
                </button>
              )}
              {!advanced && (
                <button type="button" onClick={reset} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
                  Clear
                </button>
              )}
            </div>
          </div>

          <ul className="mt-2 space-y-3">
            {state.rows.map((row, index) => (
              // Position is identity here: rows are anonymous until named.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index} className="rounded-lg border border-hairline bg-plane p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The same colour this module carries in every chart, card
                      and calendar entry — one identity, everywhere. */}
                  <span className="relative min-w-32 flex-1">
                    {row.name.trim() && (
                      <span
                        className="pointer-events-none absolute left-2.5 top-1/2 size-2 -translate-y-1/2 rounded-full"
                        style={{ backgroundColor: moduleColour(row.name.trim().toUpperCase()) }}
                        aria-hidden="true"
                      />
                    )}
                    <input
                      value={row.name}
                      onChange={(e) => setRow(index, { name: e.target.value })}
                      placeholder={`Module ${index + 1}`}
                      aria-label={`Module ${index + 1} name`}
                      className={`w-full rounded-md border border-hairline bg-surface py-1.5 pr-2.5 text-sm text-ink ${
                        row.name.trim() ? 'pl-7' : 'pl-2.5'
                      }`}
                      maxLength={60}
                    />
                  </span>
                  <select
                    value={row.grade}
                    onChange={(e) => setRow(index, { grade: e.target.value })}
                    disabled={row.su || (advanced && state.mode === 'needed')}
                    aria-label={`Module ${index + 1} grade`}
                    className="w-24 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink disabled:opacity-40"
                  >
                    <option value="">Grade</option>
                    {scale.grades.map(([grade, points]) => (
                      <option key={grade} value={grade}>{grade} · {points.toFixed(1)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={row.credits ?? ''}
                    onChange={(e) => setRow(index, {
                      credits: e.target.value === '' ? null : Number(e.target.value),
                    })}
                    placeholder="Credits"
                    aria-label={`Module ${index + 1} credits`}
                    className="w-24 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => setState((s) => ({
                      ...s,
                      rows: s.rows.length > 1 ? s.rows.filter((_, i) => i !== index) : [emptyRow()],
                    }))}
                    aria-label={`Remove module ${index + 1}`}
                    className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-surface hover:text-crittext"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-4" aria-hidden="true">
                      <path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-8 0 .7 12a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4L17 7M10 11v5m4-5v5" />
                    </svg>
                  </button>
                </div>
                {advanced && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink2">
                    <input
                      type="checkbox"
                      checked={row.su}
                      onChange={(e) => setRow(index, { su: e.target.checked })}
                    />
                    Take as S/U (counts for credits, not CGPA)
                  </label>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, rows: [...s.rows, emptyRow()] }))}
            className="mt-3 rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2 transition hover:text-ink"
          >
            + Add module
          </button>
        </section>

        {/* ── the result ── */}
        <div className="space-y-4">
          <section className="rounded-card border border-dashed border-rule bg-surface p-5" aria-live="polite">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {!advanced ? 'Your GPA this semester'
                : state.mode === 'project' ? 'Projected CGPA' : 'GPA needed'}
            </p>

            {!advanced && (projection ? (
              <>
                <p className="display num mt-2 text-[40px] leading-none text-ink">
                  {projection.semGpa.toFixed(2)}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  over <span className="num">{projection.semCredits}</span> credits
                </p>
                <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                  Want your overall CGPA, or the GPA you need for a target? Switch to{' '}
                  <button
                    type="button"
                    onClick={() => set({ view: 'advanced' })}
                    className="font-medium text-ink underline underline-offset-2"
                  >
                    Advanced
                  </button>.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Pick a grade and credits for at least one module. Your GPA will show here.
              </p>
            ))}

            {advanced && state.mode === 'project' && (projection ? (
              <>
                <p className="display num mt-2 text-[40px] leading-none text-ink">
                  {projection.cgpa.toFixed(2)}
                </p>
                {projection.delta !== null && projection.delta !== 0 && (
                  <p className={`num mt-1.5 text-sm ${projection.delta > 0 ? 'text-goodtext' : 'text-crittext'}`}>
                    {projection.delta > 0 ? '▲' : '▼'} {Math.abs(projection.delta).toFixed(2)} from your current CGPA
                  </p>
                )}
                <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                  This semester alone averages{' '}
                  <span className="num font-medium text-ink2">{projection.semGpa.toFixed(2)}</span>
                  {' '}over <span className="num">{projection.semCredits}</span> graded credits.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Fill in at least one module’s grade and credits. Your result will show here.
              </p>
            ))}

            {advanced && state.mode === 'needed' && (needed ? (
              <>
                <p className={`display num mt-2 text-[40px] leading-none ${
                  needed.verdict === 'impossible' ? 'text-crittext' : 'text-ink'
                }`}
                >
                  {needed.needed.toFixed(2)}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  averaged over <span className="num">{needed.semCredits}</span> graded credits
                </p>
                {needed.verdict === 'impossible' && (
                  <p className="mt-3 rounded-lg bg-crittint px-3 py-2 text-xs text-crittext">
                    Above this scale’s {scale.max.toFixed(1)} maximum — not reachable this semester.
                    Add more graded credits or aim for a later semester.
                  </p>
                )}
                {needed.verdict === 'secured' && (
                  <p className="mt-3 rounded-lg bg-goodtint px-3 py-2 text-xs text-goodtext">
                    Already secured — even a 0.0 this semester keeps you at or above target.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Fill in your current CGPA, credits completed, a target, and this semester’s
                credits. The GPA you need will show here.
              </p>
            ))}
          </section>

          <section className="rounded-card border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">How it’s computed</h2>
            <p className="num mt-2 text-xs leading-relaxed text-muted">
              {advanced
                ? 'new CGPA = (current × credits + Σ grade points × credits) ÷ total credits. S/U modules are left out of both sides.'
                : 'GPA = Σ (grade points × credits) ÷ Σ credits.'}
              {' '}Same rule as the priority score: arithmetic you can check by hand.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
