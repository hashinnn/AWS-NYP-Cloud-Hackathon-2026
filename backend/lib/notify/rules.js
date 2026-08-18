'use strict';

/**
 * UC-019 step 4 — which reminders a student is owed right now, and step 5–6 —
 * which of them the budget actually permits.
 *
 * Pure: no clock read, no I/O, no SDK. `now` is a parameter, exactly as in the
 * scoring engine, so the whole notification policy is unit-testable and the
 * judging answer — "three per day, digest absorbs the overflow, quiet hours
 * enforced" — is one function anybody can read.
 */

const { startOfLocalDay, toMs, MS_PER_HOUR } = require('../scoring/availability');

const DAY_MS = 24 * MS_PER_HOUR;

// Step 4's stated order. Everything downstream — the cap, the overflow — is
// applied to this sequence, so the order is the policy.
//
// `lead_time` is last deliberately: it is the least urgent thing here, so
// under cap pressure a "start this soon" reminder yields to a deadline that
// has already arrived.
const RULE_ORDER = [
  'digest', 'same_day_nudge', 'escalation', 'crash_week', 'overdue_group', 'lead_time',
];

// UC-020 step 3 — tests get the longest lead because they need preparation
// across several days; a quiz does not.
const DEFAULT_LEAD_DAYS = {
  test: 7, project: 5, assignment: 3, presentation: 3,
};

// Below two days the same-day nudge already covers the task, and two
// reminders about one deadline in one day is exactly the overload the cap
// exists to prevent.
const MIN_LEAD_DAYS = 2;

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Minutes past local midnight, for `now` in the student's own timezone.
 *
 * Every scheduling decision in this file — digest time, quiet hours — is a
 * comparison against this, never against the Lambda's UTC clock. A 23:59 SGT
 * deadline evaluated in UTC is six hours of false overdue states (HLD §10.2).
 */
function localMinutes(now, tz) {
  const ms = toMs(now);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(((ms - startOfLocalDay(ms, tz)) % DAY_MS) / 60000);
}

function parseHhmm(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) && minutes >= 0 && minutes < 1440 ? minutes : fallback;
}

/**
 * Quiet hours wrap midnight by default (22:00 → 07:00), so the test is an
 * inclusion in a possibly-wrapping interval, not a simple range check.
 */
function inQuietHours(now, prefs) {
  const quiet = (prefs && prefs.quietHours) || {};
  const start = parseHhmm(quiet.start, 22 * 60);
  const end = parseHhmm(quiet.end, 7 * 60);
  if (start === end) return false;

  const at = localMinutes(now, prefs && prefs.tz);
  return start < end ? at >= start && at < end : at >= start || at < end;
}

/** UC-020 Alt B — the digest time the student will actually be served. */
function effectiveDigestAt(prefs) {
  const digest = parseHhmm(prefs && prefs.digestAt, 8 * 60);
  const quiet = (prefs && prefs.quietHours) || {};
  const start = parseHhmm(quiet.start, 22 * 60);
  const end = parseHhmm(quiet.end, 7 * 60);
  const inside = start < end
    ? digest >= start && digest < end
    : digest >= start || digest < end;

  if (!inside) return { minutes: digest, deferred: false };
  return { minutes: end, deferred: true };
}

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const hoursUntil = (dueAt, now) => (toMs(dueAt) - toMs(now)) / MS_PER_HOUR;

