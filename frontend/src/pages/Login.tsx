/**
 * PROVISIONAL: Philena's [P-04] / UC-001 owns the real sign-in screen.
 * This exists only so the Intelligence views can be opened against a real API.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      navigate(sessionStorage.getItem('deadlineiq.returnTo') || '/focus');
    } catch (error) {
      setProblem(errorMessage(error, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card border border-hairline bg-surface p-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
          <span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-bold text-plane">
            dIQ
          </span>
          DeadlineIQ
        </span>
        <h1 className="mt-5 text-lg font-semibold text-ink">Sign in</h1>

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
          className="mt-5 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-plane transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
