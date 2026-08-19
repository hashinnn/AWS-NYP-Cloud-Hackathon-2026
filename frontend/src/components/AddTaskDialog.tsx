/**
 * UC-002 — the structured task form.
 *
 * The organising idea is step 3: the student should type as little as
 * possible, and every figure the system guessed on their behalf must say so.
 * Anything labelled "suggested" is a guess, is editable, and stops being
 * labelled the moment they touch it. A guess presented as a fact is how a
 * ranking starts to feel arbitrary.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorCode, errorMessage } from '../lib/api';
import { useTasks } from '../context/TasksContext';
import ModuleChip from './ModuleChip';

const TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'test', label: 'Test' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
];

/** HLD §5.5. Mirrors `backend/lib/parse/fields.js` — the server applies the
 *  same table, so leaving a field blank produces the same answer. */
const SMART_DEFAULTS: Record<string, { effortHours: number; prepDays: number }> = {
  assignment: { effortHours: 8, prepDays: 0 },
  test: { effortHours: 6, prepDays: 3 },
  project: { effortHours: 15, prepDays: 0 },
  presentation: { effortHours: 5, prepDays: 1 },
};

/** Prep days only mean something where there is a rehearsal or revision phase. */
const SHOWS_PREP_DAYS = new Set(['test', 'presentation']);

const labelClass = 'block text-sm text-ink2';
const inputClass = 'mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-ink';
const errorInputClass = 'mt-1 w-full rounded-lg border border-critical bg-plane px-3 py-2 text-ink';
const amberInputClass = 'mt-1 w-full rounded-lg border border-warning bg-plane px-3 py-2 text-ink';

function Suggested() {
  return <span className="ml-1.5 rounded-full bg-plane px-1.5 py-0.5 text-[10px] font-medium text-muted">suggested</span>;
}

/**
 * UC-005 steps 5–7 — what the parser proposed, carried into the form so this
 * one dialog is also the confirmation card: every field editable, fields
 * below 0.7 confidence highlighted amber with the source phrase beneath.
 */
export type ParsedPrefill = {
  title?: string | null;
  module?: string | null;
  type?: string | null;
  dueAt?: string | null;            // ISO — split into the date/time inputs
  gradeWeight?: number | null;
  effortHours?: number | null;
  isGroup?: boolean | null;
  notes?: string | null;
  source?: 'nl' | 'brief';
  s3Key?: string | null;
  confidence?: Record<string, number>;
  sources?: Record<string, string>;
  dueAtCandidates?: string[];       // Alt A — both readings of an ambiguous day
  notice?: string;                  // Alt B — "Smart parsing unavailable…"
};

const AMBER_BELOW = 0.7;

