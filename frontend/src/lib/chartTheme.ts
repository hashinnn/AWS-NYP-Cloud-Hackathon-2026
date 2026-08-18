/**
 * Shared chart + colour theme — [H-02]. Owned by Hasini.
 *
 * Imported by UC-016 (dashboard), UC-017 (calendar/timeline) and UC-018
 * (heatmap). **Never hard-code a chart colour anywhere else.**
 *
 * Two validated palettes live here. The light steps clear every colour-blind
 * and separation gate on a white surface (worst adjacent ΔE 9.1 protan, worst
 * normal-vision 19.6); the dark steps are re-stepped for #1a1a19 and clear the
 * same gates plus 3:1 contrast. Dark is a *selected* palette, never an inverted
 * one.
 *
 * Anything rendered in the DOM should use the `var(--color-…)` accessors below
 * so it swaps with the theme for free. Chart.js paints to canvas and cannot use
 * CSS variables, so it reads resolved values through `chartTokens()`.
 */

import { readToken } from './theme';

/** The documented source of truth. The CSS variables mirror these exactly. */
export const PALETTE = {
  light: {
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    plane: '#f9f9f7',
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#6e6c65', // darkened from the reference step to clear 4.5:1 as text
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    plane: '#0d0d0d',
    surface: '#1a1a19',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
} as const;

/** Status palette — reserved, identical in both modes, never a series colour. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export const SLOT_COUNT = PALETTE.light.series.length;

/**
 * UC-009's five factors, assigned to categorical slots 1–5 in fixed order.
 * Never cycled, never reassigned by rank — the colour follows the factor.
 */
export const SUBSCORE_SLOT: Record<string, number> = {
  urgency: 1,
  stakes: 2,
  effortPressure: 3,
  progressDeficit: 4,
  clashPenalty: 5,
};

export const SUBSCORE_COLOURS: Record<string, string> = Object.fromEntries(
  Object.entries(SUBSCORE_SLOT).map(([key, slot]) => [key, `var(--color-series-${slot})`]),
);

export const SUBSCORE_LABELS: Record<string, string> = {
  urgency: 'Urgency',
  stakes: 'Stakes',
  effortPressure: 'Effort Pressure',
  progressDeficit: 'Progress Deficit',
  clashPenalty: 'Clash Penalty',
};

export const SUBSCORE_ORDER = [
  'urgency', 'stakes', 'effortPressure', 'progressDeficit', 'clashPenalty',
] as const;

export type SubScoreKey = typeof SUBSCORE_ORDER[number];

/** UC-018 step 2 — the four load bands, plus the blocked-week case. */
export const LOAD_BANDS = {
  light: { fill: 'var(--color-band-light)', edge: STATUS.good, label: 'under half' },
  moderate: { fill: 'var(--color-band-moderate)', edge: 'var(--color-rule)', label: 'steady' },
  busy: { fill: 'var(--color-band-busy)', edge: STATUS.warning, label: 'busy' },
  crash: { fill: 'var(--color-band-crash)', edge: STATUS.critical, label: 'over capacity' },
  unavailable: { fill: 'var(--color-band-unavailable)', edge: 'var(--color-rule)', label: 'unavailable' },
} as const;

export type LoadBand = keyof typeof LOAD_BANDS;

/**
 * Colours the student chose in Setup (UC-004 step 2), by module code.
 *
 * Registered once when the module list loads, rather than threaded through
 * every call site, so `ModuleChip`, the calendar and the charts keep asking
 * for a colour with nothing but a code — which is what makes it impossible
 * for two views to disagree about a module's colour.
 *
 * A stored value is a PALETTE hex, but it is resolved back to a *slot* so the
 * rendered colour is still a CSS variable. Emitting the stored hex directly
 * would freeze the module to its light-theme colour in dark mode.
 */
const chosenSlots = new Map<string, number>();

export function registerModuleColours(modules: { code: string; colour?: string | null }[]) {
  chosenSlots.clear();
  for (const { code, colour } of modules || []) {
    const slot = PALETTE.light.series.indexOf(colour as never);
    if (code && slot >= 0) chosenSlots.set(code, slot + 1);
  }
}

/**
 * Stable module colour: the same code always gets the same slot, in every
 * chart, card and calendar entry, across renders, reloads and both themes.
 * A colour the student picked wins; otherwise the code hashes to a slot.
 */
export function moduleSlot(code?: string | null): number | null {
  if (!code) return null;
  const chosen = chosenSlots.get(code);
  if (chosen) return chosen;

  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return (hash % SLOT_COUNT) + 1;
}

/** A CSS value — swaps with the theme without any JavaScript. */
export function moduleColour(code?: string | null): string {
  const slot = moduleSlot(code);
  return slot ? `var(--color-series-${slot})` : 'var(--color-muted)';
}

/** The resolved hex, for canvas. */
export function moduleColourResolved(code?: string | null): string {
  const slot = moduleSlot(code);
  return slot ? readToken(`--color-series-${slot}`, PALETTE.light.series[slot - 1]) : '#898781';
}

/** UC-018 step 2 — which band a week's load ratio falls into. */
export function loadBand(loadRatio: number | null, unavailable = false): LoadBand {
  if (unavailable || loadRatio === null) return 'unavailable'; // E1: hatch it
  if (loadRatio > 1) return 'crash';
  if (loadRatio >= 0.8) return 'busy';
  if (loadRatio > 0.5) return 'moderate';
  return 'light';
}

/** UC-016 — the capacity bar: amber above 80%, red above 100%. */
export function capacityColour(ratio: number): string {
  if (ratio > 1) return STATUS.critical;
  if (ratio >= 0.8) return STATUS.warning;
  return STATUS.good;
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Chart.js defaults, resolved against whichever theme is live. Call this on
 * render (and again on `themechange`) — canvas cannot read CSS variables.
 */
export function chartTokens() {
  return {
    ink: readToken('--color-ink', PALETTE.light.ink),
    ink2: readToken('--color-ink2', PALETTE.light.ink2),
    muted: readToken('--color-muted', PALETTE.light.muted),
    grid: readToken('--color-hairline', PALETTE.light.grid),
    axis: readToken('--color-rule', PALETTE.light.axis),
    surface: readToken('--color-surface', PALETTE.light.surface),
    series: (slot: number) => readToken(`--color-series-${slot}`, PALETTE.light.series[slot - 1]),
  };
}

export function chartDefaults() {
  const t = chartTokens();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 220 },
    interaction: { mode: 'index' as const, intersect: false },
    elements: {
      line: { borderWidth: 2, tension: 0.3 },
      point: { radius: 0, hoverRadius: 5, hitRadius: 12 },
    },
    plugins: {
      legend: {
        align: 'end' as const,
        labels: {
          color: t.ink2,
          font: { family: FONT_STACK, size: 12 },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle' as const,
        },
      },
      tooltip: {
        backgroundColor: t.ink,
        titleColor: t.surface,
        bodyColor: t.surface,
        titleFont: { family: FONT_STACK, size: 12, weight: 600 as const },
        bodyFont: { family: FONT_STACK, size: 12 },
        padding: 10,
        cornerRadius: 8,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: t.muted, font: { family: FONT_STACK, size: 11 }, maxRotation: 0 },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: t.grid, drawTicks: false },
        ticks: { color: t.muted, font: { family: FONT_STACK, size: 11 }, padding: 8 },
      },
    },
  };
}
