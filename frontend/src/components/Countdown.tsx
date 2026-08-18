/**
 * UC-016 step 4 and E3 — the countdown, in the brief's own wording, that keeps
 * ticking.
 *
 * A countdown that only renders once is a countdown that lies: a row that
 * crosses its deadline while the page is open has to transition into the
 * overdue state without a reload. One interval per mounted countdown at a
 * minute's resolution is cheap enough not to matter and is what makes the
 * transition happen on stage rather than after a refresh.
 */

import { useEffect, useState } from 'react';
import { listCountdown, countdownText } from '../lib/countdown';

/** A clock the whole tree can share. `every` in milliseconds. */
export function useNow(every = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

export default function Countdown({
  type, dueAt, status, precise = false, className = '',
}: {
  type?: string;
  dueAt: string;
  status?: string;
  precise?: boolean;
  className?: string;
}) {
  const now = useNow(precise ? 1000 : 30000);
  const passed = Date.parse(dueAt) <= now;

  // Crossing zero flips the styling here, immediately; the status field itself
  // is corrected by the next hourly run (UC-021 step 1).
  const tone = status === 'overdue' || passed ? 'text-crittext' : 'text-muted';

  return (
    <span className={`${tone} ${className}`}>
      {precise ? countdownText(dueAt, now) : listCountdown(type || 'task', dueAt, now)}
    </span>
  );
}