function splitIso(iso?: string | null) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function AddTaskDialog(
  { onClose, onCreated, initial }: {
    onClose: () => void;
    onCreated: (result: any) => void;
    initial?: ParsedPrefill;
  },
) {
  const { ranking, refresh } = useTasks();
  const navigate = useNavigate();

  const parsedDue = splitIso(initial?.dueAt);
  const initialType = initial?.type && SMART_DEFAULTS[initial.type] ? initial.type : 'assignment';

  const [type, setType] = useState(initialType);
  const [title, setTitle] = useState(initial?.title || '');
  const [module, setModule] = useState(initial?.module || '');
  const [dueDate, setDueDate] = useState(parsedDue?.date || '');
  const [dueTime, setDueTime] = useState(parsedDue?.time || '23:59');   // the polytechnic norm
  const [gradeWeight, setGradeWeight] = useState(
    initial?.gradeWeight === undefined || initial?.gradeWeight === null ? '' : String(initial.gradeWeight),
  );
  const [effortHours, setEffortHours] = useState(
    String(initial?.effortHours ?? SMART_DEFAULTS[initialType].effortHours),
  );
  const [prepDays, setPrepDays] = useState(String(SMART_DEFAULTS[initialType].prepDays));
  const [isGroup, setIsGroup] = useState(Boolean(initial?.isGroup));
  const [notes, setNotes] = useState(initial?.notes || '');

  // Which numbers are still the system's guess rather than the student's.
  const [effortTouched, setEffortTouched] = useState(initial?.effortHours != null);
  const [prepTouched, setPrepTouched] = useState(false);

  // Amber clears per field the moment the student corrects it — an edited
  // value is theirs, not the parser's guess any more.
  const [corrected, setCorrected] = useState<Record<string, boolean>>({});

  const amber = (field: string) => Boolean(
    initial?.confidence
    && initial.confidence[field] !== undefined
    && initial.confidence[field] < AMBER_BELOW
    && !corrected[field],
  );
  const sourceOf = (field: string) => (amber(field) ? initial?.sources?.[field] : undefined);
  const markCorrected = (field: string) => setCorrected((c) => ({ ...c, [field]: true }));

  const classFor = (field: string, hasError: boolean) => {
    if (hasError) return errorInputClass;
    if (amber(field)) return amberInputClass;
    return inputClass;
  };

  // UC-022 steps 4–5 (Zoe) — how far this student's estimates usually sit from
  // reality, offered here as a suggestion. Fetched once per dialog; a failure
  // is silent, because a missing hint must never stand between a student and
  // recording a deadline.
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [hintAccepted, setHintAccepted] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<'form' | 'confirmPast' | 'duplicate'>('form');
  const [duplicate, setDuplicate] = useState<any>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    api.get('/api/completed')
      .then((response) => setAccuracy(response.data?.stats?.estimationAccuracy ?? null))
      .catch(() => setAccuracy(null));
  }, []);

  // Step 3 — changing the type re-suggests, but never overwrites a figure the
  // student has already decided for themselves.
  useEffect(() => {
    const defaults = SMART_DEFAULTS[type];
    if (!effortTouched) setEffortHours(String(defaults.effortHours));
    if (!prepTouched) setPrepDays(String(defaults.prepDays));
  }, [type, effortTouched, prepTouched]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Alt C — the autocomplete source. There is no GET /api/modules yet [P-08],
  // so this is every module the student already has a task in; anything else
  // they type is offered as a new module rather than rejected.
  const knownModules: string[] = useMemo(() => (
    [...new Set((ranking || []).map((task: any) => task.module).filter(Boolean))] as string[]
  ), [ranking]);

  const typedCode = module.trim().toUpperCase();
  const isNewModule = typedCode.length > 0 && !knownModules.includes(typedCode);

  const dueAt = dueDate ? `${dueDate}T${dueTime || '23:59'}` : '';
  const isPast = Boolean(dueAt) && Date.parse(dueAt) < Date.now();

  /** E1 — no write, and focus moves to the first offending field. */
  function firstProblem() {
    if (!title.trim()) return { field: 'title', message: 'Give the task a title.', ref: titleRef };
    if (!dueDate) return { field: 'dueDate', message: 'A deadline is required.', ref: dateRef };
    return null;
  }

  async function send(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await api.post('/api/tasks', {
        title: title.trim(),
        type,
        dueAt,
        ...(typedCode ? { module: typedCode } : {}),
        ...(gradeWeight === '' ? {} : { gradeWeight: Number(gradeWeight) }),
        ...(effortHours === '' ? {} : { effortHours: Number(effortHours) }),
        ...(SHOWS_PREP_DAYS.has(type) && prepDays !== '' ? { prepDays: Number(prepDays) } : {}),
        isGroup,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        // UC-005/UC-006 — the capture route this confirmation came through.
        ...(initial?.source ? { source: initial.source } : {}),
        ...(initial?.s3Key ? { s3Key: initial.s3Key } : {}),
        ...extra,
      });

      await refresh();
      // Step 8 — the student must see what the ranking did with it, not just
      // that it saved. The response already carries the recomputed ranking.
      onCreated(response.data);
      onClose();
      return response.data;
    } catch (error) {
      // Alt B — a soft warning, never a rejection. The student decides.
      if (errorCode(error) === 'duplicate_suspected') {
        setDuplicate((error as any).response.data.existing);
        setStage('duplicate');
      } else {
        // E3 — the form keeps everything the student typed.
        setProblem(errorMessage(error, 'Task could not be saved — please try again.'));
        setStage('form');
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  function submit(event: any) {
    event.preventDefault();

    const problemField = firstProblem();
    if (problemField) {
      setErrors({ [problemField.field]: problemField.message });
      problemField.ref.current?.focus();
      return;
    }
    setErrors({});

    // Alt A — recording something already missed is a real thing students do,
    // so this asks rather than refuses.
    if (isPast) { setStage('confirmPast'); return; }
    send();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add task"
        className="rise w-full max-w-lg rounded-card border border-hairline bg-surface p-5 shadow-card sm:p-6"
      >
        {stage === 'confirmPast' && (
          <>
            <h2 className="text-lg font-semibold text-ink">This deadline has already passed</h2>
            <p className="mt-2 text-sm text-ink2">
              Record “{title.trim()}” as overdue? It will be pinned to the top of your list until you
              resolve it.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => send()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Record as overdue'}
              </button>
              <button
                type="button"
                onClick={() => setStage('form')}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink2"
              >
                Change the date
              </button>
            </div>
          </>
        )}

        {stage === 'duplicate' && (
          <>
            <h2 className="text-lg font-semibold text-ink">You may already have this</h2>
            <div className="mt-3 rounded-lg border border-hairline bg-plane p-3">
              <div className="flex items-center gap-2">
                <ModuleChip code={duplicate?.module} size="sm" />
                <span className="text-sm font-medium text-ink">{duplicate?.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                due {duplicate?.dueAt ? new Date(duplicate.dueAt).toLocaleDateString() : '—'}
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => send({ createAnyway: true })}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Create anyway'}
              </button>
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/tasks/${duplicate.taskId}`); }}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink2"
              >
                Open existing
              </button>
            </div>
          </>
        )}

        {stage === 'form' && (
          <form onSubmit={submit} noValidate>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                {initial?.source ? 'Check the details' : 'Add task'}
              </h2>
              <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
                Close
              </button>
            </div>

            {/* UC-005 Alt B / UC-006 E2 — the parse degraded; say so. */}
            {initial?.notice && (
              <p className="mt-3 rounded-lg bg-warntint px-3 py-2 text-xs text-warntext">
                {initial.notice}
              </p>
            )}
            {initial?.source && !initial?.notice && (
              <p className="mt-2 text-xs text-muted">
                Amber fields are the parser’s less-confident guesses — everything is editable.
              </p>
            )}

            {/* Type first: it drives every suggestion below it. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    type === option.value
                      ? 'bg-accent font-medium text-plane'
                      : 'border border-hairline text-ink2 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block" htmlFor="task-title">
              <span className={labelClass}>Title</span>
              <input
                id="task-title"
                ref={titleRef}
                value={title}
                onChange={(e) => { setTitle(e.target.value); markCorrected('title'); }}
                aria-invalid={Boolean(errors.title)}
                className={classFor('title', Boolean(errors.title))}
                maxLength={200}
              />
            </label>
            {errors.title && <p className="mt-1 text-xs text-crittext">{errors.title}</p>}
            {sourceOf('title') && (
              <p className="mt-1 text-xs text-warntext">from “{sourceOf('title')}”</p>
            )}

            <label className="mt-3 block" htmlFor="task-module">
              <span className={labelClass}>Module</span>
              <input
                id="task-module"
                list="known-modules"
                value={module}
                onChange={(e) => { setModule(e.target.value); markCorrected('module'); }}
                className={classFor('module', false)}
                placeholder="e.g. IT2214"
                maxLength={20}
              />
            </label>
            {sourceOf('module') && (
              <p className="mt-1 text-xs text-warntext">from “{sourceOf('module')}”</p>
            )}
            <datalist id="known-modules">
              {knownModules.map((code) => <option key={code} value={code} />)}
            </datalist>
            {isNewModule && (
              <p className="mt-1 text-xs text-muted">Will create module {typedCode}.</p>
            )}

            {/* Alt A — a bare weekday is genuinely ambiguous; both readings
                are offered as explicit dates rather than silently guessed. */}
            {initial?.dueAtCandidates && initial.dueAtCandidates.length > 1 && (
              <div className="mt-3">
                <span className={labelClass}>Which date did you mean?</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {initial.dueAtCandidates.map((candidate) => {
                    const split = splitIso(candidate);
                    if (!split) return null;
                    const selected = split.date === dueDate && split.time === dueTime;
                    return (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => {
                          setDueDate(split.date);
                          setDueTime(split.time);
                          markCorrected('dueAt');
                        }}
                        className={`num rounded-lg px-3 py-1.5 text-sm transition ${
                          selected
                            ? 'bg-accent font-medium text-plane'
                            : 'border border-warning text-ink2 hover:text-ink'
                        }`}
                      >
                        {new Date(candidate).toLocaleDateString(undefined, {
                          weekday: 'short', day: 'numeric', month: 'short',
                        })}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block" htmlFor="task-date">
                <span className={labelClass}>Deadline</span>
                <input
                  id="task-date"
                  ref={dateRef}
                  type="date"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); markCorrected('dueAt'); }}
                  aria-invalid={Boolean(errors.dueDate)}
                  className={classFor('dueAt', Boolean(errors.dueDate))}
                />
              </label>
              <label className="block" htmlFor="task-time">
                <span className={labelClass}>
                  Time
                  {dueTime === '23:59' && <Suggested />}
                </span>
                <input
                  id="task-time"
                  type="time"
                  value={dueTime}
                  onChange={(e) => { setDueTime(e.target.value); markCorrected('dueAt'); }}
                  className={inputClass}
                />
              </label>
            </div>
            {errors.dueDate && <p className="mt-1 text-xs text-crittext">{errors.dueDate}</p>}
            {sourceOf('dueAt') && dueDate && (
              <p className="mt-1 text-xs text-warntext">
                “{sourceOf('dueAt')}” → {new Date(`${dueDate}T${dueTime || '23:59'}`).toLocaleString(undefined, {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
            {isPast && !errors.dueDate && (
              <p className="mt-1 text-xs text-warntext">
                That date has already passed
                {initial?.source ? ' — did you mean next year, or are you recording an overdue task?' : '.'}
              </p>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block" htmlFor="task-weight">
                <span className={labelClass}>Grade weight %</span>
                <input
                  id="task-weight"
                  type="number"
                  min={0}
                  max={100}
                  value={gradeWeight}
                  onChange={(e) => { setGradeWeight(e.target.value); markCorrected('gradeWeight'); }}
                  className={classFor('gradeWeight', false)}
                  placeholder="from module"
                />
              </label>
              <label className="block" htmlFor="task-effort">
                <span className={labelClass}>
                  Effort hours
                  {!effortTouched && <Suggested />}
                </span>
                <input
                  id="task-effort"
                  type="number"
                  min={0.5}
                  max={200}
                  step={0.5}
                  value={effortHours}
                  onChange={(e) => { setEffortTouched(true); setEffortHours(e.target.value); markCorrected('effortHours'); }}
                  className={classFor('effortHours', false)}
                />
              </label>
            </div>
            {(sourceOf('gradeWeight') || sourceOf('effortHours')) && (
              <p className="mt-1 text-xs text-warntext">
                {[sourceOf('gradeWeight') && `weight from “${sourceOf('gradeWeight')}”`,
                  sourceOf('effortHours') && `effort from “${sourceOf('effortHours')}”`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}

            {/* UC-022 step 4 — the figure is only offered once it is real
                (three completed tasks with hours logged) and only when it
                would actually change the number. Accepting it feeds straight
                into a more honest EffortPressure. */}
            {accuracy !== null && !hintAccepted
              && Math.round(Number(effortHours) * accuracy) !== Number(effortHours) && (
              <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warntint px-3 py-2 text-xs text-warntext">
                <span>
                  You usually need about <span className="num font-medium">{accuracy}×</span> your
                  estimate — consider{' '}
                  <span className="num font-medium">{Math.round(Number(effortHours) * accuracy)}</span>
                  {' '}hours instead of <span className="num">{effortHours}</span>.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEffortHours(String(Math.round(Number(effortHours) * accuracy)));
                    setEffortTouched(true);
                    setHintAccepted(true);
                  }}
                  className="ml-auto font-medium underline underline-offset-2"
                >
                  Use it
                </button>
              </p>
            )}

            {SHOWS_PREP_DAYS.has(type) && (
              <label className="mt-3 block" htmlFor="task-prep">
                <span className={labelClass}>
                  Preparation days
                  {!prepTouched && <Suggested />}
                </span>
                <input
                  id="task-prep"
                  type="number"
                  min={0}
                  max={30}
                  value={prepDays}
                  onChange={(e) => { setPrepTouched(true); setPrepDays(e.target.value); }}
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-muted">
                  Shifts the effective deadline earlier — revision has to start before the day itself.
                </span>
              </label>
            )}

            <label className="mt-3 flex items-center gap-2 text-sm text-ink2">
              <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
              Group task
            </label>

            <label className="mt-3 block" htmlFor="task-notes">
              <span className={labelClass}>Notes</span>
              <textarea
                id="task-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
                maxLength={2000}
              />
            </label>

            {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Add task'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-hairline px-4 py-2.5 text-sm text-ink2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
