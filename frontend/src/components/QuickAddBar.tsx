/**
 * UC-005 — the always-visible quick-add bar.
 *
 * Types "db report due next friday 11:59pm, 30% of IT2214, about 9 hours"
 * → POST /api/parse → the confirmation card (AddTaskDialog with the parsed
 * prefill). Nothing is ever written without the student confirming — this
 * bar only produces proposals.
 *
 * The parse endpoint itself owns the fallback (Alt B): with the model down
 * it answers from chrono-node + regex and flags `degraded`, so this
 * component has exactly one code path.
 */

import { useRef, useState, type FormEvent } from 'react';
import { api, errorCode, errorMessage } from '../lib/api';
import type { ParsedPrefill } from './AddTaskDialog';

export default function QuickAddBar({
  onParsed, onMultiple, onUploadBrief, onBulkPaste,
}: {
  onParsed: (prefill: ParsedPrefill) => void;
  onMultiple: (text: string) => void;      // Alt C — several deadlines in one line
  onUploadBrief: () => void;               // UC-006 entry point
  onBulkPaste: () => void;                 // UC-007 entry point
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function parse(event: FormEvent) {
    event.preventDefault();
    const raw = text.trim();
    if (!raw || busy) return;

    setBusy(true);
    setProblem(null);
    try {
      const response = await api.post('/api/parse', { text: raw });
      const data = response.data;

      // Alt C — this reads like a list; the review table is the right tool.
      if (data.multipleDetected) {
        onMultiple(raw);
        setText('');
        return;
      }

      onParsed({
        ...data.fields,
        confidence: data.confidence,
        sources: data.sources,
        dueAtCandidates: data.dueAtCandidates,
        source: 'nl',
        notice: data.degraded
          ? 'Smart parsing unavailable — please check these details.'
          : undefined,
      });
      setText('');
    } catch (error) {
      // E3 — the server's message carries the worked example.
      setProblem(errorCode(error) === 'unparseable'
        ? errorMessage(error)
        : errorMessage(error, 'Could not read that — try the full form instead.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <form
        onSubmit={parse}
        className="flex items-center gap-1 rounded-xl border border-hairline bg-surface pl-3 pr-1.5 shadow-lift transition focus-within:border-rule"
      >
        {/* The spark — this box reads English, not just fields. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-muted" aria-hidden="true">
          <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.4l-1.8-5.8-5.7-1.8L10.2 9zM19 3v3m-1.5-1.5h3" />
        </svg>
        <input
          ref={inputRef}
          id="quick-add"
          value={text}
          onChange={(e) => { setText(e.target.value); setProblem(null); }}
          placeholder="Quick add — “IT2214 report due Friday 11:59pm, 30%, about 9 hours”"
          aria-label="Quick add a task in plain English"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          maxLength={2000}
        />
        {text.trim() && (
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-plane disabled:opacity-50"
          >
            {busy ? 'Reading…' : 'Parse ↵'}
          </button>
        )}
        <button
          type="button"
          onClick={onUploadBrief}
          title="Upload an assignment brief (PDF or Word)"
          aria-label="Upload an assignment brief"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-plane hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M12 15.5v-10m0 0L8.5 9M12 5.5 15.5 9M5 15.5v2A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onBulkPaste}
          title="Paste a list of deadlines"
          aria-label="Paste a list of deadlines"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-plane hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M9 4.5h6m-6 0A1.5 1.5 0 0 0 7.5 6v0A1.5 1.5 0 0 0 9 7.5h6A1.5 1.5 0 0 0 16.5 6v0A1.5 1.5 0 0 0 15 4.5m-6 0V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v.5M7 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1M8.5 12h7m-7 4h4.5" />
          </svg>
        </button>
      </form>
      {problem && (
        <p className="absolute left-0 top-full z-10 mt-1 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs text-crittext shadow-card">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Lets the dashboard's empty state put the cursor straight into the bar. */
export function focusQuickAdd() {
  const input = document.getElementById('quick-add') as HTMLInputElement | null;
  input?.focus();
}
