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

function Suggested() {
  return <span className="ml-1.5 rounded-full bg-plane px-1.5 py-0.5 text-[10px] font-medium text-muted">suggested</span>;
}

export default function AddTaskDialog(
  { onClose, onCreated }: { onClose: () => void; onCreated: (result: any) => void },
) {
  const { ranking, refresh } = useTasks();

  const [type, setType] = useState('assignment');
  const [title, setTitle] = useState('');
  const [module, setModule] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('23:59');   // the polytechnic norm
  const [gradeWeight, setGradeWeight] = useState('');
  const [effortHours, setEffortHours] = useState(String(SMART_DEFAULTS.assignment.effortHours));
  const [prepDays, setPrepDays] = useState(String(SMART_DEFAULTS.assignment.prepDays));
  const [isGroup, setIsGroup] = useState(false);
  const [notes, setNotes] = useState('');

  // Which numbers are still the system's guess rather than the student's.
  const [effortTouched, setEffortTouched] = useState(false);
  const [prepTouched, setPrepTouched] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<'form' | 'confirmPast' | 'duplicate'>('form');
  const [duplicate, setDuplicate] = useState<any>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

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
        className="rise w-full max-w-lg rounded-card border border-hairline bg-surface p-6 shadow-card"
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
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
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
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Create anyway'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink2"
              >
                Keep the existing one
              </button>
            </div>
          </>
        )}

        {stage === 'form' && (
          <form onSubmit={submit} noValidate>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add task</h2>
              <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
                Close
              </button>
            </div>

            {/* Type first: it drives every suggestion below it. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    type === option.value
                      ? 'bg-ink font-medium text-plane'
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
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={Boolean(errors.title)}
                className={errors.title ? errorInputClass : inputClass}
                maxLength={200}
              />
            </label>
            {errors.title && <p className="mt-1 text-xs text-crittext">{errors.title}</p>}

            <label className="mt-3 block" htmlFor="task-module">
              <span className={labelClass}>Module</span>
              <input
                id="task-module"
                list="known-modules"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className={inputClass}
                placeholder="e.g. IT2214"
                maxLength={20}
              />
            </label>
            <datalist id="known-modules">
              {knownModules.map((code) => <option key={code} value={code} />)}
            </datalist>
            {isNewModule && (
              <p className="mt-1 text-xs text-muted">Will create module {typedCode}.</p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block" htmlFor="task-date">
                <span className={labelClass}>Deadline</span>
                <input
                  id="task-date"
                  ref={dateRef}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-invalid={Boolean(errors.dueDate)}
                  className={errors.dueDate ? errorInputClass : inputClass}
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
                  onChange={(e) => setDueTime(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            {errors.dueDate && <p className="mt-1 text-xs text-crittext">{errors.dueDate}</p>}
            {isPast && !errors.dueDate && (
              <p className="mt-1 text-xs text-warntext">That date has already passed.</p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block" htmlFor="task-weight">
                <span className={labelClass}>Grade weight %</span>
                <input
                  id="task-weight"
                  type="number"
                  min={0}
                  max={100}
                  value={gradeWeight}
                  onChange={(e) => setGradeWeight(e.target.value)}
                  className={inputClass}
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
                  onChange={(e) => { setEffortTouched(true); setEffortHours(e.target.value); }}
                  className={inputClass}
                />
              </label>
            </div>

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
                className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
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
