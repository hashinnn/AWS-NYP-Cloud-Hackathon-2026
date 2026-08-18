'use strict';

/**
 * GET /api/dashboard — UC-016 [Z-03].
 *
 * Class A read: < 500 ms, no model call. The sentence shown on the NEXT UP
 * card is the one UC-010 already persisted; if a task has none yet the card
 * renders its sub-score bar and the frontend asks `/api/explain` separately.
 * A dashboard that waited on a language model would be a dashboard that is
 * blank whenever the free tier is rate-limited.
 */

const { ok, fail } = require('../../lib/http');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const { buildWeeks } = require('../../lib/workload/weeks');
const { crashWeeks } = require('../../lib/workload/recommend');
const { rememberUser } = require('../../lib/dynamo/notifications');
const { extractTasks } = require('../../lib/dynamo/tasks');
const { toMs, MS_PER_DAY } = require('../../lib/scoring/availability');

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const now = new Date().toISOString();
  const nowMs = toMs(now);

  try {
    const {
      items, ranked, milestones, prefs, storedPrefs, weights,
    } = await loadRanked(userId, now);

    const profile = items.find((item) => item.SK === 'PROFILE') || {};

    // The scheduled sweep has no way to enumerate students without a Scan, so
    // the roster is written here — see lib/dynamo/notifications.js.
    rememberUser(userId, profile.email).catch((error) => console.warn(JSON.stringify({
      level: 'WARN', event: 'roster_write_failed', message: error.message,
    })));

    const active = ranked.filter((task) => task.status === 'active');
    const overdue = ranked.filter((task) => task.status === 'overdue');

    // Overdue first — UC-021 step 2 pins them above everything, in every view.
    const nextUp = overdue[0] || active[0] || null;

    const weeks = buildWeeks(ranked, milestones, prefs, now);
    const thisWeek = weeks[0] || { requiredHours: 0, availableHours: 0, loadRatio: 0 };

    // `loadRanked().tasks` is the RANKED set — active and overdue only — so
    // the completed count has to come from the raw items.
    const completedThisWeek = extractTasks(items).filter((task) => task.status === 'completed'
      && nowMs - toMs(task.completedAt || task.dueAt) <= 7 * MS_PER_DAY).length;

    return ok(200, {
      nextUp: nextUp ? {
        ...publicTask(nextUp),
        explanation: nextUp.explanation || null,
        explanationSource: nextUp.explanationSource || null,
      } : null,
      thisWeek: {
        required: thisWeek.requiredHours,
        available: thisWeek.availableHours,
        ratio: thisWeek.loadRatio,
        unavailable: Boolean(thisWeek.unavailable),
      },
      counts: {
        dueIn7: active.filter((task) => {
          const due = toMs(task.dueAt);
          return Number.isFinite(due) && due >= nowMs && due - nowMs <= 7 * MS_PER_DAY;
        }).length,
        overdue: overdue.length,
        completedThisWeek,
        active: active.length,
      },
      // UC-013's card, rendered on the dashboard as well as the heatmap.
      alerts: crashWeeks(weeks, ranked, prefs, storedPrefs && storedPrefs.crashDismissals, now)
        .slice(0, 1),
      ranking: ranked.map(publicTask),
      weights,
      computedAt: now,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'dashboard_failed', message: error.message,
    }));
    // E1 — the client keeps its cached list in deadline order behind a banner.
    return fail(503, 'scoring_unavailable', 'Live prioritisation is unavailable — showing deadline order.');
  }
};
