/**
 * A module's identity: its colour as a mark, its code in ink.
 *
 * Never white text on the module colour — three of the eight palette hues sit
 * below 3:1 on a light surface, so the label would be unreadable for exactly
 * the students the palette was chosen to protect.
 */

import { moduleColour } from '../lib/chartTheme';

export default function ModuleChip({ code, size = 'md' }: { code?: string | null; size?: 'sm' | 'md' }) {
  if (!code) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface font-medium text-ink2 ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: moduleColour(code) }}
        aria-hidden="true"
      />
      {code}
    </span>
  );
}
