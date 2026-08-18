/**
 * App shell and routes.
 *
 * PROVISIONAL SHELL: the router, nav and layout belong to Philena's [P-04];
 * the Dashboard (UC-016) and Calendar (UC-017) routes are Zoe's and are left
 * to her. Everything under Focus / Today / Workload / Prioritisation is the
 * Intelligence track (UC-010 → UC-015, UC-018).
 */

import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TasksProvider, useTasks } from './context/TasksContext';
import Focus from './pages/Focus';
import Today from './pages/Today';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Workload from './pages/Workload';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import ThemeToggle from './components/ThemeToggle';
import AddTaskDialog from './components/AddTaskDialog';
import { getToken } from './lib/api';

const LINKS = [
  ['/focus', 'Focus'],
  ['/today', 'Today'],
  ['/tasks', 'Tasks'],
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

/**
 * UC-002 step 8 — what the ranking did with the new task, stated rather than
 * left for the student to spot. Carries the server's non-blocking warnings
 * (E2 over-allocation, Alt C module creation) in the same place.
 */
function CreatedToast({ result, onDismiss }) {
  const rank = result.ranking.findIndex((task) => task.taskId === result.task.taskId) + 1;
  const scored = result.task.priorityScore !== null && result.task.priorityScore !== undefined;

  return (
    // Anchored to both edges on a phone: a fixed max-width pinned to `right`
    // hangs off the left of a 320px screen.
    <div className="rise fixed bottom-4 left-4 right-4 z-40 rounded-card border border-hairline bg-surface p-4 shadow-card sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm">
      <p className="text-sm text-ink">
        <span className="font-medium">{result.task.title}</span> added
        {scored && rank > 0 && (
          <>
            {' — ranked '}
            <span className="num font-medium">#{rank}</span>
            {' of '}
            <span className="num">{result.ranking.length}</span>
            {', priority '}
            <span className="num font-medium">{result.task.priorityScore}</span>
          </>
        )}
        {/* E4 — scoring failed but the task is safe; the hourly run fills it in. */}
        {!scored && <span className="text-ink2"> — score pending</span>}
      </p>

      {result.task.tight && (
        <p className="mt-1 text-xs text-crittext">
          This does not fit in the hours you have before the deadline.
        </p>
      )}

      {result.warnings.map((warning) => (
        <p key={warning.code} className="mt-1 text-xs text-warntext">{warning.message}</p>
      ))}

      <div className="mt-2 flex gap-3 text-xs">
        <Link
          to={`/tasks/${result.task.taskId}`}
          onClick={onDismiss}
          className="text-ink underline underline-offset-2"
        >
          Open
        </Link>
        <button type="button" onClick={onDismiss} className="text-muted underline underline-offset-2">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Shell({ children }) {
  const { logout } = useAuth();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/85 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:h-16 sm:flex-nowrap sm:gap-x-6 sm:px-6 sm:py-0">
          <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
            <span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-bold text-plane">
              dIQ
            </span>
            DeadlineIQ
          </span>

          {/*
            Below `sm` the links drop to their own full-width row instead of
            squeezing "Add task" and "Sign out" off the right edge. They wrap
            among themselves rather than scrolling, so nothing is ever hidden
            behind a gesture the student has to discover.
          */}
          <div className="order-last flex w-full flex-wrap items-center gap-0.5 sm:order-none sm:w-auto sm:flex-1 sm:flex-nowrap">
            {LINKS.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                // Every state is font-medium: switching weight on the active
                // link would change its width and nudge every sibling along.
                // The filled pill already carries the distinction.
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-ink text-plane'
                    : 'text-ink2 hover:bg-plane hover:text-ink'
                }`}
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Step 1 — "Add task" is reachable from every view. */}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-plane transition hover:opacity-90"
          >
            Add task
          </button>

          <ThemeToggle />

          <button type="button" onClick={logout} className="text-sm text-muted transition hover:text-ink">
            Sign out
          </button>
        </nav>
      </header>
      <DegradedBanner />
      <main>{children}</main>

      {adding && (
        <AddTaskDialog onClose={() => setAdding(false)} onCreated={setCreated} />
      )}
      {created && (
        <CreatedToast result={created} onDismiss={() => setCreated(null)} />
      )}
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
          <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
          <Route path="/tasks/:taskId" element={<Protected><TaskDetail /></Protected>} />
          <Route path="/workload" element={<Protected><Workload /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="*" element={<Navigate to="/focus" replace />} />
        </Routes>
      </TasksProvider>
    </AuthProvider>
  );
}
