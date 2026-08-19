/**
 * App shell and routes.
 *
 * The router, nav and layout belong to Philena's [P-04]; Dashboard (UC-016),
 * Calendar (UC-017), Completed (UC-022) and Notifications (UC-020) are Zoe's
 * Experience track. Everything under Focus / Today / Workload / Prioritisation
 * is the Intelligence track (UC-010 → UC-015, UC-018).
 */

import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TasksProvider, useTasks } from './context/TasksContext';
import { onCapture } from './lib/capture';
import Focus from './pages/Focus';
import Today from './pages/Today';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Workload from './pages/Workload';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Completed from './pages/Completed';
import Notifications from './pages/Notifications';
import ThemeToggle from './components/ThemeToggle';
import AddTaskDialog from './components/AddTaskDialog';
import QuickAddBar, { focusQuickAdd } from './components/QuickAddBar';
import BulkImportDialog from './components/BulkImportDialog';
import BriefUploadDialog from './components/BriefUploadDialog';
import { getToken } from './lib/api';

/**
 * The nav, grouped by intent rather than flattened into one row: what needs
 * doing now, the plans around it, and the controls behind both. Ten flat
 * links read as a toolbar; three named groups read as a product.
 */
const NAV_GROUPS = [
  ['Now', [
    ['/dashboard', 'Dashboard', 'M3.75 4.5h7v7h-7zM13.25 4.5h7v4.5h-7zM13.25 12h7v7.5h-7zM3.75 14.5h7v5h-7z'],
    ['/focus', 'Focus', 'M12 3v3m0 12v3M3 12h3m12 0h3M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25z'],
    ['/today', 'Today', 'M12 4.5v-2m5.3 4.2 1.4-1.4M19.5 12h2m-4.2 5.3 1.4 1.4M12 19.5v2m-6.7-3.3-1.4 1.4M4.5 12h-2m3.3-6.7L4.4 3.9M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  ]],
  ['Plan', [
    ['/calendar', 'Calendar', 'M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25zM4.5 9.5h15M8.5 3v3m7-3v3'],
    ['/tasks', 'Tasks', 'M4 6.5h10M4 12h10M4 17.5h10m4.5-11.3 1.3 1.3 2.2-2.6'],
    ['/workload', 'Workload', 'M4.5 19.5V10m5 9.5V5.5m5 14V13m5 6.5V8'],
  ]],
  ['Review', [
    ['/completed', 'Completed', 'M9 12.5l2 2 4-4.5M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z'],
    ['/notifications', 'Reminders', 'M6 9.5a6 6 0 1 1 12 0c0 5 1.8 6 1.8 6H4.2s1.8-1 1.8-6m4.2 9a2.1 2.1 0 0 0 3.6 0'],
  ]],
  ['Tune', [
    ['/settings', 'Prioritisation', 'M5 8h9m4 0h1M5 16h1m4 0h9M14 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM8 13.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z'],
    ['/setup', 'Setup', 'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zm7.5-3.5.9-2.4-2-1.5.1-2.5-2.4-.7-1.2-2.2L12.5 4l-2.4-1.3-1.2 2.2-2.4.7.1 2.5-2 1.5.9 2.4-.9 2.4 2 1.5-.1 2.5 2.4.7 1.2 2.2 2.4-1.3 2.4 1.3 1.2-2.2 2.4-.7-.1-2.5 2-1.5z'],
  ]],
];

function NavIcon({ d }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[18px] shrink-0"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent shadow-lift">
        {/* The mark is the product: five weighted bars, one verdict. */}
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <g fill="var(--color-plane)">
            <rect x="4" y="13" width="2.6" height="7" rx="1.3" />
            <rect x="8.2" y="9.5" width="2.6" height="10.5" rx="1.3" />
            <rect x="12.4" y="6" width="2.6" height="14" rx="1.3" />
            <rect x="16.6" y="10.5" width="2.6" height="9.5" rx="1.3" />
          </g>
        </svg>
      </span>
      <span className="display text-[19px] leading-none text-ink">DeadlineIQ</span>
    </span>
  );
}

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
  const { ranking } = useTasks();
  const [adding, setAdding] = useState(false);
  const [formInitial, setFormInitial] = useState(null);   // UC-005/006 prefill
  const [bulk, setBulk] = useState(null);                 // UC-007: {seedText}
  const [brief, setBrief] = useState(false);              // UC-006
  const [created, setCreated] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function openForm(initial = null) {
    setFormInitial(initial);
    setAdding(true);
  }

  // The dashboard's "three ways in" cards (UC-016 Alt A) open these same
  // entry points from inside a routed page.
  useEffect(() => onCapture((mode) => {
    if (mode === 'form') openForm();
    if (mode === 'nl') focusQuickAdd();
    if (mode === 'brief') setBrief(true);
    if (mode === 'paste') setBulk({ seedText: '' });
  }), []);

  // UC-021 step 2 — overdue is never hidden, so the nav itself carries the
  // count until every one of them has been resolved.
  const overdueCount = (ranking || []).filter((task) => task.status === 'overdue').length;

  const nav = NAV_GROUPS.map(([group, links]) => (
    <div key={group}>
      <p className="px-3 pb-1.5 pt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {group}
      </p>
      {links.map(([to, label, icon]) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) => `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive
              ? 'bg-accent text-plane shadow-lift'
              : 'text-ink2 hover:bg-plane hover:text-ink'
          }`}
        >
          <NavIcon d={icon} />
          <span className="transition-transform group-hover:translate-x-0.5">{label}</span>
          {label === 'Dashboard' && overdueCount > 0 && (
            <span className="num ml-auto rounded-full bg-crittint px-1.5 py-px text-[10px] font-semibold text-crittext">
              {overdueCount}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  ));

  const sidebarFooter = (
    <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 pb-4 pt-3">
      <ThemeToggle />
      <button type="button" onClick={logout} className="text-sm text-muted transition hover:text-ink">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* ── the rail (lg and up) ─────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-surface lg:flex">
        <div className="px-5 pb-2 pt-6">
          <Brand />
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Priority you can check by hand.
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">{nav}</nav>
        {sidebarFooter}
      </aside>

      {/* ── the phone header + slide-over ────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-surface/85 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-9 place-items-center rounded-lg text-ink2 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-5" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Brand />
        <button
          type="button"
          onClick={() => openForm()}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-plane"
        >
          Add
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink/25 backdrop-blur-sm"
          />
          <div className="rise absolute inset-y-0 left-0 flex w-64 flex-col border-r border-hairline bg-surface shadow-pop">
            <div className="px-5 pb-2 pt-6"><Brand /></div>
            <nav className="flex-1 overflow-y-auto px-2 pb-4">{nav}</nav>
            {sidebarFooter}
          </div>
        </div>
      )}

      {/* ── the working column ───────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 lg:pl-60">
        {/* UC-005 step 1 — quick add is on every view, styled as the app's
            command line rather than a second toolbar. */}
        <div className="sticky top-14 z-20 border-b border-hairline bg-plane/85 backdrop-blur lg:top-0">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
            <QuickAddBar
              onParsed={(prefill) => openForm(prefill)}
              onMultiple={(text) => setBulk({ seedText: text })}
              onUploadBrief={() => setBrief(true)}
              onBulkPaste={() => setBulk({ seedText: '' })}
            />
            <button
              type="button"
              onClick={() => openForm()}
              className="hidden shrink-0 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-plane transition hover:opacity-90 lg:block"
            >
              Add task
            </button>
          </div>
        </div>

        <DegradedBanner />
        <main>{children}</main>
      </div>

      {adding && (
        <AddTaskDialog
          initial={formInitial || undefined}
          onClose={() => { setAdding(false); setFormInitial(null); }}
          onCreated={setCreated}
        />
      )}
      {bulk && (
        <BulkImportDialog seedText={bulk.seedText} onClose={() => setBulk(null)} />
      )}
      {brief && (
        <BriefUploadDialog
          onClose={() => setBrief(false)}
          onFallbackForm={(prefill) => openForm(prefill)}
        />
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
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
          <Route path="/completed" element={<Protected><Completed /></Protected>} />
          <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
          <Route path="/focus" element={<Protected><Focus /></Protected>} />
          <Route path="/today" element={<Protected><Today /></Protected>} />
          <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
          <Route path="/tasks/:taskId" element={<Protected><TaskDetail /></Protected>} />
          <Route path="/workload" element={<Protected><Workload /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/setup" element={<Protected><Setup /></Protected>} />
          {/* UC-016 step 1 — "the student signs in and lands on the
              dashboard". It was /focus while the dashboard did not exist. */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </TasksProvider>
    </AuthProvider>
  );
}
