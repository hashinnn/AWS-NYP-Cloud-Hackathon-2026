'use strict';

/**
 * Study-capacity model — UC-004 → UC-009 (c) Effort Pressure.
 *
 * Shared by effortPressure.js, UC-013 crash-week detection and UC-014 daily
 * plan, so there is exactly one answer to "how many study hours does this
 * student have between A and B".
 *
 * Pure: no clock reads, no I/O. Every instant is passed in.
 */

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;

const DEFAULT_TZ = 'Asia/Singapore';
const DEFAULT_AVAILABILITY = { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 5, sun: 5 };

// Indexed by Date#getUTCDay() applied to a wall-clock instant.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// A window longer than this contributes nothing useful to a capacity estimate;
// the bound stops a corrupt far-future dueAt from turning into a long loop.
const MAX_WINDOW_DAYS = 3660;

const formatterCache = new Map();

function formatterFor(tz) {
  if (formatterCache.has(tz)) return formatterCache.get(tz);
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    fmt = null; // unknown IANA zone → treated as UTC
  }
  formatterCache.set(tz, fmt);
  return fmt;
}

/** Offset of `tz` from UTC, in ms, at the instant `ms`. */
function zoneOffsetMs(ms, tz) {
  const fmt = formatterFor(tz);
  if (!fmt) return 0;
  const parts = {};
  for (const { type, value } of fmt.formatToParts(new Date(ms))) parts[type] = value;
  const wall = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  return NaN;
}

function hoursFor(availability, key) {
  const h = Number(availability[key]);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.min(h, 24);
}

function resolvePrefs(prefs) {
  const p = prefs || {};
  return {
    tz: typeof p.tz === 'string' && p.tz ? p.tz : DEFAULT_TZ,
    availability: { ...DEFAULT_AVAILABILITY, ...(p.availability || {}) },
    blocked: new Set(Array.isArray(p.blockedDates) ? p.blockedDates : []),
  };
}

/**
 * Study hours available between two instants.
 *
 * Each calendar day in the student's own timezone contributes its weekday
 * allowance in proportion to how much of that day falls inside the window, so
 * availability decays smoothly as `now` advances instead of stepping down at
 * midnight. A stepped model would make the priority score jump for no reason a
 * student could see, which is exactly what UC-009 exists to avoid.
 *
 * Blocked dates (UC-004 step 5) contribute zero.
 *
 * The UTC offset is resolved once, at the start of the window: a DST transition
 * inside a window moves a day boundary by an hour, which is immaterial to a
 * capacity estimate expressed in whole hours. Asia/Singapore has no DST at all.
 *
 * @param {Date|string|number} from
 * @param {Date|string|number} to
 * @param {{availability?:object, blockedDates?:string[], tz?:string}} prefs
 * @returns {number} hours, never negative
 */
function availableHoursBetween(from, to, prefs) {
  const start = toMs(from);
  const end = toMs(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const { tz, availability, blocked } = resolvePrefs(prefs);
  const offset = zoneOffsetMs(start, tz);

  const wallStart = start + offset;
  const wallEnd = end + offset;

  const firstDay = Math.floor(wallStart / MS_PER_DAY);
  const lastDay = Math.min(
    Math.floor((wallEnd - 1) / MS_PER_DAY),
    firstDay + MAX_WINDOW_DAYS,
  );

  let total = 0;
  for (let day = firstDay; day <= lastDay; day++) {
    const dayStart = day * MS_PER_DAY;
    const overlap = Math.min(wallEnd, dayStart + MS_PER_DAY) - Math.max(wallStart, dayStart);
    if (overlap <= 0) continue;

    const wall = new Date(dayStart);
    if (blocked.has(wall.toISOString().slice(0, 10))) continue;

    total += hoursFor(availability, WEEKDAY_KEYS[wall.getUTCDay()]) * (overlap / MS_PER_DAY);
  }
  return total;
}

/**
 * Full study hours for the local calendar day containing `when` — 0 on a
 * blocked date. UC-014 allocates against this figure.
 */
function dailyAvailableHours(when, prefs) {
  const ms = toMs(when);
  if (!Number.isFinite(ms)) return 0;

  const { tz, availability, blocked } = resolvePrefs(prefs);
  const wall = new Date(ms + zoneOffsetMs(ms, tz));
  if (blocked.has(wall.toISOString().slice(0, 10))) return 0;
  return hoursFor(availability, WEEKDAY_KEYS[wall.getUTCDay()]);
}

/** The `YYYY-MM-DD` the student would call this instant. */
function localDateKey(when, tz = DEFAULT_TZ) {
  const ms = toMs(when);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + zoneOffsetMs(ms, tz)).toISOString().slice(0, 10);
}

/** Midnight local on the day containing `when`, as a UTC instant. */
function startOfLocalDay(when, tz = DEFAULT_TZ) {
  const ms = toMs(when);
  if (!Number.isFinite(ms)) return NaN;
  const offset = zoneOffsetMs(ms, tz);
  return Math.floor((ms + offset) / MS_PER_DAY) * MS_PER_DAY - offset;
}

/**
 * 23:59 local on the day containing `when`, as a UTC instant — the deadline
 * convention everything in this system uses (HLD §5.5).
 */
function endOfLocalDay(when, tz = DEFAULT_TZ) {
  const ms = toMs(when);
  if (!Number.isFinite(ms)) return NaN;
  const offset = zoneOffsetMs(ms, tz);
  const wallDayStart = Math.floor((ms + offset) / MS_PER_DAY) * MS_PER_DAY;
  return wallDayStart + MS_PER_DAY - 60000 - offset;
}

module.exports = {
  availableHoursBetween,
  dailyAvailableHours,
  localDateKey,
  startOfLocalDay,
  endOfLocalDay,
  DEFAULT_AVAILABILITY,
  DEFAULT_TZ,
  MS_PER_DAY,
  MS_PER_HOUR,
  toMs,
};
