'use strict';

/**
 * UC-019 — one pass of the scheduled deadline check.
 *
 * Both EventBridge rules and the manual demo trigger land here, distinguished
 * only by `job`, so there is one code path to debug and one log group to watch.
 *
 *   recompute (hourly)  rescore · overdue transitions · crash weeks ·
 *                       pre-warm the top 5 explanations · nudges + escalations
 *   digest    (daily)   the same sweep, whose digest rule fires at the
 *                       student's own configured time
 *
 * The rules themselves live in `lib/notify/rules.js` and are pure; this file is
 * the I/O around them.
 */

const { loadRanked } = require('../loadRanked');
const {
  saveScores, patchTask, rankedTasks, getAllForUser,
} = require('../dynamo/tasks');
const { extractPrefs, scoringPrefs } = require('../dynamo/prefs');
const { extractMilestones } = require('../dynamo/milestones');
const { listUsers, listForDate, getCursor, setCursor } = require('../dynamo/notifications');
const { send } = require('../notify/send');
const { candidates, applyBudget } = require('../notify/rules');
const { buildWeeks } = require('../workload/weeks');
const { crashWeeks } = require('../workload/recommend');
const { planToday } = require('../plan/allocate');
const { explainMany } = require('../explain/generate');
const { newlyOverdue, staleOverdue, overduePatch } = require('../overdue/transition');
const { localDateKey, toMs, MS_PER_DAY } = require('../scoring/availability');

const PAGE_SIZE = 25;
const PREWARM_COUNT = 5;
const CRASH_ALERT_INTERVAL_MS = 7 * MS_PER_DAY;

// Leave room to write the cursor before Lambda's 30 s hard stop (E2).
const TIME_BUDGET_MS = 24000;

function log(event, fields) {
  console.log(JSON.stringify({ level: 'INFO', event, ...fields }));
}

/** UC-021 steps 1–2, and Alt B's auto-archive, applied to one student. */
async function applyOverdueTransitions(userId, tasks, now) {
  const at = new Date(toMs(now)).toISOString();
  const changed = [];

  for (const task of newlyOverdue(tasks, now)) {
    // eslint-disable-next-line no-await-in-loop
    await patchTask(userId, task.taskId, overduePatch(task, at));
    changed.push(task.taskId);
  }

  for (const task of staleOverdue(tasks, now)) {
    // eslint-disable-next-line no-await-in-loop
    await patchTask(userId, task.taskId, {
      status: 'archived',
      history: [...(task.history || []), { action: 'auto_archived', at, reason: 'overdue for 30 days' }],
    });
    changed.push(task.taskId);
  }

  return changed;
}

/**
 * Rule (d) is capped at one a week, which the daily NOTIF# key cannot express
 * on its own — so the last seven days of keys are the check.
 */
async function crashAlertAllowed(userId, now) {
  const nowMs = toMs(now);
  for (let back = 0; back < 7; back += 1) {
    const date = localDateKey(nowMs - back * MS_PER_DAY);
    // eslint-disable-next-line no-await-in-loop
    const items = await listForDate(userId, date);
    if (items.some((item) => item.rule === 'crash_week')) return false;
  }
  return true;
}

/**
 * One student: rescore, transition, evaluate, deliver.
 * @returns {Promise<{sent:number, skipped:number, held:number, absorbed:number}>}
 */
