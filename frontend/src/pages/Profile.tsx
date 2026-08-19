/**
 * Profile — who you are, what you've told the app, and your companion.
 *
 * The settings shown here are read-only summaries that link to the screen
 * that owns each one. One editable home per setting; this page is the index,
 * not a second set of controls that could drift from the first.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useTasks } from '../context/TasksContext';
import { useAuth } from '../context/AuthContext';
import Character, { type Mood } from '../components/Character';
import { HIDDEN_KEY, setCompanionHidden } from '../components/CharacterWidget';

const WEEKDAYS: [string, string][] = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
];

const SLOT_LABEL: Record<string, string> = {
  clothes: 'Clothes', hat: 'Hat', face: 'Face', neck: 'Neck',
};
// Clothes first: it is the biggest visual change, so it is the one worth
// seeing before the accessories that sit on top of it.
const SLOTS = ['clothes', 'hat', 'face', 'neck'];
const label = 'text-xs font-medium uppercase tracking-wide text-muted';
const card = 'rounded-card border border-hairline bg-surface p-5';

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Profile() {
  const { prefs, modules, ranking } = useTasks();
  const { user } = useAuth();

  const [data, setData] = useState<any>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState('');
  // What the student is trying on but has NOT bought. Purely local: it is
  // never sent anywhere until they press Buy.
  const [tryOn, setTryOn] = useState<any>(null);
  const [onEveryPage, setOnEveryPage] = useState(
    () => localStorage.getItem(HIDDEN_KEY) !== '1',
  );

  const load = useCallback(async () => {
    try {
      const response = await api.get('/api/character');
      setData(response.data);
      setRenaming(response.data.character?.name || '');
    } catch (error) {
      setProblem(errorMessage(error, 'Your companion could not be loaded.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(changes: any) {
    setProblem(null);
    try {
      const response = await api.put('/api/character', changes);
      setData((current: any) => ({ ...current, character: response.data.character }));
    } catch (error) {
      setProblem(errorMessage(error, 'That change could not be saved.'));
    }
  }

  async function buy(itemId: string) {
    setBusy(itemId);
    setProblem(null);
    try {
      await api.post('/api/character/purchase', { itemId });
      setTryOn(null);          // it is really theirs now; the preview is over
      await load();
    } catch (error) {
      setProblem(errorMessage(error, 'That purchase did not go through.'));
    } finally {
      setBusy(null);
    }
  }

  const character = data?.character;
  const mood: Mood = data?.mood?.state || 'neutral';
  const owned = new Set<string>(character?.owned || []);
  const saved = character?.equipped || {};
  // The preview is drawn over the saved outfit, so trying on a hat does not
  // make you forget which scarf you already own.
  const equipped = tryOn ? { ...saved, [tryOn.slot]: tryOn.id } : saved;
  const balance = data?.points?.balance ?? 0;
  const completed = (data?.points?.breakdown || []).length;

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="display text-[26px] leading-tight text-ink">Profile</h1>
      <p className="mt-0.5 text-sm text-ink2">Your account, your settings, and your study companion.</p>

      {problem && <p className="mt-4 text-sm text-crittext">{problem}</p>}

      {/* ── account ────────────────────────────────────────────────────── */}
      <div className={`mt-6 ${card}`}>
        <h2 className={label}>Account</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Display name</dt>
            <dd className="text-sm text-ink">{user?.displayName || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Email</dt>
            <dd className="break-words text-sm text-ink">{user?.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Timezone</dt>
            <dd className="text-sm text-ink">{user?.tz || 'Asia/Singapore'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Member since</dt>
            <dd className="num text-sm text-ink">{formatDate(user?.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* ── the companion ──────────────────────────────────────────────── */}
      <div className={`mt-4 ${card}`}>
        <h2 className={label}>Companion</h2>

        <div className="mt-3 flex flex-wrap items-center gap-5">
          <div className="grid size-28 shrink-0 place-items-center rounded-card bg-plane">
            <Character species={character?.species} mood={mood} equipped={equipped} size={92} />
          </div>

          <div className="min-w-0 flex-1">
            <input
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={() => renaming.trim() && renaming !== character?.name && save({ name: renaming.trim() })}
              maxLength={20}
              aria-label="Companion name"
              className="w-full max-w-[12rem] rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-ink hover:border-hairline focus:border-hairline"
            />
            <p className="mt-1 text-sm text-ink2">{data?.mood?.headline}</p>
            <p className="mt-0.5 text-xs text-muted">{data?.mood?.detail}</p>
            <p className="num mt-2 text-sm text-ink">
              <span className="font-semibold">{balance}</span>
              <span className="text-muted"> points · {completed} task{completed === 1 ? '' : 's'} completed</span>
            </p>

            <label className="mt-3 flex items-center gap-2 text-sm text-ink2">
              <input
                type="checkbox"
                checked={onEveryPage}
                onChange={(e) => {
                  setOnEveryPage(e.target.checked);
                  setCompanionHidden(!e.target.checked);
                }}
              />
              Show on every page
            </label>
          </div>
        </div>

        {/* species */}
        <h3 className={`${label} mt-5`}>Character</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {(data?.species || []).map((s: any) => (
            <button
              key={s.id}
              type="button"
              onClick={() => save({ species: s.id })}
              className={`flex flex-col items-center gap-1 rounded-card border px-3 py-2 transition ${
                character?.species === s.id ? 'border-ink bg-plane' : 'border-hairline hover:bg-plane'
              }`}
            >
              <Character species={s.id} mood="happy" size={44} animate={false} />
              <span className="text-xs text-ink2">{s.name}</span>
            </button>
          ))}
        </div>

        {/* wardrobe — only what has been bought */}
        {owned.size > 0 && (
          <>
            <h3 className={`${label} mt-5`}>Wardrobe</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(data?.shop || []).filter((item: any) => owned.has(item.id)).map((item: any) => {
                const on = equipped[item.slot] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setTryOn(null); save({ equipped: { [item.slot]: on ? null : item.id } }); }}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      on ? 'border-ink bg-ink text-plane' : 'border-hairline text-ink2 hover:bg-plane'
                    }`}
                  >
                    {item.name}
                    <span className="ml-1.5 text-[10px] opacity-70">{SLOT_LABEL[item.slot]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* shop — browse everything, try on what you can afford */}
        <h3 className={`${label} mt-5`}>Shop</h3>
        <p className="mt-0.5 text-xs text-muted">
          Points come from finishing tasks — the grade weight decides how many, and submitting on
          time is worth a bonus. Tap anything you can afford to see it on. Buying is a separate step.
        </p>

        {/* The fitting room. Only appears while something unbought is on. */}
        {tryOn && (
          <div className="rise mt-3 flex flex-wrap items-center gap-3 rounded-card border border-ink bg-plane p-3">
            <span className="text-sm text-ink">
              Trying on <span className="font-semibold">{tryOn.name}</span>
            </span>
            <span className="num text-xs text-muted">{tryOn.cost} pts</span>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={busy === tryOn.id}
                onClick={() => buy(tryOn.id)}
                className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane disabled:opacity-50"
              >
                {busy === tryOn.id ? 'Buying…' : `Buy for ${tryOn.cost}`}
              </button>
              <button
                type="button"
                onClick={() => setTryOn(null)}
                className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink2"
              >
                Take off
              </button>
            </span>
          </div>
        )}

        {SLOTS.map((slot) => (
          <div key={slot} className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{SLOT_LABEL[slot]}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {(data?.shop || []).filter((item: any) => item.slot === slot).map((item: any) => {
                const have = owned.has(item.id);
                const locked = !have && balance < item.cost;
                const trying = tryOn?.id === item.id;
                const wearing = have && saved[item.slot] === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      if (have) { setTryOn(null); save({ equipped: { [slot]: wearing ? null : item.id } }); return; }
                      // Affordable and unowned: a click only ever previews.
                      setTryOn(trying ? null : item);
                    }}
                    className={`relative rounded-card border p-2 text-left transition ${
                      locked
                        ? 'cursor-not-allowed border-hairline opacity-45'
                        : trying
                          ? 'border-ink bg-plane'
                          : wearing
                            ? 'border-good/50 bg-goodtint'
                            : 'border-hairline hover:-translate-y-0.5 hover:bg-plane'
                    }`}
                  >
                    <span className="grid h-16 place-items-center rounded-lg bg-plane/60">
                      {locked ? (
                        // Locked items stay visible as something to aim at, but
                        // the look is withheld — that is the whole incentive.
                        <svg viewBox="0 0 24 24" className="size-7 text-muted" fill="none"
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"
                        >
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
                        </svg>
                      ) : (
                        <Character
                          species={character?.species}
                          mood="happy"
                          equipped={{ [slot]: item.id }}
                          size={62}
                          animate={false}
                        />
                      )}
                    </span>

                    <span className="mt-1 block truncate text-xs text-ink">{item.name}</span>
                    <span className={`num block text-[11px] ${
                      wearing ? 'text-goodtext' : have ? 'text-muted' : locked ? 'text-muted' : 'text-ink2'
                    }`}
                    >
                      {wearing ? 'worn' : have ? 'owned' : trying ? 'trying on' : `${item.cost} pts`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── settings summary ───────────────────────────────────────────── */}
      <div className={`mt-4 ${card}`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className={label}>Study availability</h2>
          <Link to="/setup" className="ml-auto text-xs text-ink underline underline-offset-2">Edit in Setup</Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEEKDAYS.map(([day, name]) => (
            <div key={day} className="rounded-lg bg-plane px-2 py-1.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted">{name}</div>
              <div className="num text-sm text-ink">{prefs?.availability?.[day] ?? '—'}h</div>
            </div>
          ))}
        </div>
        {prefs?.blockedDates?.length > 0 && (
          <p className="num mt-3 text-xs text-muted">
            {prefs.blockedDates.length} blocked day{prefs.blockedDates.length === 1 ? '' : 's'}
          </p>
        )}
        {prefs && !prefs.availabilitySetAt && (
          <p className="mt-3 text-xs text-warntext">
            These are defaults — nobody has asked you yet.{' '}
            <Link to="/setup" className="underline underline-offset-2">Set your real hours</Link> for a
            ranking based on the time you actually have.
          </p>
        )}
      </div>

      <div className={`mt-4 ${card}`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className={label}>Priority weights</h2>
          <Link to="/settings" className="ml-auto text-xs text-ink underline underline-offset-2">Tune</Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(prefs?.weights || {}).map(([key, value]) => (
            <span key={key} className="num rounded-full bg-plane px-2.5 py-1 text-xs text-ink2">
              {key} {Math.round(Number(value) * 100)}%
            </span>
          ))}
        </div>
      </div>

      <div className={`mt-4 ${card}`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className={label}>Modules</h2>
          <Link to="/setup" className="ml-auto text-xs text-ink underline underline-offset-2">Manage</Link>
        </div>
        <p className="num mt-2 text-sm text-ink">
          {modules?.length || 0}
          <span className="text-muted"> modules · </span>
          {(ranking || []).length}
          <span className="text-muted"> tasks in the ranking</span>
        </p>
      </div>
    </section>
  );
}
