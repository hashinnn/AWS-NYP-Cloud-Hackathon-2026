'use strict';

/**
 * GET /api/export/ics?scope=all|module|range&includeMilestones= — UC-023 [Z-09].
 *
 * Returns `text/calendar`, not JSON, so the browser downloads a file the
 * student can hand straight to Google, Apple or Outlook. E2's CSV fallback is
 * the same request with `format=csv`, offered by the UI when generation fails,
 * so nobody is ever left without a way to get their data out.
 */

const { fail, corsHeaders } = require('../../lib/http');
const { getAllForUser, extractTasks } = require('../../lib/dynamo/tasks');
const { extractMilestones } = require('../../lib/dynamo/milestones');
const { extractPrefs, scoringPrefs } = require('../../lib/dynamo/prefs');
const { selectForExport } = require('../../lib/export/scope');
const { buildIcs, buildCsv } = require('../../lib/export/ics');

function fileResponse(body, contentType, filename) {
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body,
  };
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.userId;
  const query = event.queryStringParameters || {};
  const now = new Date().toISOString();

  try {
    const items = await getAllForUser(userId);
    const prefs = scoringPrefs(items, extractPrefs(items));
    const { tasks, milestones } = selectForExport(
      extractTasks(items),
      extractMilestones(items),
      query,
    );

    // E1 — the button is disabled client-side for an empty scope; this is the
    // same answer for anyone who calls the API directly.
    if (tasks.length === 0) {
      return fail(404, 'not_found', 'Nothing to export for this selection.');
    }

    if (query.format === 'csv') {
      return fileResponse(buildCsv(tasks), 'text/csv; charset=utf-8', 'deadlineiq.csv');
    }

    const calendar = buildIcs(tasks, milestones, { leadTimes: prefs.leadTimes, now });
    return fileResponse(calendar, 'text/calendar; charset=utf-8', 'deadlineiq.ics');
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR', event: 'ics_export_failed', message: error.message,
    }));
    // E2 — the client re-requests with format=csv rather than showing a
    // dead end.
    return fail(503, 'storage_unavailable', 'Calendar export failed — try the CSV export instead.');
  }
};
