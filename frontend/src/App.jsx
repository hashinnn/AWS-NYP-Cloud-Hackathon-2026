/**
 * App shell and routes.
 *
 * PROVISIONAL SHELL: the router, nav and layout belong to Philena's [P-04];
 * the Dashboard (UC-016) and Calendar (UC-017) routes are Zoe's and are left
 * to her. Everything under Focus / Today / Workload / Prioritisation is the
 * Intelligence track (UC-010 → UC-015, UC-018).
 */

import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TasksProvider, useTasks } from './context/TasksContext';
import Focus from './pages/Focus';
import Today from './pages/Today';
import Workload from './pages/Workload';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import ThemeToggle from './components/ThemeToggle';
import { getToken } from './lib/api';

const LINKS = [
  ['/focus', 'Focus'],
  ['/today', 'Today'],
  ['/workload', 'Workload'],
  ['/settings', 'Prioritisation'],
];

function DegradedBanner() {
  const { degraded, error, refresh } = useTasks();
  if (!degraded) return null;
  return (
    <div className="border-b border-warning/40 bg-warntint">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-2 text-sm text-ink2">
        <span className="inline-block size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        {error}
        <button type="button" onClick={refresh} className="ml-auto font-medium text-ink underline underline-offset-2">
          Retry
        </button>
      </div>
    </div>
  );
}

function Shell({ children }) {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/85 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
            <span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-bold text-plane">
              dIQ
            </span>
            DeadlineIQ
          </span>

          <div className="flex flex-1 items-center gap-0.5">
            {LINKS.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${
                  isActive
                    ? 'bg-ink font-medium text-plane'
                    : 'text-ink2 hover:bg-plane hover:text-ink'
                }`}
              >
                {label}
              </NavLink>
            ))}
          </div>

          <ThemeToggle />

          <button type="button" onClick={logout} className="text-sm text-muted transition hover:text-ink">
            Sign out
          </button>
        </nav>
      </header>
      <DegradedBanner />
      <main>{children}</main>
    </div>
  );
}

function Protected({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <AuthProvider>
      <TasksProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/focus" element={<Protected><Focus /></Protected>} />
          <Route path="/today" element={<Protected><Today /></Protected>} />
          <Route path="/workload" element={<Protected><Workload /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="*" element={<Navigate to="/focus" replace />} />
        </Routes>
      </TasksProvider>
    </AuthProvider>
  );
}
