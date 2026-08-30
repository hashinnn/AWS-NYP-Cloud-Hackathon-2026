/**
 * UC-001 Alternative Flow A — a returning student signs in.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: any) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await login(email, password);
      // Consumed, not kept: otherwise one expired session on /workload sends
      // every later sign-in back to /workload.
      const returnTo = sessionStorage.getItem('deadlineiq.returnTo');
      sessionStorage.removeItem('deadlineiq.returnTo');
      navigate(returnTo || '/dashboard');
    } catch (error) {
      setProblem(errorMessage(error, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── the argument, before the form ─────────────────────────────────
          The five bars ARE the product: a deterministic formula a judge can
          check by hand. The sign-in screen leads with that, not with fields. */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-ink p-10 text-plane lg:flex">
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] border border-plane/25">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <g fill="currentColor">
                <rect x="4" y="13" width="2.6" height="7" rx="1.3" />
                <rect x="8.2" y="9.5" width="2.6" height="10.5" rx="1.3" />
                <rect x="12.4" y="6" width="2.6" height="14" rx="1.3" />
                <rect x="16.6" y="10.5" width="2.6" height="9.5" rx="1.3" />
              </g>
            </svg>
          </span>
          <span className="display text-[19px]">DeadlineIQ</span>
        </span>

        <div className="max-w-md">
          <h2 className="display text-[44px] leading-[1.08]">
            Know what to do next — and exactly why.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-plane/70">
            Five factors, one arithmetic you can check on a whiteboard. The AI writes the
            sentence. It never picks the order.
          </p>

          {/* A worked sub-score bar, as the visual signature. */}
          <div className="mt-8">
            <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-[4px]" aria-hidden="true">
              {[
                ['var(--color-series-1)', 30], ['var(--color-series-2)', 25],
                ['var(--color-series-3)', 20], ['var(--color-series-4)', 15],
                ['var(--color-series-5)', 10],
              ].map(([colour, width]) => (
                <span key={colour as string} style={{ backgroundColor: colour as string, width: `${width}%` }} />
              ))}
            </div>
            <p className="num mt-2.5 text-xs tracking-wide text-plane/60">
              0.30·Urgency + 0.25·Stakes + 0.20·Effort + 0.15·Deficit + 0.10·Clash
            </p>
          </div>
        </div>

        <p className="text-xs text-plane/50">AWS × NYP Cloud Hackathon 2026 · PS-3</p>
      </div>

      {/* ── the form ── */}
      <div className="flex flex-1 items-center justify-center px-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <span className="flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-[10px] bg-accent">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <g fill="var(--color-plane)">
                  <rect x="4" y="13" width="2.6" height="7" rx="1.3" />
                  <rect x="8.2" y="9.5" width="2.6" height="10.5" rx="1.3" />
                  <rect x="12.4" y="6" width="2.6" height="14" rx="1.3" />
                  <rect x="16.6" y="10.5" width="2.6" height="9.5" rx="1.3" />
                </g>
              </svg>
            </span>
            <span className="display text-[19px] text-ink">DeadlineIQ</span>
          </span>
          <h1 className="display mt-6 text-[30px] text-ink lg:mt-0">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Your ranking recomputed while you were away.</p>

        <label className="mt-4 block text-sm text-ink2" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-ink"
          autoComplete="username"
        />

        <label className="mt-3 block text-sm text-ink2" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-ink"
          autoComplete="current-password"
        />

        {problem && <p className="mt-3 text-sm text-crittext">{problem}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

          <p className="mt-4 text-center text-sm text-muted">
            New here?{' '}
            <Link to="/register" className="text-ink underline underline-offset-2">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
