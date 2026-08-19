/**
 * GPA arithmetic — pure functions, same contract as the scoring engine:
 * deterministic, no clock, no I/O, checkable on paper.
 *
 * S/U (satisfactory/unsatisfactory) modules count toward credits earned but
 * are excluded from CGPA arithmetic entirely — they appear in neither the
 * numerator nor the denominator.
 */

export type Scale = {
  id: string;
  label: string;
  max: number;
  /** Grade → grade points, in display order. */
  grades: [string, number][];
};

export const SCALES: Scale[] = [
  {
    id: 'poly',
    label: 'Polytechnic — NYP, SP, NP, TP, RP (4.0)',
    max: 4,
    grades: [
      ['DIST', 4.0], ['A', 4.0], ['B+', 3.5], ['B', 3.0],
      ['C+', 2.5], ['C', 2.0], ['D+', 1.5], ['D', 1.0], ['F', 0.0],
    ],
  },
  {
    id: 'nus',
    label: 'NUS (5.0)',
    max: 5,
    grades: [
      ['A+', 5.0], ['A', 5.0], ['A-', 4.5], ['B+', 4.0], ['B', 3.5], ['B-', 3.0],
      ['C+', 2.5], ['C', 2.0], ['D+', 1.5], ['D', 1.0], ['F', 0.0],
    ],
  },
  {
    id: 'ntu',
    label: 'NTU (5.0)',
    max: 5,
    grades: [
      ['A+', 5.0], ['A', 5.0], ['A-', 4.5], ['B+', 4.0], ['B', 3.5], ['B-', 3.0],
      ['C+', 2.5], ['C', 2.0], ['D+', 1.5], ['D', 1.0], ['F', 0.0],
    ],
  },
];

export function scaleById(id: string): Scale {
  return SCALES.find((scale) => scale.id === id) || SCALES[0];
}

export type GpaModule = {
  name: string;
  grade: string;      // '' until chosen
  credits: number | null;
  su: boolean;
};

/** The rows that actually enter the arithmetic. */
function graded(modules: GpaModule[], scale: Scale) {
  const points = new Map(scale.grades);
  return modules
    .filter((m) => !m.su && m.grade !== '' && points.has(m.grade)
      && m.credits !== null && m.credits > 0)
    .map((m) => ({ credits: m.credits as number, points: points.get(m.grade) as number }));
}

/**
 * Mode 1 — the CGPA these expected grades would produce.
 * Returns null until at least one graded module is complete.
 */
export function projectCgpa(
  currentCgpa: number | null,
  creditsDone: number | null,
  modules: GpaModule[],
  scale: Scale,
): { cgpa: number; delta: number | null; semGpa: number; semCredits: number } | null {
  const rows = graded(modules, scale);
  if (rows.length === 0) return null;

  const semCredits = rows.reduce((sum, r) => sum + r.credits, 0);
  const semPoints = rows.reduce((sum, r) => sum + r.credits * r.points, 0);
  const semGpa = semPoints / semCredits;

  const base = (currentCgpa ?? 0) * (creditsDone ?? 0);
  const total = (creditsDone ?? 0) + semCredits;
  const cgpa = (base + semPoints) / total;

  return {
    cgpa: Math.round(cgpa * 100) / 100,
    delta: currentCgpa === null ? null : Math.round((cgpa - currentCgpa) * 100) / 100,
    semGpa: Math.round(semGpa * 100) / 100,
    semCredits,
  };
}

/**
 * Mode 2 — the semester GPA needed to land on `target`, over the graded
 * credits listed. Honest at the edges: "impossible" and "already secured"
 * are answers, never clamped away.
 */
export function gpaNeeded(
  currentCgpa: number | null,
  creditsDone: number | null,
  target: number | null,
  modules: GpaModule[],
  scale: Scale,
): { needed: number; semCredits: number; verdict: 'ok' | 'impossible' | 'secured' } | null {
  if (target === null || currentCgpa === null || creditsDone === null) return null;

  // Grade choice is irrelevant here — only which credits will be graded.
  const semCredits = modules
    .filter((m) => !m.su && m.credits !== null && m.credits > 0)
    .reduce((sum, m) => sum + (m.credits as number), 0);
  if (semCredits <= 0) return null;

  const needed = (target * (creditsDone + semCredits) - currentCgpa * creditsDone) / semCredits;
  const rounded = Math.round(needed * 100) / 100;

  let verdict: 'ok' | 'impossible' | 'secured' = 'ok';
  if (rounded > scale.max) verdict = 'impossible';
  else if (rounded <= 0) verdict = 'secured';

  return { needed: rounded, semCredits, verdict };
}