function daysWord(hours) {
  const days = Math.max(Math.round(hours / 24), 0);
  if (days <= 0) return 'today';
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The digest body: today's plan, the top three, and anything overdue. */
function digestBody(ranked, plan, absorbed, now) {
  const lines = [];

  if (plan && plan.blocks && plan.blocks.length > 0) {
    lines.push('Today’s plan:');
    for (const block of plan.blocks) {
      lines.push(`  ${round1(block.hours)} h — ${block.label || block.taskTitle} (${block.rationale})`);
    }
  } else if (plan && plan.shift) {
    lines.push(plan.shift.message);
  } else {
    lines.push('Nothing scheduled today.');
  }

  const top = ranked
    .filter((task) => task.status === 'active' && task.priorityScore !== null)
    .slice(0, 3);
  if (top.length > 0) {
    lines.push('', 'Top priorities:');
    top.forEach((task, index) => {
      lines.push(`  ${index + 1}. ${task.title}${task.module ? ` (${task.module})` : ''} — due ${daysWord(hoursUntil(task.dueAt, now))}`);
    });
  }

  const overdue = ranked.filter((task) => task.status === 'overdue');
  if (overdue.length > 0) {
    lines.push('', `Overdue — resolve these first: ${overdue.map((task) => task.title).join(', ')}`);
  }

  // Step 5 — the overflow was never dropped, it was held. Say so.
  if (absorbed && absorbed.length > 0) {
    lines.push('', `Held from yesterday (daily cap reached): ${absorbed.map((item) => item.subject).join('; ')}`);
  }

  return lines.join('\n');
}

/**
 * Every reminder this student is owed at this instant, in rule order.
 *
 * @param {object} input
 * @param {object[]} input.ranked     scored tasks, engine order
 * @param {object} input.prefs        PREFS (+ tz merged in)
 * @param {object} [input.plan]       UC-014 output, for the digest
 * @param {object[]} [input.crashWeeks] UC-013 output
 * @param {object[]} [input.absorbed] notifications held by yesterday's cap
 * @param {string|number|Date} input.now
 * @returns {object[]} `{rule, taskId, subject, body}` in evaluation order
 */
function candidates({
  ranked, prefs, plan, crashWeeks = [], absorbed = [], now,
}) {
  const out = [];
  const tz = prefs && prefs.tz;
  const digest = effectiveDigestAt(prefs);

  // (a) Daily digest — eligible once the student's own digest time has passed
  // today. The NOTIF# key makes "once" literal, so an hourly run that arrives
  // after the daily one simply writes nothing.
  if (localMinutes(now, tz) >= digest.minutes) {
    out.push({
      rule: 'digest',
      taskId: null,
      subject: `DeadlineIQ — your ${hhmm(digest.minutes)} plan`,
      body: digestBody(ranked, plan, absorbed, now),
    });
  }

  // (b) Same-day nudge — due within 24 h and below 90 % complete.
  for (const task of ranked) {
    if (task.status !== 'active') continue;
    const hours = hoursUntil(task.dueAt, now);
    if (hours <= 0 || hours > 24) continue;
    if (Number(task.progressPct) >= 90) continue;

    out.push({
      rule: 'same_day_nudge',
      taskId: task.taskId,
      subject: `${task.title} is due in ${Math.max(Math.round(hours), 1)} hours`,
      body: `${task.title}${task.module ? ` (${task.module})` : ''} is due in `
        + `${Math.max(Math.round(hours), 1)} hours and you're at ${Number(task.progressPct) || 0}%.`,
    });
  }

  // (c) Escalation — behind pace, not merely close. This is the rule that
  // makes the reminders adaptive rather than calendar-driven (HLD §9.2).
  if (prefs.escalationEnabled !== false) {
    for (const task of ranked) {
      if (task.status !== 'active') continue;
      const deficit = task.subScores && Number(task.subScores.progressDeficit);
      if (!Number.isFinite(deficit) || deficit <= 40) continue;
      const hours = hoursUntil(task.dueAt, now);
      if (hours <= 0 || hours > 48) continue;

      out.push({
        rule: 'escalation',
        taskId: task.taskId,
        subject: `You're behind on ${task.title}`,
        body: `You're ${Math.round(deficit)}% behind pace on ${task.title}, due `
          + `${daysWord(hours)}. ${round1(Number(task.effortHours || 0) * (1 - (Number(task.progressPct) || 0) / 100))} hours of work remain.`,
      });
    }
  }

  // (e) Lead-time reminder — the student's own per-type lead (UC-020 step 3).
  // It fires on the day the deadline crosses INTO that window, once, rather
  // than every day from then on: "you should be starting this now" is useful
  // said once and noise said seven times.
  const leadTimes = { ...DEFAULT_LEAD_DAYS, ...((prefs && prefs.leadTimes) || {}) };
  for (const task of ranked) {
    if (task.status !== 'active') continue;
    const leadDays = Number(leadTimes[task.type]);
    if (!Number.isFinite(leadDays) || leadDays < MIN_LEAD_DAYS) continue;

    const hours = hoursUntil(task.dueAt, now);
    const window = leadDays * 24;
    // Strictly inside the 24 h during which the deadline crossed the lead
    // boundary — the hourly run means one of them always catches it.
    if (hours > window || hours <= window - 24) continue;
    if (Number(task.progressPct) >= 90) continue;

    const remaining = round1(Number(task.effortHours || 0) * (1 - (Number(task.progressPct) || 0) / 100));
    out.push({
      rule: 'lead_time',
      taskId: task.taskId,
      subject: `Time to start ${task.title}`,
      body: `${task.title}${task.module ? ` (${task.module})` : ''} is due ${daysWord(hours)}`
        + `, and you set a ${leadDays}-day lead for ${task.type}s. `
        + `${remaining} hours of work remain.`,
    });
  }

  // (d) Crash-week alert — at most one a week, enforced by the caller through
  // the NOTIF# history (the key alone only dedupes within a day).
  const firstCrash = crashWeeks[0];
  if (firstCrash) {
    out.push({
      rule: 'crash_week',
      taskId: firstCrash.weekStart.slice(0, 10),
      subject: `Week of ${firstCrash.label} is ${round1(firstCrash.overloadHours)} hours over capacity`,
      body: `Week of ${firstCrash.label}: ${firstCrash.requiredHours} hours of work against `
        + `${firstCrash.availableHours} available.`
        + (firstCrash.recommendation ? `\n\n${firstCrash.recommendation.text}` : ''),
    });
  }

  // UC-021 Alt A — several overdue tasks are one card, not one alert each,
  // which would also eat the entire daily cap by itself.
  const overdue = ranked.filter((task) => task.status === 'overdue');
  if (overdue.length >= 2) {
    out.push({
      rule: 'overdue_group',
      taskId: null,
      subject: `${overdue.length} tasks are overdue`,
      body: `${overdue.length} tasks are overdue: ${overdue.map((task) => task.title).join(', ')}.`
        + '\n\nMark them submitted late, set a new deadline, or archive them.',
    });
  }

  return out.sort((a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule));
}

/**
 * Steps 5–6 — the budget. Splits the candidates into what goes out now, what
 * is held for quiet hours, and what the cap absorbs into the next digest.
 *
 * @param {object[]} list       candidates, in rule order
 * @param {number} alreadySent  notifications already written today
 * @param {object} prefs
 * @param {string|number|Date} now
 */
function applyBudget(list, alreadySent, prefs, now) {
  const cap = Math.min(Math.max(Number(prefs && prefs.dailyCap) || 3, 1), 5);
  const quiet = inQuietHours(now, prefs);

  // Quiet hours queue rather than drop: nothing is written, so the next
  // permitted run re-evaluates and delivers (step 6).
  if (quiet) return { send: [], held: list, absorb: [], cap };

  let budget = Math.max(cap - alreadySent, 0);
  const send = [];
  const absorb = [];

  for (const message of list) {
    if (budget > 0) {
      send.push(message);
      budget -= 1;
    } else {
      absorb.push(message);
    }
  }

  return {
    send, held: [], absorb, cap,
  };
}

module.exports = {
  candidates,
  applyBudget,
  inQuietHours,
  effectiveDigestAt,
  localMinutes,
  digestBody,
  RULE_ORDER,
  DEFAULT_LEAD_DAYS,
  MIN_LEAD_DAYS,
};
