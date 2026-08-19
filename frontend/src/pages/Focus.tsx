/**
 * UC-011 — Focus Mode. One card. One decision.
 *
 * The card never scrolls and never blocks on the model: the server hands over
 * a template sentence immediately, and POST /api/explain quietly upgrades the
 * wording afterwards if the model is available. If it isn't, nothing changes
 * visually — which is the point.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { countdownText, formatDay } from '../lib/countdown';
import { useTasks } from '../context/TasksContext';
import PriorityExplanation from '../components/PriorityExplanation';
import MilestoneEditor from '../components/MilestoneEditor';
import ModuleChip from '../components/ModuleChip';

const TIMER_KEY = 'deadlineiq.session';
const IMPLAUSIBLE_HOURS = 6; // E3 — beyond this we ask rather than assume

// UC-009 Alt A — the two figures whose absence forces a neutral 50, named in
// the words the student would use for them rather than the field name.
const DATA_GAP_HINT: Record<string, string> = {
  effortHours: 'Add an effort estimate for a better ranking — this one is scored on an average.',
  gradeWeight: 'Add the grade weight for a better ranking — this one is scored on an average.',
  dueAt: 'This task needs a valid deadline before it can be ranked.',
};

type Session = { taskId: string; startedAt: number };

function useTicker() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

export default function Focus() {
  const { refresh } = useTasks();
  const [data, setData] = useState<any>(null);
  const [index, setIndex] = useState(0); // 0 = the top card, >0 after "Not now"
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [overnight, setOvernight] = useState<Session | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [upgraded, setUpgraded] = useState<Record<string, any>>({});
  const [breakingDown, setBreakingDown] = useState(false);
  const explained = useRef<Set<string>>(new Set());

  useTicker(); // the countdown is live, and so is the session timer

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/focus');
      // Every caller of load() has just changed a score, so the upgraded
      // wording is now describing sub-scores that no longer exist. Drop it and
      // let the effect below re-ask: a bar whose segments do not add up to the
      // total printed beside them is the one thing this product cannot show.
      explained.current.clear();
      setUpgraded({});
      setData(response.data);
      setIndex(0);
      setProblem(null);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not load Focus Mode.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // E3 — a timer left running overnight is queried, never silently logged.
  useEffect(() => {
    const stored = localStorage.getItem(TIMER_KEY);
    if (!stored) return;
    const parsed: Session = JSON.parse(stored);
    const hours = (Date.now() - parsed.startedAt) / 3600000;
    if (hours > IMPLAUSIBLE_HOURS) setOvernight(parsed);
    else setSession(parsed);
  }, []);

  const cards = data?.card ? [data.card, ...(data.alternatives || [])] : [];
  const current: any = cards[index];
  const task = current?.task;

  // Upgrade the wording in the background — never on the render path.
  useEffect(() => {
    if (!task || explained.current.has(task.taskId)) return;
    explained.current.add(task.taskId);
    api.post('/api/explain', { taskIds: [task.taskId] })
      .then((response) => {
        const entry = response.data.explanations?.[task.taskId];
        if (entry) setUpgraded((previous) => ({ ...previous, [task.taskId]: entry }));
      })
      .catch(() => { /* the template sentence is already on screen */ });
  }, [task]);

  function startTimer() {
    const next = { taskId: task.taskId, startedAt: Date.now() };
    localStorage.setItem(TIMER_KEY, JSON.stringify(next));
    setSession(next);
  }

  async function stopTimer() {
    if (!session) return;
    const hours = Math.round(((Date.now() - session.startedAt) / 3600000) * 10) / 10;
    localStorage.removeItem(TIMER_KEY);
    setSession(null);
    await logProgress({ hoursLogged: Math.max(hours, 0.1) });
  }

  async function logProgress(body: any) {
    try {
      await api.post(`/api/tasks/${task.taskId}/progress`, body);
      setProgressOpen(false);
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not log that.'));
    }
  }

  /**
   * UC-012 step 7 — tick the milestone the card is actually showing.
   *
   * The task-level "Done" would mark the whole report finished when the card
   * says "write the literature review". The server derives progressPct from
   * the completed milestone hours and rescores from there.
   */
  async function completeMilestone(milestoneId: string) {
    try {
      await api.patch(`/api/tasks/${task.taskId}/milestones/${milestoneId}`, {
        completedAt: new Date().toISOString(),
      });
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setProblem(errorMessage(error, 'Could not tick that step off.'));
    }
  }

  async function resolveOvernight(hours: number | null) {
    const pending = overnight;
    localStorage.removeItem(TIMER_KEY);
    setOvernight(null);
    if (!pending || hours === null) return;
    try {
      await api.post(`/api/tasks/${pending.taskId}/progress`, { hoursLogged: hours });
      await Promise.all([load(), refresh()]);
    } catch { /* the student can log it manually */ }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="h-64 animate-pulse rounded-card border border-hairline bg-surface" />
      </div>
    );
  }

  if (problem) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-card border border-hairline bg-surface p-6">
          <p className="text-crittext">{problem}</p>
          <button type="button" onClick={load} className="mt-3 text-sm font-medium text-ink underline underline-offset-2">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Alt A / E2 — an empty state that is still useful.
  if (!current) {
    return (
      <section className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-goodtint text-goodtext" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="display mt-4 text-[26px] text-ink">{data?.message}</h1>
        {data?.nextStartBy && (
          <p className="mt-1.5 text-sm text-ink2">
            Next thing to start: {formatDay(data.nextStartBy)}
          </p>
        )}
        {data?.needsAttention?.length > 0 && (
          <ul className="mt-6 w-full space-y-2 text-left">
            {data.needsAttention.map((entry: any) => (
              <li key={entry.taskId} className="rounded-card border border-warning/40 bg-warntint p-3 text-sm text-ink2">
                <span className="font-medium text-ink">{entry.title}</span> — needs a valid deadline
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const explanation = upgraded[task.taskId] || {
    text: current.explanation,
    source: current.explanationSource || 'template',
    contributions: current.contributions,
  };
  const elapsedHours = session ? (Date.now() - session.startedAt) / 3600000 : 0;
  const running = session?.taskId === task.taskId;

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center gap-4 px-6 py-8">
      {overnight && (
        <div className="rise rounded-card border border-warning/40 bg-warntint p-4">
          <p className="text-sm text-ink">
            A session was still running from {formatDay(new Date(overnight.startedAt).toISOString())}.
            Was that really a {Math.round((Date.now() - overnight.startedAt) / 3600000)}-hour session?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={() => resolveOvernight(hours)}
                className="rounded-lg border border-warning/50 bg-surface px-3 py-1 text-sm text-ink transition hover:bg-plane"
              >
                Log {hours} h
              </button>
            ))}
            <button
              type="button"
              onClick={() => resolveOvernight(null)}
              className="rounded-lg px-3 py-1 text-sm text-ink2 transition hover:text-ink"
            >
              Discard it
            </button>
          </div>
        </div>
      )}

      {(index > 0 || (data.skipped?.length > 0 && index === 0)) && (
        <p className="text-sm text-ink2">
          {index > 0
            ? <>Skipped the one above — <span className="font-medium text-ink">{current.rankedLowerBecause}</span></>
            : <>Skipped {data.skipped[0].title}: {data.skipped[0].reason}.</>}
        </p>
      )}

      <article className="rise rounded-card border border-hairline bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="display num rounded-md bg-accent px-2 py-0.5 text-sm text-plane">
              #{current.rank || index + 1}
            </span>
            <ModuleChip code={task.module} />
          </div>
          {task.tight && (
            <span className="flex items-center gap-1.5 rounded-full bg-crittint px-2.5 py-1 text-xs font-medium text-crittext">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Does not fit the time left
            </span>
          )}
        </div>

        <div className="px-6 py-7">
          <h1 className="display text-[34px] leading-[1.1] text-ink">
            {current.milestone ? current.milestone.name : task.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {current.milestone && <span>next step of {task.title} ·</span>}
            <span className="display num text-lg text-ink2">
              {countdownText(current.milestone?.dueAt || task.dueAt)}
            </span>
          </p>

          <div className="mt-6">
            <PriorityExplanation
              text={explanation.text}
              source={explanation.source}
              contributions={explanation.contributions || []}
              figures={current.figures}
              total={task.priorityScore}
            />
          </div>

          {/* UC-009 Alt A — the engine substituted a neutral 50 for a figure
              the student never gave it. Say which one, and say it here, next
              to the bar the substitution distorted. Degrading in quality is
              only acceptable if the student is told it happened. */}
          {task.dataGap?.length > 0 && (
            <p className="mt-3 text-xs text-serioustext">
              {DATA_GAP_HINT[task.dataGap[0]] || 'Fill in the missing details for a better ranking.'}
            </p>
          )}

          {progressOpen && (
            <div className="rise mt-6 rounded-xl border border-hairline bg-plane p-4">
              <label className="flex justify-between text-sm text-ink2" htmlFor="progress">
                <span>Progress</span>
                <span className="num font-medium text-ink">{progressValue}%</span>
              </label>
              <input
                id="progress"
                type="range"
                min="0"
                max="100"
                value={progressValue}
                onChange={(e) => setProgressValue(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => logProgress({ progressPct: progressValue })}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-plane transition hover:opacity-90"
                >
                  Save progress
                </button>
                <button
                  type="button"
                  onClick={() => setProgressOpen(false)}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2 transition hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-card border-t border-hairline bg-hairline sm:grid-cols-4">
          <button
            type="button"
            onClick={running ? stopTimer : startTimer}
            className={`px-3 py-3.5 text-sm font-medium transition ${
              running ? 'bg-crittint text-crittext hover:bg-crittint/70' : 'bg-surface text-ink hover:bg-plane'
            }`}
          >
            {running ? <span className="num">Stop · {elapsedHours.toFixed(1)} h</span> : 'Start'}
          </button>
          <button
            type="button"
            onClick={() => { setProgressValue(task.progressPct || 0); setProgressOpen(true); }}
            className="bg-surface px-3 py-3.5 text-sm text-ink2 transition hover:bg-plane hover:text-ink"
          >
            Progress
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(i + 1, cards.length - 1))}
            disabled={index >= cards.length - 1}
            className="bg-surface px-3 py-3.5 text-sm text-ink2 transition hover:bg-plane hover:text-ink disabled:opacity-40 disabled:hover:bg-surface"
          >
            Not now
          </button>
          {/* UC-011 step 5 — "Done" completes whatever the card is showing:
              the milestone when there is one, the task when there is not. */}
          <button
            type="button"
            onClick={() => (current.milestone
              ? completeMilestone(current.milestone.milestoneId)
              : logProgress({ progressPct: 100 }))}
            className="bg-surface px-3 py-3.5 text-sm text-ink2 transition hover:bg-plane hover:text-ink"
          >
            {current.milestone ? 'Step done' : 'Done'}
          </button>
        </div>
      </article>

      {/* UC-012 step 1 — a task with no breakdown yet is the one worth breaking
          down, and Focus Mode is where the student is already looking. */}
      {!current.milestone && !breakingDown && (
        <button
          type="button"
          onClick={() => setBreakingDown(true)}
          className="self-center text-sm text-ink2 underline underline-offset-4 transition hover:text-ink"
        >
          Break this into steps
        </button>
      )}

      {breakingDown && (
        <MilestoneEditor
          task={task}
          onCancel={() => setBreakingDown(false)}
          onSaved={async () => {
            setBreakingDown(false);
            await Promise.all([load(), refresh()]);
          }}
        />
      )}
    </section>
  );
}
