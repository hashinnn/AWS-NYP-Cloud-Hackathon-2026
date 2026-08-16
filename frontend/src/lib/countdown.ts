/**
 * Countdown wording — the brief's own phrasing: "Test in 3 days",
 * "Assignment due in 24 hours" (UC-016 step 4).
 */

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

const TYPE_NOUN: Record<string, string> = {
  test: 'Test',
  assignment: 'Assignment',
  project: 'Project',
  presentation: 'Presentation',
};

/** "due in 2 days, 14 hours" — UC-011 step 3. */
export function countdownText(dueAt: string, now: number = Date.now()): string {
  const remaining = Date.parse(dueAt) - now;
  if (Number.isNaN(remaining)) return 'no deadline set';

  if (remaining <= 0) {
    const late = -remaining;
    if (late < HOUR) return 'overdue';
    if (late < DAY) return `overdue by ${Math.floor(late / HOUR)} hours`;
    return `overdue by ${Math.floor(late / DAY)} days`;
  }

  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  const minutes = Math.floor((remaining % HOUR) / MINUTE);

  if (days > 0) return `due in ${days} ${days === 1 ? 'day' : 'days'}, ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  if (hours > 0) return `due in ${hours} ${hours === 1 ? 'hour' : 'hours'}, ${minutes} min`;
  return `due in ${minutes} min`;
}

/** "Test in 3 days" / "Assignment due in 24 hours" — the list wording. */
export function listCountdown(type: string, dueAt: string, now: number = Date.now()): string {
  const noun = TYPE_NOUN[type] || 'Task';
  const remaining = Date.parse(dueAt) - now;

  if (remaining <= 0) return `${noun} overdue`;

  const days = Math.floor(remaining / DAY);
  if (days >= 1) return `${noun} in ${days} ${days === 1 ? 'day' : 'days'}`;

  const hours = Math.ceil(remaining / HOUR);
  return `${noun} due in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} h`;
}

export function formatDate(iso: string, tz = 'Asia/Singapore'): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export function formatDay(iso: string, tz = 'Asia/Singapore'): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
