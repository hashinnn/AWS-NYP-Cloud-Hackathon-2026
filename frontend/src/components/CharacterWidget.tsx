/**
 * The companion, bottom-right, on every screen.
 *
 * It speaks only when it has something specific to say, and every line is
 * built from figures the student can go and check — the same rule the UC-010
 * explanations follow. No model is involved; these are templates over numbers.
 *
 * Dismissable, and it stays dismissed. A study aid that cannot be turned off
 * is a distraction, and the one place that matters most is Focus Mode.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useTasks } from '../context/TasksContext';
import Character, { type Mood } from './Character';

const HIDDEN_KEY = 'deadlineiq.companion.hidden';

const TONE: Record<Mood, string> = {
  happy: 'border-good/40 bg-goodtint',
  neutral: 'border-hairline bg-surface',
  worried: 'border-warning/40 bg-warntint',
  sad: 'border-serious/40 bg-warntint',
  tired: 'border-hairline bg-surface',
};

export default function CharacterWidget() {
  const { ranking } = useTasks();
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1');

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/character');
      setData(response.data);
    } catch {
      setData(null);   // never block a screen because the pet is unavailable
    }
  }, []);

  // Re-reads whenever the ranking changes, so logging progress or finishing a
  // task updates the mood without a refresh.
  useEffect(() => { load(); }, [load, ranking]);

  if (hidden || !data) return null;

  const mood: Mood = data.mood?.state || 'neutral';
  const { character, points } = data;

  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div className={`rise max-w-[16rem] rounded-card border p-3 shadow-card ${TONE[mood]}`}>
          <p className="text-sm font-medium leading-snug text-ink">{data.mood?.headline}</p>
          {data.mood?.detail && (
            <p className="mt-1 text-xs leading-snug text-ink2">{data.mood.detail}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs">
            <Link to="/profile" className="num font-medium text-ink underline underline-offset-2">
              {points?.balance ?? 0} pts
            </Link>
            <button
              type="button"
              onClick={() => { setHidden(true); localStorage.setItem(HIDDEN_KEY, '1'); }}
              className="ml-auto text-muted underline underline-offset-2"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Hide what your companion is saying' : 'Show what your companion is saying'}
        className="grid size-20 place-items-center rounded-full border border-hairline bg-surface shadow-card transition hover:-translate-y-0.5"
      >
        <Character species={character?.species} mood={mood} equipped={character?.equipped || {}} size={58} />
      </button>
    </div>
  );
}
