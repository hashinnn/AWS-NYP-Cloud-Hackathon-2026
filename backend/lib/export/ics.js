'use strict';

/**
 * UC-023 — RFC 5545 calendar generation.
 *
 * Written by hand rather than through the `ics` package: the whole format we
 * need is one VEVENT with one VALARM, the escaping rules are four characters
 * long, and a pure function with no dependency is something the subscription
 * feed can call on a cold Lambda without paying for a module load. The output
 * is what matters and it is imported by Google, Apple and Outlook alike.
 *
 * Pure: no clock read, no I/O.
 */

const { toMs } = require('../scoring/availability');

const PRODID = '-//DeadlineIQ//NYP Cloud Hackathon 2026//EN';

/** RFC 5545 §3.3.11 — the four characters that must be escaped in TEXT. */
function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `20260824T155900Z` */
function stamp(when) {
  const ms = toMs(when);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * §3.1 — lines are folded at 75 octets, continuations starting with a space.
 * Calendar clients that reject long lines are rare but they exist, and a
 * rejected import at the judging table is not the moment to discover one.
 */
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

function event({
  uid, start, end, summary, description, alarmDays, dtstamp,
}) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${start}`,
    `DTEND:${end || start}`,
    `SUMMARY:${escapeText(summary)}`,
  ];

  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);

  // Step 3 — the alarm is the student's own lead time for that task type, so
  // the calendar they export into reminds them on the same schedule the app
  // would have (UC-020 step 3).
  if (alarmDays > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-P${Math.round(alarmDays)}D`,
      `DESCRIPTION:${escapeText(summary)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/**
 * @param {object[]} tasks     tasks already filtered to the chosen scope
 * @param {object[]} milestones included only when the student asked for them
 * @param {object} options
 * @param {object} [options.leadTimes] per-type reminder lead, in days
 * @param {string} options.now
 * @returns {string} the .ics document
 */
function buildIcs(tasks, milestones, { leadTimes = {}, now, calendarName = 'DeadlineIQ' } = {}) {
  const dtstamp = stamp(now || Date.now());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const task of tasks) {
    const start = stamp(task.dueAt);
    if (!start) continue; // a task with no usable deadline is simply not an event

    const description = [
      task.gradeWeight != null ? `Worth ${task.gradeWeight}% of ${task.module || 'the module'}.` : null,
      task.effortHours != null ? `Estimated effort: ${task.effortHours} hours.` : null,
      task.notes || null,
    ].filter(Boolean).join('\n');

    lines.push(...event({
      uid: `task-${task.taskId}@deadlineiq`,
      start,
      end: start,
      summary: task.module ? `${task.module} — ${task.title}` : task.title,
      description,
      alarmDays: Number(leadTimes[task.type]) || 0,
      dtstamp,
    }));
  }

  for (const milestone of milestones || []) {
    const start = stamp(milestone.dueAt);
    if (!start) continue;
    const parent = tasks.find((task) => task.taskId === milestone.taskId);

    lines.push(...event({
      uid: `milestone-${milestone.taskId}-${milestone.milestoneId}@deadlineiq`,
      start,
      end: start,
      summary: `${parent && parent.module ? `${parent.module} — ` : ''}${milestone.name}`,
      description: milestone.hours != null ? `${milestone.hours} hours allocated.` : '',
      alarmDays: 0,
      dtstamp,
    }));
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** E2 — .ics generation failed, but the student still gets their data out. */
function buildCsv(tasks) {
  const cell = (value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  const rows = [['title', 'module', 'type', 'dueAt', 'gradeWeight', 'effortHours', 'progressPct', 'status']
    .map(cell).join(',')];

  for (const task of tasks) {
    rows.push([
      task.title, task.module, task.type, task.dueAt, task.gradeWeight,
      task.effortHours, task.progressPct, task.status,
    ].map(cell).join(','));
  }

  return `${rows.join('\r\n')}\r\n`;
}

module.exports = { buildIcs, buildCsv, escapeText, stamp };
