/**
 * UC-015 step 4 — the live preview.
 *
 * 🔴 This arithmetic must stay byte-identical to `backend/lib/scoring/index.js`:
 * each contribution is rounded to one decimal, then summed. Any drift here and
 * the preview would promise an order the server does not produce, which would
 * discredit the one claim the product is built on.
 *
 * No network call. No model call. Just the persisted sub-scores.
 */

export const SUBSCORE_ORDER = [
  'urgency', 'stakes', 'effortPressure', 'progressDeficit', 'clashPenalty',
] as const;

export type SubScoreKey = typeof SUBSCORE_ORDER[number];
export type Weights = Record<SubScoreKey, number>;
export type SubScores = Record<SubScoreKey, number>;

export const DEFAULT_WEIGHTS: Weights = {
  urgency: 0.30,
  stakes: 0.25,
  effortPressure: 0.20,
  progressDeficit: 0.15,
  clashPenalty: 0.10,
};

/** UC-015 step 6 — one click each. */
export const PRESETS: Record<string, Weights> = {
  Balanced: DEFAULT_WEIGHTS,
  'Grade-focused': {
    urgency: 0.20, stakes: 0.45, effortPressure: 0.15, progressDeficit: 0.10, clashPenalty: 0.10,
  },
  'Deadline-focused': {
    urgency: 0.50, stakes: 0.20, effortPressure: 0.15, progressDeficit: 0.05, clashPenalty: 0.10,
  },
  'Anti-procrastination': {
    urgency: 0.20, stakes: 0.15, effortPressure: 0.20, progressDeficit: 0.40, clashPenalty: 0.05,
  },
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Normalised to sum exactly 1.0, exactly as the server does on write. */
export function normaliseWeights(weights: Partial<Weights> | undefined): Weights {
  if (!weights) return { ...DEFAULT_WEIGHTS };

  const raw = {} as Weights;
  let sum = 0;
  for (const key of SUBSCORE_ORDER) {
    const value = Number(weights[key]);
    raw[key] = Number.isFinite(value) && value > 0 ? value : 0;
    sum += raw[key];
  }
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };

  for (const key of SUBSCORE_ORDER) raw[key] = raw[key] / sum;
  return raw;
}

export function contributionsOf(subScores: SubScores, weights: Weights) {
  return SUBSCORE_ORDER.map((key) => ({
    key,
    value: round1(subScores?.[key] ?? 0),
    weighted: round1((subScores?.[key] ?? 0) * (weights[key] ?? 0)),
  }));
}

/** The five bars, added up — the number on the badge. */
export function priorityOf(subScores: SubScores, weights: Weights): number {
  return round1(contributionsOf(subScores, weights).reduce((sum, c) => sum + c.weighted, 0));
}

type Rankable = {
  taskId: string;
  subScores?: SubScores | null;
  dueAt?: string;
  gradeWeight?: number | null;
};

/** Server tie-break order: score → dueAt → gradeWeight → taskId (HLD §7.3). */
export function rankWith<T extends Rankable>(tasks: T[], weights: Weights) {
  return tasks
    .filter((task) => task.subScores)
    .map((task) => ({ ...task, previewScore: priorityOf(task.subScores as SubScores, weights) }))
    .sort((a, b) => (b.previewScore - a.previewScore)
      || (Date.parse(a.dueAt || '') - Date.parse(b.dueAt || ''))
      || ((Number(b.gradeWeight) || 0) - (Number(a.gradeWeight) || 0))
      || a.taskId.localeCompare(b.taskId));
}

/** UC-015 Alt B — did that drag actually change anything? */
export function sameOrder(a: { taskId: string }[], b: { taskId: string }[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry.taskId === b[i].taskId);
}
