/**
 * UC-006 — deadline extraction from an uploaded assignment brief.
 *
 * The file goes browser → S3 on a presigned PUT and never touches Lambda;
 * the text is pulled out client-side (pdfjs-dist / mammoth) and only the
 * text reaches /api/briefs/extract. The review screen shows every extracted
 * value NEXT TO the wording it came from, and nothing is written until the
 * student confirms.
 */

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useTasks } from '../context/TasksContext';
import { extractText, SUPPORTED_TYPES, MAX_BYTES } from '../lib/extractText';
import type { ParsedPrefill } from './AddTaskDialog';

const TYPES = ['assignment', 'test', 'project', 'presentation'];
const AMBER_BELOW = 0.7;
const MIN_TEXT_CHARS = 50;

const fieldClass = 'mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-sm text-ink';
const amberFieldClass = 'mt-1 w-full rounded-lg border border-warning bg-plane px-3 py-2 text-sm text-ink';

function toLocalInput(iso: string | null): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "IT2214_Assignment_Brief.pdf" → "IT2214 Assignment Brief" */
function titleFromFilename(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200);
}

export default function BriefUploadDialog({
  onClose, onFallbackForm,
}: {
  onClose: () => void;
  /** E2 — unreadable file: the full form, prefilled, so this is never a dead end. */
  onFallbackForm: (prefill: ParsedPrefill) => void;
}) {
  const navigate = useNavigate();
  const { refresh } = useTasks();

  const [stage, setStage] = useState<'pick' | 'working' | 'review'>('pick');
  const [step, setStep] = useState('');                 // what "working" is doing
  const [problem, setProblem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [s3Key, setS3Key] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any>(null); // the /briefs/extract response
  const [title, setTitle] = useState('');
  const [type, setType] = useState('assignment');
  const [dueAt, setDueAt] = useState('');
  const [gradeWeight, setGradeWeight] = useState('');
  const [busy, setBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // E3 — no date found: the deadline is the one thing the student must supply.
  useEffect(() => {
    if (stage === 'review' && !dueAt) dueRef.current?.focus();
  }, [stage, dueAt]);

  async function handleFile(file: File) {
    setProblem(null);

    // E1 — rejected client-side; no S3 write occurs.
    if (!SUPPORTED_TYPES[file.type] || file.size > MAX_BYTES) {
      setProblem('Please upload a PDF, Word document or image under 5 MB.');
      return;
    }

    setStage('working');
    try {
      // Step 2 — presign, then straight to S3. One retry on the PUT (E4).
      setStep('Uploading…');
      const presign = await api.post('/api/briefs/presign', {
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      const { uploadUrl, s3Key: key } = presign.data;

      const put = () => fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      }).then((r) => { if (!r.ok) throw new Error(`upload ${r.status}`); });
      try {
        await put();
      } catch {
        await put(); // E4 — retry once
      }
      setS3Key(key);

      // Step 3 — text, in the browser. Images and unreadable files → E2.
      setStep('Reading the document…');
      const text = await extractText(file);
      if (!text || text.trim().length < MIN_TEXT_CHARS) {
        onFallbackForm({
          title: titleFromFilename(file.name),
          source: 'brief',
          s3Key: key,
          notice: 'I couldn’t read this document — the file is saved, but please enter the details yourself.',
        });
        onClose();
        return;
      }

      // Steps 4–5 — the model (or the regex fallback) proposes fields.
      setStep('Finding the deadline…');
      const response = await api.post('/api/briefs/extract', {
        s3Key: key,
        extractedText: text,
      });
      const data = response.data;

      setExtracted(data);
      setTitle(data.fields.title || titleFromFilename(file.name));
      setDueAt(toLocalInput(data.fields.dueAt));
      setGradeWeight(data.fields.gradeWeight == null ? '' : String(data.fields.gradeWeight));
      setStage('review');
    } catch (error: any) {
      if (String(error?.message || '').startsWith('upload')) {
        // E4, twice — offer the quick-add bar as the alternative route.
        setProblem('The upload could not complete — try again, or use the quick-add bar instead.');
      } else {
        setProblem(errorMessage(error, 'Something went wrong reading this brief — please try again.'));
      }
      setStage('pick');
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // Steps 7–9 — confirm: create with source 'brief', keep the S3 key, and
  // carry the deliverables into UC-012 as pre-seeded milestone suggestions.
  async function confirm() {
    if (!dueAt || !title.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await api.post('/api/tasks', {
        title: title.trim(),
        type,
        dueAt: new Date(dueAt).toISOString(),
        ...(gradeWeight === '' ? {} : { gradeWeight: Number(gradeWeight) }),
        source: 'brief',
        ...(s3Key ? { s3Key } : {}),
        createAnyway: true,   // the review screen IS the confirmation step
      });
      refresh();
      onClose();
      navigate(`/tasks/${response.data.task.taskId}`, {
        state: { deliverables: extracted?.deliverables || [] },
      });
    } catch (error) {
      setProblem(errorMessage(error, 'Task could not be saved — please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const amber = (field: string) => Boolean(
    extracted?.confidence
    && (extracted.confidence[field] === undefined || extracted.confidence[field] < AMBER_BELOW),
  );
  const snippet = (field: string) => extracted?.sources?.[field];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload an assignment brief"
        className="rise w-full max-w-2xl rounded-card border border-hairline bg-surface p-5 shadow-card sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Upload a brief</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>

        {stage === 'pick' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`mt-4 rounded-card border-2 border-dashed p-8 text-center transition ${
                dragOver ? 'border-ink bg-plane' : 'border-hairline'
              }`}
            >
              <p className="text-sm text-ink">Drag the assignment brief here</p>
              <p className="mt-1 text-xs text-muted">PDF, Word document or image, up to 5 MB</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-4 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink2 hover:text-ink"
              >
                Choose a file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
            {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}
            <p className="mt-3 text-xs text-muted">
              The file is read in your browser — only its text is sent for extraction, and every
              value is shown next to the wording it came from before anything is saved.
            </p>
          </>
        )}

        {stage === 'working' && (
          <p className="mt-6 pb-2 text-sm text-muted" role="status">{step}</p>
        )}

        {stage === 'review' && extracted && (
          <>
            {extracted.degraded && (
              <p className="mt-3 rounded-lg bg-warntint px-3 py-2 text-xs text-warntext">
                Smart extraction unavailable — these fields were found without the model, so check
                each one against the brief.
              </p>
            )}
            {!extracted.fields?.dueAt && !dueAt && (
              <p className="mt-3 text-sm text-ink2">
                No deadline was found in the document — enter it below.
              </p>
            )}

            {/* Step 6 — value on the left, the wording it came from on the right. */}
            <div className="mt-4 space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted">Title</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={amber('title') ? amberFieldClass : fieldClass}
                    maxLength={200}
                  />
                </label>
                {snippet('title') && (
                  <blockquote className="border-l-2 border-hairline pl-3 text-xs italic leading-relaxed text-muted sm:mt-5">
                    “{snippet('title')}”
                  </blockquote>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted">Deadline</span>
                  <input
                    ref={dueRef}
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className={amber('dueAt') || !dueAt ? amberFieldClass : fieldClass}
                  />
                </label>
                {snippet('dueAt') && (
                  <blockquote className="border-l-2 border-hairline pl-3 text-xs italic leading-relaxed text-muted sm:mt-5">
                    “{snippet('dueAt')}”
                  </blockquote>
                )}
              </div>

              {/* Alt B — every other date seen, with its sentence; the student
                  picks, the system never silently takes the first one. */}
              {extracted.otherDates?.length > 0 && (
                <div>
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted">
                    Other dates in the document — is one of these the deadline?
                  </span>
                  <ul className="mt-1 space-y-1">
                    {extracted.otherDates.map((other: any) => (
                      <li key={`${other.value}-${other.source}`}>
                        <button
                          type="button"
                          onClick={() => setDueAt(toLocalInput(other.value))}
                          className="w-full rounded-lg border border-hairline px-3 py-2 text-left text-xs text-ink2 transition hover:border-ink hover:text-ink"
                        >
                          <span className="num font-medium text-ink">
                            {Number.isFinite(Date.parse(other.value))
                              ? new Date(other.value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                              : other.value}
                          </span>
                          {other.source && <span className="ml-2 italic">“{other.source}”</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium uppercase tracking-wide text-muted">Weight %</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={gradeWeight}
                      onChange={(e) => setGradeWeight(e.target.value)}
                      className={amber('gradeWeight') ? amberFieldClass : fieldClass}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium uppercase tracking-wide text-muted">Type</span>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
                {snippet('gradeWeight') && (
                  <blockquote className="border-l-2 border-hairline pl-3 text-xs italic leading-relaxed text-muted sm:mt-5">
                    “{snippet('gradeWeight')}”
                  </blockquote>
                )}
              </div>

              {/* Step 9 — carried into UC-012, not discarded. */}
              {extracted.deliverables?.length > 0 && (
                <div className="rounded-lg border border-hairline bg-plane p-3">
                  <span className="block text-xs font-medium uppercase tracking-wide text-muted">
                    Deliverables found — offered as milestones after you save
                  </span>
                  <ul className="mt-1 list-inside list-disc text-xs text-ink2">
                    {extracted.deliverables.map((item: string) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy || !dueAt || !title.trim()}
                onClick={confirm}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Add task'}
              </button>
              <button
                type="button"
                onClick={() => { setStage('pick'); setExtracted(null); }}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink2"
              >
                Different file
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
