'use strict';

/**
 * GET /api/focus — UC-011. One card, one decision.
 *
 * Class A read (< 500 ms), so this path NEVER calls the model: it serves the
 * cached sentence when the sub-scores are unchanged, and the deterministic
 * template otherwise. The frontend may then call POST /api/explain to upgrade
 * the wording in the background. UC-011 E1 requires exactly this — "Focus Mode
 * never blocks on the AI" — and HLD §7 forbids an LLM call on a Class A path.
 */

const { ok, fail } = require('../../lib/http');
const { loadRanked, publicTask } = require('../../lib/loadRanked');
const { explainTask } = require('../../lib/explain/generate');
const { reasonRankedLower } = require('../../lib/explain/compare');
const { toMs, MS_PER_DAY } = require('../../lib/scoring/availability');

const ALTERNATIVES = 3;

/** UC-012 step 8 — "write the literature review" beats "do the report". */
function nextMilestone(task, milestones) {
  return milestones
    .filter((m) => m.taskId === task.taskId && !m.completedAt)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || toMs(a.dueAt) - toMs(b.dueAt))[0] || null;
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const nowMs = toMs(new Date());

  let context;
  try {
    context = await loadRanked(userId, nowMs);
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'focus_failed', message: error.message }));
    return fail(503, 'scoring_unavailable', 'Could not load your ranking — please retry.');
  }

  const { ranked, milestones, prefs, weights, rankOf } = context;
  const scored = ranked.filter((task) => task.subScores);

  // E2 — everything is unscoreable. Route to the "needs attention" strip
  // rather than showing an empty card.
  const unscoreable = ranked.filter((task) => task.unscoreable);
  if (scored.length === 0) {
    return ok(200, {
      emptyState: unscoreable.length > 0 ? 'needs_attention' : 'nothing_due',
      needsAttention: unscoreable.map(publicTask),
      message: unscoreable.length > 0
        ? 'Some tasks are missing a valid deadline — fix those and the ranking returns.'
        : "Nothing due — you're ahead.",
      card: null,
      alternatives: [],
    });
  }

  // Alt B — a group task waiting on someone else is not actionable. Skip it,
  // visibly, and offer the next thing the student can actually do.
  const skipped = [];
  const actionable = scored.filter((task) => {
    if (task.isGroup && task.blockedOnTeammate) {
      skipped.push({ taskId: task.taskId, title: task.title, reason: 'waiting on your group' });
      return false;
    }
    return true;
  });

  // Alt A — everything actionable is done or blocked.
  if (actionable.length === 0) {
    const next = scored[0];
    return ok(200, {
      emptyState: 'nothing_actionable',
      message: skipped.length > 0
        ? "Nothing you can act on alone — you're waiting on your group."
        : "Nothing due — you're ahead.",
      skipped,
      nextStartBy: next
        ? new Date(toMs(next.dueAt) - (Number(next.prepDays) || 0) * MS_PER_DAY).toISOString()
        : null,
      card: null,
      alternatives: [],
    });
  }

  const top = actionable[0];
  const explanation = await explainTask(
    top, scored, prefs, weights, nowMs, rankOf(top), { templateOnly: true },
  );

  const alternatives = await Promise.all(actionable.slice(1, 1 + ALTERNATIVES).map(async (task) => {
    const reason = reasonRankedLower(top, task, weights, nowMs);
    const alt = await explainTask(
      task, scored, prefs, weights, nowMs, rankOf(task), { templateOnly: true },
    );
    return {
      task: publicTask(task),
      milestone: nextMilestone(task, milestones),
      explanation: alt.text,
      explanationSource: alt.source,
      contributions: alt.contributions,
      figures: alt.payload.figures,
      rank: rankOf(task),
      rankedLowerBecause: reason.text,
    };
  }));

  return ok(200, {
    card: {
      task: publicTask(top),
      milestone: nextMilestone(top, milestones),
      explanation: explanation.text,
      explanationSource: explanation.source,
      subScores: top.subScores,
      contributions: explanation.contributions,
      figures: explanation.payload.figures,
      rank: rankOf(top),
      tight: top.tight === true,
    },
    skipped,
    alternatives,
  });
};
