/**
 * UC-001 main flow steps 1–2 and 9 — create an account.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorCode, errorMessage } from '../lib/api';

const MIN_PASSWORD = 8;

/** UC-001 step 2 — the live strength meter. Advisory only; the server's one
 *  rule is the 8-character minimum. */
function strengthOf(password: string) {
  if (password.length < MIN_PASSWORD) return { score: 0, label: 'Too short', tone: 'bg-critical' };

  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter((pattern) => pattern.test(password)).length;

  if (password.length >= 12 && variety >= 3) return { score: 3, label: 'Strong', tone: 'bg-good' };
  if (variety >= 2) return { score: 2, label: 'Fair', tone: 'bg-warning' };
  return { score: 1, label: 'Weak', tone: 'bg-warning' };
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = strengthOf(password);

  async function submit(event: any) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setTaken(false);
    try {
      await register(displayName, email, password);
      navigate('/dashboard');
    } catch (error) {
      // E1 — the message is safe to show verbatim; the code is what we branch on.
      setTaken(errorCode(error) === 'email_exists');
      setProblem(errorMessage(error, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card border border-hairline bg-surface p-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-plane">
            dIQ
          </span>
          DeadlineIQ
        </span>
        <h1 className="mt-5 text-lg font-semibold text-ink">Create account</h1>

        <label className="mt-4 block text-sm text-ink2" htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-hairline bg-plane px-3 py-2 text-ink"
          autoComplete="name"
          maxLength={60}
        />

        <label className="mt-3 block text-sm text-ink2" htmlFor="email">Email</label>
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
          autoComplete="new-password"
        />

        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-1 flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3].map((step) => (
              <span
                key={step}
                className={`h-full flex-1 rounded-full ${strength.score >= step ? strength.tone : 'bg-hairline'}`}
              />
            ))}
          </div>
          <span className="text-xs text-muted">{password ? strength.label : `${MIN_PASSWORD}+ characters`}</span>
        </div>

        {problem && (
          <p className="mt-3 text-sm text-crittext">
            {problem}
            {taken && (
              <>
                {' '}
                <Link to="/login" className="underline underline-offset-2">Sign in instead</Link>
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || password.length < MIN_PASSWORD || !displayName.trim() || !email.trim()}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-ink underline underline-offset-2">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
