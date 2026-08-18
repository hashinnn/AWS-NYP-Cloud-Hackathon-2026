'use strict';

/**
 * Deadline normalisation — UC-002 step 3, HLD §5.5 and §10.2.
 *
 * Storage and the wire are ISO-8601 UTC with `Z`; what a student *types* is a
 * wall-clock time in their own timezone. This is the single conversion point
 * between the two, so "23:59" always means 23:59 where the student is rather
 * than 23:59 wherever the Lambda happens to be running.
 *
 * Pure — `tz` is passed in, nothing is read from the environment.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Offset of `tz` from UTC, in ms, at the instant `ms`.
 *
 * Same Intl idiom as `scoring/availability.js`. Duplicated rather than
 * imported because that module is the scoring engine's private capacity
 * model and this is a request-parsing concern — a UTC offset is a fact about
 * the calendar, not a design decision that could drift between the two.
 */
function zoneOffsetMs(ms, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const part = {};
    for (const { type, value } of fmt.formatToParts(new Date(ms))) part[type] = value;
    const wall = Date.UTC(
      Number(part.year), Number(part.month) - 1, Number(part.day),
      Number(part.hour), Number(part.minute), Number(part.second),
    );
    return wall - Math.floor(ms / 1000) * 1000;
  } catch {
    return 0;   // unknown IANA zone — treat as UTC
  }
}

/**
 * Resolve whatever the client sent into an ISO-8601 UTC instant.
 *
 *   '2026-08-21'                  → 23:59 that day, in `tz`   (the poly norm)
 *   '2026-08-21T14:30'            → 14:30 that day, in `tz`
 *   '2026-08-21T14:30:00Z'        → taken at face value
 *   '2026-08-21T14:30:00+08:00'   → taken at face value
 *
 * @returns {string|null} ISO-8601 UTC with `Z`, or null if unparseable
 */
function resolveDueAt(input, tz) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // HLD §5.5 — a bare date means end of that day, not midnight at its start.
  const wall = DATE_ONLY.test(raw) ? `${raw}T23:59:00` : raw;

  if (HAS_ZONE.test(wall)) {
    const ms = Date.parse(wall);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  // A naive wall clock. Read the components as if they were UTC, then slide
  // by the zone's offset. The second pass settles the case where the first
  // guess landed on the far side of a DST transition; Asia/Singapore has no
  // DST, so it is a no-op for our students and correct for everyone else.
  const asUtc = Date.parse(`${wall}Z`);
  if (!Number.isFinite(asUtc)) return null;

  const first = asUtc - zoneOffsetMs(asUtc, tz);
  const settled = asUtc - zoneOffsetMs(first, tz);
  return new Date(settled).toISOString();
}

module.exports = { resolveDueAt };
