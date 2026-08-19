/**
 * The study companion, drawn rather than imported.
 *
 * Proportions are deliberately chibi — a head nearly as wide as the body, big
 * eyes set low, short limbs. That is most of what "cute" is; the rest is blush
 * and rounded corners.
 *
 * One face system across every species: the silhouette changes, the eyes and
 * mouth are driven entirely by mood. Four species × five moods stays nine
 * small drawings instead of twenty, and a new species only supplies a head
 * decoration and a colour.
 *
 * The head sits at cx 50, cy 52, r 32 and every hat and face piece is drawn
 * against that circle, so accessories are species-independent by construction.
 * Colours are palette CSS variables — the companion swaps with the theme.
 */

import { useId } from 'react';

export type Mood = 'happy' | 'neutral' | 'worried' | 'sad' | 'tired';

export type Outfit = {
  hat?: string;
  face?: string;
  neck?: string;
  clothes?: string;
};

const SPECIES_SLOT: Record<string, number> = {
  cat: 4, frog: 3, cactus: 6, sprout: 1,
};

const hue = (species: string) => 'var(--color-series-' + (SPECIES_SLOT[species] ?? 4) + ')';

/* ── face ─────────────────────────────────────────────────────────────── */
function Eyes({ mood }: { mood: Mood }) {
  const ink = 'var(--color-ink)';

  if (mood === 'tired') {
    // Closed and contented — asleep, never unhappy.
    return (
      <g stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M33 47 q5 4 10 0" />
        <path d="M57 47 q5 4 10 0" />
      </g>
    );
  }
  if (mood === 'happy') {
    return (
      <g stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M33 48 q5 -5.5 10 0" />
        <path d="M57 48 q5 -5.5 10 0" />
      </g>
    );
  }

  const squash = mood === 'sad' ? 3.6 : 4.8;
  return (
    <g>
      <ellipse cx="38" cy="47" rx="4.1" ry={squash} fill={ink} />
      <ellipse cx="62" cy="47" rx="4.1" ry={squash} fill={ink} />
      {/* two highlights per eye: the big one is the shine, the small one is
          what stops an open-eyed face reading as a stare */}
      <circle cx="39.6" cy="45.2" r="1.5" fill="var(--color-surface)" />
      <circle cx="63.6" cy="45.2" r="1.5" fill="var(--color-surface)" />
      <circle cx="36.6" cy="49" r="0.8" fill="var(--color-surface)" opacity="0.7" />
      <circle cx="60.6" cy="49" r="0.8" fill="var(--color-surface)" opacity="0.7" />
      {mood === 'worried' && (
        <g stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M32 38 q5.5 -2.5 10 -0.5" />
          <path d="M68 38 q-5.5 -2.5 -10 -0.5" />
        </g>
      )}
      {mood === 'sad' && (
        <g stroke={ink} strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M32 39 q5.5 1.5 10 3" />
          <path d="M68 39 q-5.5 1.5 -10 3" />
        </g>
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const ink = 'var(--color-ink)';
  const line = {
    stroke: ink, strokeWidth: 2.4, strokeLinecap: 'round' as const, fill: 'none',
  };
  if (mood === 'happy') return <path d="M44 58 q6 5.5 12 0" {...line} />;
  if (mood === 'sad') return <path d="M44 61 q6 -5.5 12 0" {...line} />;
  if (mood === 'worried') return <path d="M44 59.5 q3 -2.8 6 0 q3 2.8 6 0" {...line} />;
  if (mood === 'tired') return <ellipse cx="50" cy="59" rx="3.4" ry="4.4" fill={ink} opacity="0.75" />;
  return <path d="M45 59 h10" {...line} />;
}

/** Cheeks. Sits outside the glasses so no face piece has to work around it. */
function Blush({ species }: { species: string }) {
  return (
    <g fill={hue(species)} opacity="0.45">
      <ellipse cx="25.5" cy="56" rx="6" ry="3.8" />
      <ellipse cx="74.5" cy="56" rx="6" ry="3.8" />
    </g>
  );
}

/* ── body: shared by every species so clothes fit all of them ─────────── */
function Body({ species }: { species: string }) {
  const fill = hue(species);
  return (
    <g>
      {/* feet peek out below the body */}
      <ellipse cx="39" cy="123" rx="8.5" ry="5.5" fill={fill} />
      <ellipse cx="61" cy="123" rx="8.5" ry="5.5" fill={fill} />
      {/* arms behind the torso, so a sleeve can cover the join */}
      <ellipse cx="25" cy="97" rx="7.5" ry="11.5" fill={fill} />
      <ellipse cx="75" cy="97" rx="7.5" ry="11.5" fill={fill} />
      <path d="M31 80 h38 a20 20 0 0 1 3 12 v18 a13 13 0 0 1 -13 13 h-18 a13 13 0 0 1 -13 -13 v-18 a20 20 0 0 1 3 -12z" fill={fill} />
      {species === 'cactus' && (
        <g stroke="var(--color-surface)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
          <path d="M42 88 v5M58 88 v5M42 104 v5M58 104 v5M50 96 v5" />
        </g>
      )}
    </g>
  );
}

/** Head shape and whatever grows out of it. */
function Head({ species }: { species: string }) {
  const fill = hue(species);

  return (
    <g>
      {species === 'cat' && (
        <>
          <path d="M25 34 l1 -17 15 9z" fill={fill} />
          <path d="M75 34 l-1 -17 -15 9z" fill={fill} />
          {/* inner ear keeps the silhouette from reading as horns */}
          <path d="M29 32 l0.6 -9 8 5z" fill="var(--color-series-5)" opacity="0.55" />
          <path d="M71 32 l-0.6 -9 -8 5z" fill="var(--color-series-5)" opacity="0.55" />
        </>
      )}
      {species === 'frog' && (
        <>
          <circle cx="33" cy="27" r="11" fill={fill} />
          <circle cx="67" cy="27" r="11" fill={fill} />
        </>
      )}
      {species === 'sprout' && (
        <>
          <path d="M50 22 q-19 -5 -21 8 q17 6 21 -8z" fill="var(--color-series-6)" />
          <path d="M50 22 q19 -8 22 5 q-18 8 -22 -5z" fill="var(--color-series-6)" opacity="0.8" />
          <path d="M50 24 v8" stroke="var(--color-series-6)" strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      <circle cx="50" cy="52" r="32" fill={fill} />

      {species === 'cat' && (
        <g stroke="var(--color-ink)" strokeWidth="1.4" strokeLinecap="round" opacity="0.45">
          <path d="M14 50 h10M14 57 h10M86 50 h-10M86 57 h-10" />
        </g>
      )}
      {species === 'cactus' && (
        <g stroke="var(--color-surface)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
          <path d="M34 32 v5M66 32 v5M22 52 h5M78 52 h-5" />
        </g>
      )}
    </g>
  );
}

/** The cat's tail, drawn behind everything. */
function Behind({ species }: { species: string }) {
  if (species !== 'cat') return null;
  return (
    <path
      d="M70 112 q22 4 20 -14 q-1 -9 -8 -8"
      stroke={hue(species)}
      strokeWidth="8"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/* ── hats ─────────────────────────────────────────────────────────────── */
function Hat({ id }: { id?: string }) {
  switch (id) {
    case 'beanie':
      return (
        <g>
          <path d="M28 30 a22 22 0 0 1 44 0z" fill="var(--color-series-8)" />
          <rect x="26" y="28" width="48" height="8" rx="4" fill="var(--color-series-5)" />
          <circle cx="50" cy="9" r="4.5" fill="var(--color-series-5)" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M29 30 a21 21 0 0 1 42 0z" fill="var(--color-series-1)" />
          <path d="M69 26 q16 2 15 8 l-16 0z" fill="var(--color-series-1)" opacity="0.8" />
          <circle cx="50" cy="11" r="3.4" fill="var(--color-series-4)" />
        </g>
      );
    case 'party':
      return (
        <g>
          <path d="M50 2 l14 28 h-28z" fill="var(--color-series-5)" />
          <circle cx="50" cy="3" r="4" fill="var(--color-series-4)" />
          <g fill="var(--color-surface)">
            <circle cx="46" cy="22" r="2" />
            <circle cx="55" cy="16" r="2" />
          </g>
        </g>
      );
    case 'bucket':
      return (
        <g>
          <path d="M32 28 q0 -18 18 -18 q18 0 18 18z" fill="var(--color-series-3)" />
          <rect x="24" y="26" width="52" height="8" rx="4" fill="var(--color-series-3)" />
          <rect x="32" y="24" width="36" height="3.5" fill="var(--color-series-6)" opacity="0.7" />
        </g>
      );
    case 'flowers':
      return (
        <g>
          <path d="M26 30 q24 -14 48 0" stroke="var(--color-series-6)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          {[[32, 26], [43, 19], [57, 19], [68, 26]].map(([cx, cy], i) => (
            <g key={cx}>
              {[0, 72, 144, 216, 288].map((deg) => (
                <ellipse
                  key={deg}
                  cx={cx}
                  cy={cy - 4}
                  rx="2.6"
                  ry="4"
                  fill={i % 2 ? 'var(--color-series-5)' : 'var(--color-surface)'}
                  transform={'rotate(' + deg + ' ' + cx + ' ' + cy + ')'}
                />
              ))}
              <circle cx={cx} cy={cy} r="2.2" fill="var(--color-series-4)" />
            </g>
          ))}
        </g>
      );
    case 'bow':
      return (
        <g>
          <path d="M66 22 l-14 -8 v16z" fill="var(--color-series-5)" />
          <path d="M66 22 l14 -8 v16z" fill="var(--color-series-5)" />
          <circle cx="66" cy="22" r="3.6" fill="var(--color-series-8)" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M24 40 a26 26 0 0 1 52 0" stroke="var(--color-ink)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="17" y="36" width="12" height="20" rx="6" fill="var(--color-series-8)" />
          <rect x="71" y="36" width="12" height="20" rx="6" fill="var(--color-series-8)" />
        </g>
      );
    case 'graduate':
      return (
        <g>
          <rect x="34" y="20" width="32" height="11" rx="2.5" fill="var(--color-ink)" />
          <path d="M50 6 l30 12 -30 12 -30 -12z" fill="var(--color-ink)" />
          <path d="M78 19 v14" stroke="var(--color-series-4)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="78" cy="34" r="3.2" fill="var(--color-series-4)" />
        </g>
      );
    case 'wizard':
      return (
        <g>
          <path d="M50 -2 q10 20 22 32 h-44 q12 -12 22 -32z" fill="var(--color-series-7)" />
          <rect x="24" y="28" width="52" height="7" rx="3.5" fill="var(--color-series-7)" opacity="0.75" />
          <g fill="var(--color-series-4)">
            <path d="M44 16 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6z" />
            <circle cx="56" cy="24" r="1.8" />
          </g>
        </g>
      );
    case 'tophat':
      return (
        <g>
          <rect x="22" y="28" width="56" height="6" rx="3" fill="var(--color-ink)" />
          <rect x="33" y="2" width="34" height="28" rx="3" fill="var(--color-ink)" />
          <rect x="33" y="22" width="34" height="6" fill="var(--color-series-8)" />
        </g>
      );
    case 'crown':
      return (
        <g fill="var(--color-series-4)">
          <path d="M28 30 l0 -18 10 8 12 -13 12 13 10 -8 0 18z" />
          <circle cx="50" cy="10" r="3" fill="var(--color-series-8)" />
        </g>
      );
    case 'halo':
      return (
        <g>
          <ellipse cx="50" cy="12" rx="19" ry="6" fill="none" stroke="var(--color-series-4)" strokeWidth="4" />
          <ellipse cx="50" cy="12" rx="19" ry="6" fill="none" stroke="var(--color-surface)" strokeWidth="1.2" opacity="0.6" />
        </g>
      );
    default:
      return null;
  }
}

/* ── face pieces ──────────────────────────────────────────────────────── */
function Face({ id }: { id?: string }) {
  switch (id) {
    case 'glasses':
      return (
        <g stroke="var(--color-ink)" strokeWidth="2.2" fill="none">
          <rect x="29" y="39" width="18" height="16" rx="4" fill="var(--color-surface)" opacity="0.85" />
          <rect x="53" y="39" width="18" height="16" rx="4" fill="var(--color-surface)" opacity="0.85" />
          <path d="M47 47 h6" />
        </g>
      );
    case 'round':
      return (
        <g stroke="var(--color-series-4)" strokeWidth="2.2" fill="none">
          <circle cx="38" cy="47" r="9.5" fill="var(--color-surface)" opacity="0.85" />
          <circle cx="62" cy="47" r="9.5" fill="var(--color-surface)" opacity="0.85" />
          <path d="M47.5 47 h5" />
        </g>
      );
    case 'stars':
      return (
        <g fill="var(--color-series-5)">
          {[[26, 39], [74, 39], [21, 50]].map(([cx, cy]) => (
            <path key={cx} d={'M' + cx + ' ' + (cy - 4) + ' l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z'} />
          ))}
        </g>
      );
    case 'shades':
      return (
        <g fill="var(--color-ink)">
          <path d="M27 41 h20 a2 2 0 0 1 2 2 v4 a10 10 0 0 1 -20 0 v-4 a2 2 0 0 1 -2 -2z" />
          <path d="M53 41 h20 a2 2 0 0 1 -2 2 v4 a10 10 0 0 1 -20 0 v-4 a2 2 0 0 1 2 -2z" />
          <rect x="47" y="44" width="6" height="2.6" rx="1.3" />
        </g>
      );
    case 'monocle':
      return (
        <g>
          <circle cx="62" cy="47" r="10.5" fill="var(--color-surface)" opacity="0.85"
            stroke="var(--color-series-4)" strokeWidth="2.4" />
          <path d="M62 58 q2 10 -6 14" stroke="var(--color-series-4)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'patch':
      return (
        <g>
          <path d="M20 40 q30 -6 60 0" stroke="var(--color-ink)" strokeWidth="2.2" fill="none" />
          <rect x="29" y="38" width="19" height="17" rx="4" fill="var(--color-ink)" />
        </g>
      );
    case 'moustache':
      return (
        <g fill="var(--color-ink)">
          <path d="M50 57 q-6 -5 -13 -2 q-4 2 -2 5 q4 4 9 0 q3 -2 6 -3z" />
          <path d="M50 57 q6 -5 13 -2 q4 2 2 5 q-4 4 -9 0 q-3 -2 -6 -3z" />
        </g>
      );
    default:
      return null;
  }
}

/* ── neck pieces ──────────────────────────────────────────────────────── */
function Neck({ id }: { id?: string }) {
  switch (id) {
    case 'scarf':
      return (
        <g fill="var(--color-series-2)">
          <rect x="30" y="76" width="40" height="10" rx="5" />
          <path d="M60 82 l10 18 -9 3 -6 -18z" />
        </g>
      );
    case 'tie':
      return (
        <g>
          <path d="M43 76 l7 6 7 -6 -4 -4 h-6z" fill="var(--color-series-1)" />
          <path d="M50 82 l5 6 -5 15 -5 -15z" fill="var(--color-series-1)" />
        </g>
      );
    case 'bowtie':
      return (
        <g fill="var(--color-series-8)">
          <path d="M50 80 l-13 -7 v14z" />
          <path d="M50 80 l13 -7 v14z" />
          <circle cx="50" cy="80" r="3.4" fill="var(--color-series-5)" />
        </g>
      );
    case 'pearls':
      return (
        <g fill="var(--color-surface)" stroke="var(--color-rule)" strokeWidth="0.8">
          {[36, 42, 48, 54, 60, 64].map((cx, i) => (
            <circle key={cx} cx={cx} cy={80 + (i === 2 || i === 3 ? 4 : i === 1 || i === 4 ? 2.5 : 0)} r="3.1" />
          ))}
        </g>
      );
    case 'medal':
      return (
        <g>
          <path d="M42 76 l6 13 M58 76 l-6 13" stroke="var(--color-series-8)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="50" cy="95" r="7.5" fill="var(--color-series-4)" />
          <circle cx="50" cy="95" r="4.4" fill="none" stroke="var(--color-surface)" strokeWidth="1.4" opacity="0.8" />
        </g>
      );
    case 'cape':
      return (
        <g>
          <path d="M32 78 q18 46 -8 46 q-6 -24 0 -46z" fill="var(--color-series-8)" />
          <path d="M68 78 q-18 46 8 46 q6 -24 0 -46z" fill="var(--color-series-8)" />
          <rect x="32" y="74" width="36" height="7" rx="3.5" fill="var(--color-series-4)" />
        </g>
      );
    default:
      return null;
  }
}

/* ── clothes: drawn over the torso, under the neck piece ──────────────── */
function Clothes({ id, clip }: { id?: string; clip: string }) {
  // The torso silhouette every outfit is cut to.
  const torso = 'M31 80 h38 a20 20 0 0 1 3 12 v18 a13 13 0 0 1 -13 13 h-18 a13 13 0 0 1 -13 -13 v-18 a20 20 0 0 1 3 -12z';

  switch (id) {
    case 'tee':
      return (
        <g>
          <path d={torso} fill="var(--color-series-3)" />
          <ellipse cx="25" cy="94" rx="7.5" ry="8" fill="var(--color-series-3)" />
          <ellipse cx="75" cy="94" rx="7.5" ry="8" fill="var(--color-series-3)" />
          <path d="M42 80 q8 7 16 0" stroke="var(--color-surface)" strokeWidth="2" fill="none" opacity="0.5" />
        </g>
      );
    case 'stripes':
      return (
        <g>
          <path d={torso} fill="var(--color-surface)" />
          <g clipPath={'url(#' + clip + ')'}>
            <g fill="var(--color-series-1)">
              <rect x="26" y="84" width="48" height="6" />
              <rect x="26" y="96" width="48" height="6" />
              <rect x="26" y="108" width="48" height="6" />
            </g>
          </g>
          <ellipse cx="25" cy="94" rx="7.5" ry="8" fill="var(--color-series-1)" />
          <ellipse cx="75" cy="94" rx="7.5" ry="8" fill="var(--color-series-1)" />
        </g>
      );
    case 'hoodie':
      return (
        <g>
          {/* hood sits behind the head, which is what makes it read as a hoodie */}
          <path d="M26 74 q24 -14 48 0 q-4 12 -24 12 q-20 0 -24 -12z" fill="var(--color-series-7)" opacity="0.9" />
          <path d={torso} fill="var(--color-series-7)" />
          <ellipse cx="25" cy="97" rx="7.5" ry="11.5" fill="var(--color-series-7)" />
          <ellipse cx="75" cy="97" rx="7.5" ry="11.5" fill="var(--color-series-7)" />
          <rect x="38" y="100" width="24" height="12" rx="4" fill="var(--color-ink)" opacity="0.18" />
          <g stroke="var(--color-surface)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M45 84 v8M55 84 v8" />
          </g>
        </g>
      );
    case 'overalls':
      return (
        <g>
          <path d={torso} fill="var(--color-series-1)" opacity="0.25" />
          <path d="M34 96 h32 v14 a13 13 0 0 1 -13 13 h-6 a13 13 0 0 1 -13 -13z" fill="var(--color-series-1)" />
          <rect x="34" y="92" width="32" height="10" rx="2" fill="var(--color-series-1)" />
          <g stroke="var(--color-series-1)" strokeWidth="4" strokeLinecap="round">
            <path d="M39 92 l-2 -12M61 92 l2 -12" />
          </g>
          <g fill="var(--color-series-4)">
            <circle cx="38" cy="94" r="2" />
            <circle cx="62" cy="94" r="2" />
          </g>
        </g>
      );
    case 'labcoat':
      return (
        <g>
          <path d={torso} fill="var(--color-surface)" />
          <ellipse cx="25" cy="97" rx="7.5" ry="11.5" fill="var(--color-surface)" />
          <ellipse cx="75" cy="97" rx="7.5" ry="11.5" fill="var(--color-surface)" />
          <path d="M50 80 l-8 8 8 35 8 -35z" fill="var(--color-plane)" opacity="0.8" />
          <g stroke="var(--color-rule)" strokeWidth="1.4" fill="none">
            <path d="M42 88 l8 -8 8 8" />
            <rect x="58" y="100" width="10" height="9" rx="1.5" />
          </g>
        </g>
      );
    case 'varsity':
      return (
        <g>
          <path d={torso} fill="var(--color-ink)" />
          <ellipse cx="25" cy="97" rx="7.5" ry="11.5" fill="var(--color-surface)" />
          <ellipse cx="75" cy="97" rx="7.5" ry="11.5" fill="var(--color-surface)" />
          <rect x="30" y="76" width="40" height="6" rx="3" fill="var(--color-series-8)" />
          <text x="50" y="103" textAnchor="middle" fontSize="17" fontWeight="800" fill="var(--color-series-4)">D</text>
        </g>
      );
    case 'raincoat':
      return (
        <g>
          <path d="M26 74 q24 -14 48 0 q-4 12 -24 12 q-20 0 -24 -12z" fill="var(--color-series-4)" />
          <path d={torso} fill="var(--color-series-4)" />
          <ellipse cx="25" cy="97" rx="7.5" ry="11.5" fill="var(--color-series-4)" />
          <ellipse cx="75" cy="97" rx="7.5" ry="11.5" fill="var(--color-series-4)" />
          <path d="M50 82 v41" stroke="var(--color-ink)" strokeWidth="1.4" opacity="0.35" />
          <g fill="var(--color-ink)" opacity="0.3">
            <circle cx="45" cy="92" r="1.8" />
            <circle cx="45" cy="104" r="1.8" />
            <circle cx="45" cy="116" r="1.8" />
          </g>
        </g>
      );
    case 'spacesuit':
      return (
        <g>
          <path d={torso} fill="var(--color-surface)" />
          <ellipse cx="25" cy="97" rx="8.5" ry="12" fill="var(--color-surface)" />
          <ellipse cx="75" cy="97" rx="8.5" ry="12" fill="var(--color-surface)" />
          <rect x="28" y="76" width="44" height="8" rx="4" fill="var(--color-series-7)" />
          <rect x="40" y="92" width="20" height="16" rx="3" fill="var(--color-series-7)" opacity="0.85" />
          <g fill="var(--color-series-4)">
            <circle cx="46" cy="98" r="2.2" />
            <circle cx="54" cy="98" r="2.2" />
          </g>
          <rect x="43" y="103" width="14" height="2.6" rx="1.3" fill="var(--color-series-3)" />
          <g stroke="var(--color-rule)" strokeWidth="1.3" fill="none">
            <path d="M22 104 h6M78 104 h-6" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

export default function Character({
  species = 'cat',
  mood = 'neutral',
  equipped = {},
  size = 96,
  animate = true,
}: {
  species?: string;
  mood?: Mood;
  equipped?: Outfit;
  size?: number;
  animate?: boolean;
}) {
  const clip = 'torso-' + useId().replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 100 132"
      width={size}
      height={size * 1.32}
      role="img"
      aria-label={'Your companion, looking ' + mood}
      className={animate ? 'companion' : undefined}
    >
      <defs>
        <clipPath id={clip}>
          <path d="M31 80 h38 a20 20 0 0 1 3 12 v18 a13 13 0 0 1 -13 13 h-18 a13 13 0 0 1 -13 -13 v-18 a20 20 0 0 1 3 -12z" />
        </clipPath>
      </defs>

      <Behind species={species} />
      <Body species={species} />
      {/* clothes cover the torso, then the neck piece sits on top of the collar */}
      <Clothes id={equipped.clothes} clip={clip} />
      <Head species={species} />
      {/* Over the head, so a scarf sits in front of the chin rather than
          disappearing behind it — but clothes stay under, so a hood reads as
          being behind the head, which is what makes it a hood. */}
      <Neck id={equipped.neck} />
      <Blush species={species} />
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      <Face id={equipped.face} />
      <Hat id={equipped.hat} />

      {/* tired reads as sleep, never as sadness */}
      {mood === 'tired' && (
        <g fill="var(--color-ink2)" opacity="0.8">
          <text x="76" y="26" fontSize="11" fontWeight="700">z</text>
          <text x="85" y="15" fontSize="8" fontWeight="700">z</text>
        </g>
      )}
    </svg>
  );
}
