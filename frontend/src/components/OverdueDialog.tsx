/**
 * UC-021 step 4 — the three honest resolutions.
 *
 * Every option here is a real answer to "this is late": you submitted it, you
 * have a new date, or it stopped mattering. There is deliberately no "dismiss"
 * — a dismissed overdue task is one that keeps distorting the workload figures
 * while the student stops seeing it.
 *
 * Alt A: several overdue tasks are resolved from one card rather than three
 * separate prompts.
 */

import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatDate } from '../lib/countdown';
import ModuleChip from './ModuleChip';

const OPTIONS = [
  { value: 'complete', label: 'Submitted late', hint: 'Marks it done and records it as a late submission.' },
  { value: 'reschedule', label: 'New deadline', hint: 'Extension, resubmission, or a catch-up date you set yourself.' },
  { value: 'archive', label: 'No longer relevant', hint: 'Archived, and removed from your workload capacity.' },
];

export default function OverdueDialog({
  tasks, onClose, onResolved,
}: {
  tasks: any[];
  onClose: () => void;
  onResolved: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [action, setAction] = useState('complete');
  const [newDueAt, setNewDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const task = tasks[index];
  if (!task) return null;

  async function resolve() {
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`/api/tasks/${task.taskId}/resolve`, {
        action,
        // The input is local wall-clock; deadlines are 23:59 by convention
        // (UC-002 step 3), and everything on the wire is UTC.
        ...(action === 'reschedule' && newDueAt
          ? { newDueAt: new Date(`${newDueAt}T23:59:00`).toISOString() }
          : {}),
      });

      if (index + 1 < tasks.length) {
        setIndex(index + 1);
        setAction('complete');
        setNewDueAt('');
      } else {
        onResolved();
        onClose();
      }
    } catch (error) {
      // E1 arrives here as validation_failed with the message to show.
      setProblem(errorMessage(error, 'Could not update that task.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4">
      <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            {tasks.length > 1 ? `${tasks.length} tasks are overdue` : 'This task is overdue'}
          </h2>
          {tasks.length > 1 && (
            <span className="num text-xs text-muted">{index + 1} of {tasks.length}</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ModuleChip code={task.module} size="sm" />
          <span className="text-sm font-medium text-ink">{task.title}</span>
        </div>
        <p className="mt-1 text-xs text-crittext">
          Was due {formatDate(task.dueAt)} · {Math.round(task.progressPct || 0)}% done
        </p>

        <div className="mt-4 space-y-2">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                action === option.value ? 'border-ink bg-plane' : 'border-hairline'
              }`}
            >
              <input
                type="radio"
                name="resolution"
                value={option.value}
                checked={action === option.value}
                onChange={() => setAction(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {action === 'reschedule' && (
          <label className="mt-3 block text-xs text-ink2">
            New deadline
            <input
              type="date"
              value={newDueAt}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              onChange={(e) => setNewDueAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink"
            />
            <span className="mt-1 block text-muted">Deadlines default to 23:59.</span>
          </label>
        )}

        {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-muted">
            Not now
          </button>
          <button
            type="button"
            onClick={resolve}
            disabled={busy || (action === 'reschedule' && !newDueAt)}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
