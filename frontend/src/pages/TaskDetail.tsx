/**
 * UC-003 — the task detail screen.
 *
 * Every field saves on blur with an optimistic update. When the server refuses
 * — a validation failure (E1) or another tab having moved first (E2) — the
 * field snaps back to what was actually persisted. The screen never shows a
 * value the database does not hold.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, errorCode, errorMessage } from '../lib/api';
import { contributionsOf } from '../lib/priority';
import { formatDate } from '../lib/countdown';
import { useTasks } from '../context/TasksContext';
import PriorityExplanation from '../components/PriorityExplanation';
import MilestoneEditor from '../components/MilestoneEditor';
import ModuleChip from '../components/ModuleChip';

const TYPES = ['assignment', 'test', 'project', 'presentation'];
const SHOWS_PREP_DAYS = new Set(['test', 'presentation']);
const UNDO_SECONDS = 10;
const DAY_MS = 86400000;

const labelClass = 'block text-xs font-medium uppercase tracking-wide text-muted';
const fieldClass = 'mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-sm text-ink';
const badFieldClass = 'mt-1 w-full rounded-lg border border-critical bg-plane px-3 py-2 text-sm text-ink';

/** Split a stored UTC instant into the date and time inputs the student edits. */
function splitLocal(iso: string) {
  if (!iso) return { date: '', time: '23:59' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { weights, refresh, ranking, prefs } = useTasks();

  // UC-006 step 9 — deliverables extracted from the brief travel here and
  // pre-seed the milestone proposal instead of being discarded.
  const deliverables: string[] = (location.state as any)?.deliverables || [];

  const [task, setTask] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [breakingDown, setBreakingDown] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [undoLeft, setUndoLeft] = useState<number | null>(null);
  const [pendingDeadline, setPendingDeadline] = useState<any>(null);

  const due = splitLocal(task?.dueAt);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/tasks/${taskId}`);
      setTask(response.data.task);
      setMilestones(response.data.milestones || []);
      setProblem(null);
      setMissing(false);
    } catch (error) {
      // A missing task is an ordinary outcome — deleted in another tab, or a
      // stale link — not an error to shout a server string about.
      setMissing(errorCode(error) === 'not_found');
      setProblem(errorMessage(error, 'That task could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  // Step 2 — the UC-010 sentence beside the arithmetic it was written from.
  // This endpoint never fails; without a model it returns a template sentence.
  useEffect(() => {
    if (!task?.subScores) return;
    api.post('/api/explain', { taskIds: [taskId] })
      .then((response) => setExplanation(response.data.explanations?.[taskId as string] || null))
      .catch(() => setExplanation(null));
  }, [taskId, task?.explanationHash, task?.subScores]);

  const contributions = useMemo(
    () => (task?.subScores ? contributionsOf(task.subScores, weights) : []),
    [task?.subScores, weights],
  );

  const knownModules: string[] = useMemo(() => (
    [...new Set((ranking || []).map((item: any) => item.module).filter(Boolean))] as string[]
  ), [ranking]);

  /** Steps 3–4 — optimistic write, rolled back if the server refuses. */
  async function save(changes: Record<string, any>, extra: Record<string, any> = {}) {
    const fields = Object.keys(changes);
    const previous = Object.fromEntries(fields.map((f) => [f, task[f]]));
    if (fields.every((f) => changes[f] === task[f]) && !extra.shiftMilestones) return;

    setTask((current: any) => ({ ...current, ...changes }));
    setFieldErrors({});

    try {
      const response = await api.patch(`/api/tasks/${taskId}`, {
        ...changes,
        expectedUpdatedAt: task.updatedAt,
        ...extra,
      });
      setTask(response.data.task);
      if (response.data.milestonesShifted) await load();
      refresh();
    } catch (error) {
      setTask((current: any) => ({ ...current, ...previous }));   // E1/E2 rollback
      if (errorCode(error) === 'stale_write') {
        setConflict(true);
      } else {
        setFieldErrors({ [fields[0]]: errorMessage(error, 'That change could not be saved.') });
      }
    }
  }

  /**
   * Alt A — checked here, before the write, so accepting the offer can send
   * the deadline change and the shift as one request. The old window is what
   * makes a *proportional* rescale possible, and it is gone once the new
   * deadline is committed.
   */
  function saveDeadline(date: string, time: string) {
    if (!date) return;
    const next = `${date}T${time || '23:59'}`;
    if (new Date(next).getTime() === new Date(task.dueAt).getTime()) return;

    const limit = new Date(next).getTime() - DAY_MS;
    const stranded = milestones.filter((m) => Date.parse(m.dueAt) > limit);

    if (stranded.length > 0) { setPendingDeadline({ dueAt: next, count: stranded.length }); return; }
    save({ dueAt: next });
  }

  async function doDelete() {
    setConfirmingDelete(false);
    try {
      await api.delete(`/api/tasks/${taskId}`);
      refresh();
      setUndoLeft(UNDO_SECONDS);
    } catch (error) {
      setProblem(errorMessage(error, 'That task could not be deleted.'));
    }
  }

  async function undoDelete() {
    try {
      const response = await api.post(`/api/tasks/${taskId}/restore`);
      setTask(response.data.task);
      setUndoLeft(null);
      refresh();
    } catch (error) {
      // E3 — the window closed. The item is retained, never hard-deleted.
      setUndoLeft(null);
      setProblem(errorMessage(error, 'This task has already been removed.'));
    }
  }

  // Step 8 — the countdown is the undo window, and running out navigates away
  // because the task is no longer in any view.
  useEffect(() => {
    if (undoLeft === null) return undefined;
    if (undoLeft === 0) { navigate('/tasks'); return undefined; }
    timer.current = setTimeout(() => setUndoLeft((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer.current);
  }, [undoLeft, navigate]);

  if (loading) return <p className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted">Loading…</p>;

  if (!task) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-base font-medium text-ink">
          {missing ? 'This task no longer exists.' : 'That task could not be loaded.'}
        </p>
        <p className="mt-1 text-sm text-muted">
          {missing
            ? 'It may have been deleted. Deleted tasks are still listed under the Deleted filter.'
            : problem}
        </p>
        <button
          type="button"
          onClick={() => (missing ? navigate('/tasks') : load())}
          className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-plane"
        >
          {missing ? 'Back to all tasks' : 'Try again'}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button type="button" onClick={() => navigate('/tasks')} className="text-sm text-muted hover:text-ink">
        ← All tasks
      </button>

      {conflict && (
        <div className="mt-4 rounded-card border border-warning/40 bg-warntint p-3 text-sm text-ink2">
          This task changed in another tab — reload to see the latest.
          <button type="button" onClick={() => { setConflict(false); load(); }} className="ml-2 font-medium text-ink underline">
            Reload
          </button>
        </div>
      )}
      {problem && <p className="mt-4 text-sm text-crittext">{problem}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ModuleChip code={task.module} />
        <span className="text-xs uppercase tracking-wide text-muted">{task.status}</span>
        {task.tight && (
          <span className="rounded-full bg-crittint px-2 py-0.5 text-[11px] font-medium text-crittext">
            doesn’t fit in the time left
          </span>
        )}
        {task.priorityScore == null && (
          <span className="rounded-full bg-plane px-2 py-0.5 text-[11px] text-muted">score pending</span>
        )}
      </div>

      <input
        defaultValue={task.title}
        onBlur={(e) => save({ title: e.target.value.trim() })}
        className={`mt-2 w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-ink ${fieldErrors.title ? 'text-crittext' : ''}`}
      />
      {fieldErrors.title && <p className="text-xs text-crittext">{fieldErrors.title}</p>}

      {/* ── the fields ─────────────────────────────────────────────────── */}
      {/* One column on a phone: two number inputs plus their labels do not
          survive a 320px viewport once the page padding is taken off. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Module</span>
          <input
            list="detail-modules"
            defaultValue={task.module || ''}
            onBlur={(e) => save({ module: e.target.value.trim() || null })}
            className={fieldClass}
          />
        </label>
        <datalist id="detail-modules">
          {knownModules.map((code) => <option key={code} value={code} />)}
        </datalist>

        <label className="block">
          <span className={labelClass}>Type</span>
          <select value={task.type} onChange={(e) => save({ type: e.target.value })} className={fieldClass}>
            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Deadline</span>
          <input
            type="date"
            value={due.date}
            onChange={(e) => saveDeadline(e.target.value, due.time)}
            className={fieldErrors.dueAt ? badFieldClass : fieldClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Time</span>
          <input
            type="time"
            value={due.time}
            onChange={(e) => saveDeadline(due.date, e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Grade weight %</span>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={task.gradeWeight ?? ''}
            onBlur={(e) => save({ gradeWeight: e.target.value === '' ? null : Number(e.target.value) })}
            className={fieldErrors.gradeWeight ? badFieldClass : fieldClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Effort hours</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            defaultValue={task.effortHours ?? ''}
            onBlur={(e) => save({ effortHours: Number(e.target.value) })}
            className={fieldErrors.effortHours ? badFieldClass : fieldClass}
          />
        </label>

        {SHOWS_PREP_DAYS.has(task.type) && (
          <label className="block">
            <span className={labelClass}>Prep days</span>
            <input
              type="number"
              min={0}
              max={30}
              defaultValue={task.prepDays ?? 0}
              onBlur={(e) => save({ prepDays: Number(e.target.value) })}
              className={fieldClass}
            />
          </label>
        )}

        <label className="block">
          <span className={labelClass}>Progress %</span>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={task.progressPct ?? 0}
            onBlur={(e) => save({ progressPct: Number(e.target.value) })}
            className={fieldErrors.progressPct ? badFieldClass : fieldClass}
          />
        </label>
      </div>

      {Object.entries(fieldErrors).map(([field, message]) => (
        <p key={field} className="mt-2 text-xs text-crittext">{message}</p>
      ))}

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(task.isGroup)} onChange={(e) => save({ isGroup: e.target.checked })} />
          Group task
        </label>
        {task.isGroup && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(task.blockedOnTeammate)}
              onChange={(e) => save({ blockedOnTeammate: e.target.checked })}
            />
            Blocked on a teammate
          </label>
        )}
      </div>

      <label className="mt-4 block">
        <span className={labelClass}>Notes</span>
        <textarea
          defaultValue={task.notes || ''}
          onBlur={(e) => save({ notes: e.target.value })}
          rows={3}
          className={fieldClass}
        />
      </label>

      {/* ── step 2: why it ranks where it ranks ────────────────────────── */}
      {task.subScores && (
        <section className="mt-8 rounded-card border border-hairline bg-surface p-5">
          <h2 className={labelClass}>Why this ranks here</h2>
          <div className="mt-3">
            <PriorityExplanation
              text={explanation?.text}
              source={explanation?.source}
              contributions={contributions}
              total={task.priorityScore}
              loading={!explanation}
            />
          </div>

          {/*
            UC-004 Alt A — the student never set their hours, so Effort
            Pressure is running on defaults. The ranking still works; it is
            just less specific to them, and saying so is more honest than
            presenting a default as their capacity.
          */}
          {prefs && !prefs.availabilitySetAt && (
            <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
              Effort Pressure is using default study hours.{' '}
              <Link to="/setup" className="text-ink underline underline-offset-2">
                Set your study hours
              </Link>{' '}
              for a ranking based on the time you actually have.
            </p>
          )}
        </section>
      )}

      {/* ── step 2: milestones (UC-012) ────────────────────────────────── */}
      {milestones.length > 0 && (
        <section className="mt-6">
          <h2 className={labelClass}>Milestones</h2>
          <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
            {milestones.map((milestone) => (
              <li key={milestone.milestoneId} className="flex items-center gap-3 py-2 text-sm">
                <span className={milestone.completedAt ? 'text-muted line-through' : 'text-ink'}>
                  {milestone.name}
                </span>
                <span className="num ml-auto text-xs text-muted">{milestone.hours} h</span>
                <span className="num w-24 text-right text-xs text-muted">
                  {formatDate(milestone.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* UC-012 step 1 — "Break this down", from the task itself. Deliverables
          that arrived from a brief (UC-006) open the proposal straight away. */}
      {milestones.length === 0 && ['active', 'overdue'].includes(task.status) && (
        <section className="mt-6">
          {breakingDown || deliverables.length > 0 ? (
            <MilestoneEditor
              task={task}
              deliverables={deliverables}
              onSaved={() => {
                setBreakingDown(false);
                navigate('.', { replace: true, state: {} });   // consume the hand-off
                load();
                refresh();
              }}
              onCancel={() => {
                setBreakingDown(false);
                navigate('.', { replace: true, state: {} });
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setBreakingDown(true)}
              className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2 transition hover:text-ink"
            >
              Break this into steps
            </button>
          )}
        </section>
      )}

      {/* ── step 2: change history ─────────────────────────────────────── */}
      {task.history?.length > 0 && (
        <section className="mt-6">
          <h2 className={labelClass}>History</h2>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {[...task.history].reverse().map((entry: any, i: number) => (
              // A long title or notes value must wrap, not widen the page.
              <li key={`${entry.at}-${entry.field}-${i}`} className="break-words">
                <span className="num">{formatDate(entry.at)}</span>
                {' — '}
                {entry.field}
                {': '}
                <span className="text-ink2">{String(entry.from ?? '—')}</span>
                {' → '}
                <span className="text-ink2">{String(entry.to ?? '—')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── steps 7–8 and Alt B ────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap gap-2 border-t border-hairline pt-5">
        {task.status !== 'archived' ? (
          <button
            type="button"
            onClick={() => save({ status: 'archived' })}
            className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2"
          >
            Archive (no longer relevant)
          </button>
        ) : (
          <button
            type="button"
            onClick={() => save({ status: 'active' })}
            className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2"
          >
            Un-archive
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-lg border border-critical px-3 py-1.5 text-sm text-crittext"
        >
          Delete
        </button>
      </div>

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm">
          <div className="rise w-full max-w-sm rounded-card border border-hairline bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold text-ink">Delete “{task.title}”?</h2>
            <p className="mt-1 text-sm text-ink2">You’ll have 10 seconds to undo.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={doDelete} className="rounded-lg bg-critical px-3 py-1.5 text-sm font-medium text-plane">
                Delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alt A — asked before the write, so the shift can be proportional. */}
      {pendingDeadline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm">
          <div className="rise w-full max-w-md rounded-card border border-hairline bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold text-ink">Shift milestones proportionally?</h2>
            <p className="mt-1 text-sm text-ink2">
              {pendingDeadline.count === 1 ? '1 milestone falls' : `${pendingDeadline.count} milestones fall`}
              {' '}
              after the new deadline. They can be rescaled into the new window, still finishing a
              full day before you submit.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { save({ dueAt: pendingDeadline.dueAt }, { shiftMilestones: true }); setPendingDeadline(null); }}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-plane"
              >
                Shift them
              </button>
              <button
                type="button"
                onClick={() => { save({ dueAt: pendingDeadline.dueAt }); setPendingDeadline(null); }}
                className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2"
              >
                Move the deadline only
              </button>
              <button
                type="button"
                onClick={() => setPendingDeadline(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {undoLeft !== null && (
        <div className="rise fixed bottom-4 left-4 right-4 z-40 flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 shadow-card sm:bottom-6 sm:left-auto sm:right-6">
          <span className="text-sm text-ink">Task deleted</span>
          <button type="button" onClick={undoDelete} className="text-sm font-medium text-ink underline underline-offset-2">
            Undo
          </button>
          <span className="num text-xs text-muted">{undoLeft}s</span>
        </div>
      )}
    </div>
  );
}
