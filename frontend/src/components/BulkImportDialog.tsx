/**
 * UC-007 — bulk paste import.
 *
 * Paste an assessment schedule → POST /api/parse/bulk → the review table:
 * one row per detected task, every cell editable, a tick box per row,
 * low-confidence cells amber, likely duplicates pre-unticked (Alt B).
 * Nothing is imported without the student seeing it in this table first.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorCode, errorMessage } from '../lib/api';
import { useTasks } from '../context/TasksContext';

const TYPES = ['assignment', 'test', 'project', 'presentation'];
const AMBER_BELOW = 0.7;

const cellClass = 'w-full rounded-md border border-hairline bg-plane px-2 py-1 text-xs text-ink';
const amberCellClass = 'w-full rounded-md border border-warning bg-warntint px-2 py-1 text-xs text-ink';

/** ISO ↔ the datetime-local input, in the student's own clock. */
function toLocalInput(iso: string | null): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Row = {
  rowId: string;
  raw: string;
  ticked: boolean;
  duplicate: boolean;
  confidence: Record<string, number>;
  failed?: boolean;
  title: string;
  module: string;
  type: string;
  dueAt: string;          // datetime-local format while being edited
  gradeWeight: string;
  effortHours: string;
  isGroup: boolean;
};

export default function BulkImportDialog({
  onClose, seedText = '',
}: {
  onClose: () => void;
  seedText?: string;
}) {
  const { refresh } = useTasks();

  const [stage, setStage] = useState<'paste' | 'review' | 'done'>('paste');
  const [text, setText] = useState(seedText);
  const [rows, setRows] = useState<Row[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [summary, setSummary] = useState<{ saved: number; attempted: number } | null>(null);
  const [crashWeek, setCrashWeek] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Arriving from the quick-add bar's Alt C hand-off, the text is already
  // here — parse it straight away rather than showing it back for a re-click.
  useEffect(() => {
    if (seedText.trim()) parse(seedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function parse(raw: string) {
    if (!raw.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await api.post('/api/parse/bulk', { text: raw });
      setRows((response.data.rows || []).map((row: any): Row => ({
        rowId: row.rowId,
        raw: row.raw,
        ticked: row.ticked,
        duplicate: Boolean(row.duplicate),
        confidence: row.confidence || {},
        title: row.fields.title || '',
        module: row.fields.module || '',
        type: TYPES.includes(row.fields.type) ? row.fields.type : 'assignment',
        dueAt: toLocalInput(row.fields.dueAt),
        gradeWeight: row.fields.gradeWeight == null ? '' : String(row.fields.gradeWeight),
        effortHours: row.fields.effortHours == null ? '' : String(row.fields.effortHours),
        isGroup: Boolean(row.fields.isGroup),
      })));
      setUnparsed(response.data.unparsed || []);
      setTruncated(Boolean(response.data.truncated));
      setDegraded(Boolean((response.data.rows || [])[0]?.degraded));
      setStage('review');
    } catch (error) {
      setProblem(errorCode(error) === 'unparseable'
        ? errorMessage(error)
        : errorMessage(error, 'Could not read that text — please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function update(rowId: string, changes: Partial<Row>) {
    setRows((current) => current.map((row) => (
      row.rowId === rowId ? { ...row, ...changes, failed: false } : row
    )));
  }

  const ticked = useMemo(() => rows.filter((row) => row.ticked && row.dueAt), [rows]);

  async function doImport() {
    if (ticked.length === 0 || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await api.post('/api/parse/bulk/import', {
        rows: ticked.map((row) => ({
          title: row.title.trim() || row.raw.slice(0, 80),
          module: row.module.trim() || null,
          type: row.type,
          dueAt: new Date(row.dueAt).toISOString(),
          gradeWeight: row.gradeWeight === '' ? null : Number(row.gradeWeight),
          effortHours: row.effortHours === '' ? null : Number(row.effortHours),
          isGroup: row.isGroup,
        })),
      });

      refresh();
      const { savedCount, attemptedCount, failed } = response.data;
      setSummary({ saved: savedCount, attempted: attemptedCount });

      // E2 — partial failure: the failed rows stay in the table, flagged.
      if (failed?.length) {
        const failedTitles = new Set(failed.map((item: any) => item.title));
        setRows((current) => current
          .filter((row) => !row.ticked || failedTitles.has(row.title.trim() || row.raw.slice(0, 80)))
          .map((row) => (row.ticked ? { ...row, failed: true } : row)));
        setProblem(`${savedCount} of ${attemptedCount} saved — the rows below were not. Retry them.`);
        return;
      }

      // Step 7 — did this paste just overload a week? Say so, with the link.
      try {
        const crash = await api.get('/api/workload/crash-weeks');
        const worst = (crash.data.crashWeeks || [])[0];
        if (worst?.weekStart) {
          setCrashWeek(new Date(worst.weekStart).toLocaleDateString(undefined, {
            day: 'numeric', month: 'short',
          }));
        }
      } catch { /* informational only */ }
      setStage('done');
    } catch (error) {
      setProblem(errorMessage(error, 'Could not save these tasks — please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk import deadlines"
        className="rise w-full max-w-3xl rounded-card border border-hairline bg-surface p-5 shadow-card sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Bulk import</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        {stage === 'paste' && (
          <>
            <p className="mt-1 text-sm text-muted">
              Paste an assessment schedule, a lecture slide, or a group-chat message — one deadline
              per line works best.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              autoFocus
              maxLength={8000}
              placeholder={'IT2214 Database Report — 22 Aug, 30%\nIT2213 Networking Test — 25 Aug\n…'}
              className="mt-3 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-sm text-ink"
            />
            {problem && <p className="mt-2 text-sm text-crittext">{problem}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => parse(text)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy ? 'Reading…' : 'Read these'}
              </button>
            </div>
          </>
        )}

        {stage === 'review' && (
          <>
            {degraded && (
              <p className="mt-3 rounded-lg bg-warntint px-3 py-2 text-xs text-warntext">
                Smart parsing unavailable — dates were read without the model, so check each one
                before importing.
              </p>
            )}
            {truncated && (
              <p className="mt-2 text-xs text-muted">
                Showing the first 20 — import these, then paste the rest.
              </p>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2 pr-2" aria-label="Import row" />
                    <th className="py-2 pr-2">Title</th>
                    <th className="py-2 pr-2">Module</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Deadline</th>
                    <th className="py-2 pr-2">Weight %</th>
                    <th className="py-2">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((row) => {
                    const amber = (field: string) => (
                      row.confidence[field] !== undefined && row.confidence[field] < AMBER_BELOW
                    );
                    return (
                      <tr key={row.rowId} className={row.ticked ? '' : 'opacity-50'}>
                        <td className="py-2 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={row.ticked}
                            onChange={(e) => update(row.rowId, { ticked: e.target.checked })}
                            aria-label={`Import ${row.title || row.raw}`}
                          />
                        </td>
                        <td className="min-w-40 py-2 pr-2 align-top">
                          <input
                            value={row.title}
                            onChange={(e) => update(row.rowId, { title: e.target.value })}
                            className={amber('title') ? amberCellClass : cellClass}
                          />
                          {row.duplicate && (
                            <span className="mt-0.5 inline-block rounded-full bg-warntint px-1.5 py-0.5 text-[10px] font-medium text-warntext">
                              possible duplicate
                            </span>
                          )}
                          {row.failed && (
                            <span className="mt-0.5 inline-block rounded-full bg-crittint px-1.5 py-0.5 text-[10px] font-medium text-crittext">
                              not saved — retry
                            </span>
                          )}
                        </td>
                        <td className="w-24 py-2 pr-2 align-top">
                          <input
                            value={row.module}
                            onChange={(e) => update(row.rowId, { module: e.target.value.toUpperCase() })}
                            className={amber('module') ? amberCellClass : cellClass}
                          />
                        </td>
                        <td className="w-28 py-2 pr-2 align-top">
                          <select
                            value={row.type}
                            onChange={(e) => update(row.rowId, { type: e.target.value })}
                            className={cellClass}
                          >
                            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </td>
                        <td className="w-44 py-2 pr-2 align-top">
                          <input
                            type="datetime-local"
                            value={row.dueAt}
                            onChange={(e) => update(row.rowId, { dueAt: e.target.value })}
                            className={amber('dueAt') || !row.dueAt ? amberCellClass : cellClass}
                          />
                        </td>
                        <td className="w-16 py-2 pr-2 align-top">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.gradeWeight}
                            onChange={(e) => update(row.rowId, { gradeWeight: e.target.value })}
                            className={amber('gradeWeight') ? amberCellClass : cellClass}
                          />
                        </td>
                        <td className="w-16 py-2 align-top">
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={row.effortHours}
                            onChange={(e) => update(row.rowId, { effortHours: e.target.value })}
                            className={amber('effortHours') ? amberCellClass : cellClass}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Alt A — kept verbatim so they can be typed into the form. */}
            {unparsed.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  Couldn’t read these
                </h3>
                <ul className="mt-1 space-y-0.5 text-xs text-ink2">
                  {unparsed.map((line) => <li key={line} className="break-words">{line}</li>)}
                </ul>
              </div>
            )}

            {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || ticked.length === 0}
                onClick={doImport}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy ? 'Importing…' : `Import ${ticked.length} task${ticked.length === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                onClick={() => setStage('paste')}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink2"
              >
                Back
              </button>
              {ticked.length === 0 && (
                <span className="text-xs text-muted">Tick at least one row with a deadline.</span>
              )}
            </div>
          </>
        )}

        {stage === 'done' && summary && (
          <>
            <p className="mt-3 text-sm text-ink">
              <span className="num font-semibold">{summary.saved}</span>
              {' '}of{' '}
              <span className="num">{summary.attempted}</span>
              {' '}task{summary.attempted === 1 ? '' : 's'} added and ranked.
            </p>
            {crashWeek && (
              <p className="mt-2 rounded-lg bg-warntint px-3 py-2 text-sm text-warntext">
                Your workload for the week of {crashWeek} is now over capacity.{' '}
                <Link to="/workload" onClick={onClose} className="font-medium underline underline-offset-2">
                  See the plan
                </Link>
              </p>
            )}
            <div className="mt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-plane"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