async function processUser(entry, job, now) {
  const userId = entry.userId;
  const nowIso = new Date(toMs(now)).toISOString();
  const result = {
    sent: 0, skipped: 0, held: 0, absorbed: 0,
  };

  let context;
  try {
    context = await loadRanked(userId, nowIso);
    await applyOverdueTransitions(userId, context.tasks, nowIso);
    // The transitions above change status and therefore Urgency, so the set is
    // re-read and re-scored before anything is persisted or narrated.
    context = await loadRanked(userId, nowIso);
    await saveScores(userId, context.ranked);
  } catch (error) {
    // E4 — delivery is decoupled from scoring. Fall back to what is stored.
    console.warn(JSON.stringify({
      level: 'WARN', event: 'recompute_failed', userId, message: error.message,
    }));
    try {
      const items = await getAllForUser(userId);
      const stored = extractPrefs(items);
      context = {
        ranked: rankedTasks(items),
        milestones: extractMilestones(items),
        prefs: scoringPrefs(items, stored),
        storedPrefs: stored,
        weights: stored.weights,
        stale: true,
        rankOf: () => 0,
      };
    } catch (fatal) {
      console.error(JSON.stringify({
        level: 'ERROR', event: 'user_skipped', userId, message: fatal.message,
      }));
      result.skipped += 1;
      return result;
    }
  }

  const {
    ranked, milestones, prefs, storedPrefs, weights,
  } = context;

  // Alt B — pre-warm the top 5 so Focus Mode opens with no loading state on
  // stage. Class D: this is the only place an AI call is allowed in the sweep,
  // and it narrates scores that are already final.
  if (job === 'recompute' && !context.stale) {
    const top = ranked.filter((task) => task.subScores).slice(0, PREWARM_COUNT);
    await explainMany(top, ranked, prefs, weights, toMs(now), context.rankOf)
      .then((results) => Promise.all(results.map((explanation, i) => (explanation.cached
        ? null
        : patchTask(userId, top[i].taskId, {
          explanation: explanation.text,
          explanationHash: explanation.hash,
          explanationSource: explanation.source,
          explanationStale: false,
        })))))
      .catch((error) => console.warn(JSON.stringify({
        level: 'WARN', event: 'prewarm_failed', userId, message: error.message,
      })));
  }

  const weeks = buildWeeks(ranked, milestones, prefs, nowIso);
  const crashes = (await crashAlertAllowed(userId, now))
    ? crashWeeks(weeks, ranked, prefs, storedPrefs && storedPrefs.crashDismissals, nowIso)
    : [];

  const today = localDateKey(now, prefs.tz);
  // A test send (UC-020 step 6) is deliberately excluded: pressing the button
  // on stage must not consume the demo student's daily cap.
  const sentToday = (await listForDate(userId, today)).filter((item) => !item.test);

  const messages = candidates({
    ranked,
    prefs,
    plan: planToday(ranked, milestones, prefs, nowIso, weights),
    crashWeeks: crashes,
    absorbed: sentToday.filter((item) => item.absorbed),
    now: nowIso,
  }).filter((message) => !sentToday.some((item) => item.rule === message.rule
    && (item.taskId || null) === (message.taskId || null)));

  // Alt A — notifications off: the scores above are still fresh, nothing goes
  // out. Scoring and delivery are deliberately decoupled.
  const inAppOnly = prefs.channels && prefs.channels.inApp === false;
  const budget = applyBudget(
    messages,
    sentToday.filter((item) => !item.absorbed).length,
    prefs,
    nowIso,
  );

  result.held = budget.held.length;

  for (const message of budget.send) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await send({
      ...message,
      userId,
      date: today,
      email: entry.email,
      emailEnabled: !inAppOnly && !(prefs.channels && prefs.channels.email === false),
    });
    if (outcome.duplicate) result.skipped += 1;
    else result.sent += 1;
  }

  // Step 5 — over the cap is not dropped. It is written in-app and named in
  // the next digest, so nothing is ever silently lost.
  for (const message of budget.absorb) {
    // eslint-disable-next-line no-await-in-loop
    await send({
      ...message, userId, date: today, absorbed: true, emailEnabled: false,
    });
    result.absorbed += 1;
  }

  return result;
}

/**
 * @param {object} input
 * @param {'recompute'|'digest'} input.job
 * @param {string} [input.userId] one student only — the stage demo path
 * @param {string|number|Date} [input.now]
 */
async function runJob({ job = 'recompute', userId, now = new Date() }) {
  const startedAt = new Date(toMs(now)).toISOString();
  const deadline = Date.now() + TIME_BUDGET_MS;
  const totals = {
    processed: 0, sent: 0, skipped: 0, held: 0, absorbed: 0,
  };

  // One student, by request: the manual trigger used on stage.
  if (userId) {
    const outcome = await processUser({ userId }, job, now);
    log('reminder_run_complete', { job, userId, ...outcome });
    return {
      job, processed: 1, ...outcome, cursor: null,
    };
  }

  const previous = await getCursor(job);
  let after = previous && previous.lastUserId;
  let cursor = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await listUsers(after, PAGE_SIZE);
    if (page.length === 0) {
      // Reached the end — the next invocation starts from the top again.
      await setCursor(job, null, startedAt);
      break;
    }

    for (const entry of page) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await processUser(entry, job, now);
      totals.processed += 1;
      totals.sent += outcome.sent;
      totals.skipped += outcome.skipped;
      totals.held += outcome.held;
      totals.absorbed += outcome.absorbed;
      after = entry.userId;

      if (Date.now() > deadline) {
        // E2 — record where we got to and stop. The next invocation resumes
        // rather than restarting, so partial delivery is never repeated.
        cursor = after;
        // eslint-disable-next-line no-await-in-loop
        await setCursor(job, cursor, startedAt);
        log('reminder_run_paused', { job, ...totals, cursor });
        return { job, ...totals, cursor };
      }
    }
  }

  log('reminder_run_complete', { job, ...totals });
  return { job, ...totals, cursor };
}

module.exports = { runJob, processUser, applyOverdueTransitions };
