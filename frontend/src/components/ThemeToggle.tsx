/**
 * Light / System / Dark.
 *
 * Three states rather than a switch, because "follow my device" is a real
 * preference and a two-state toggle silently overrides it.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { applyTheme, getTheme, type ThemeChoice } from '../lib/theme';

const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: ReactElement }> = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
      </>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  },
];

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => { setChoice(getTheme()); }, []);

  function choose(value: ThemeChoice) {
    setChoice(value);
    applyTheme(value);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={choice === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => choose(option.value)}
          className={`grid size-7 place-items-center rounded-md transition ${
            choice === option.value ? 'bg-accent text-plane' : 'text-muted hover:text-ink'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            aria-hidden="true"
          >
            {option.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
