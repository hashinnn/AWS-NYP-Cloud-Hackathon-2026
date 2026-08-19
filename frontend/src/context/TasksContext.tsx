/**
 * The one place the ranking lives.
 *
 * Every Intelligence view reads `ranking` from here, and every ranking entry
 * arrives with `priorityScore` and `subScores` already computed by the server.
 * The client never recomputes a sub-score — it only ever re-weights the ones
 * it was given (UC-015), which is why the preview can be instant.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { api, errorMessage, getToken } from '../lib/api';
import { DEFAULT_WEIGHTS, normaliseWeights } from '../lib/priority';
import { registerModuleColours } from '../lib/chartTheme';

const TasksContext = createContext<any>(null);

export function TasksProvider({ children }: { children: any }) {
  const [ranking, setRanking] = useState<any[]>([]);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [prefs, setPrefs] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/ranking');
      setRanking(response.data.ranking || []);
      setWeights(normaliseWeights(response.data.weights));
      setDegraded(false);
      setError(null);
    } catch (caught: any) {
      // UC-016 E1 — never a blank screen: keep whatever we last had, in
      // deadline order, and say so.
      setDegraded(true);
      setError(errorMessage(caught, 'Live prioritisation unavailable — showing deadline order.'));
      setRanking((current) => [...current]
        .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPrefs = useCallback(async () => {
    try {
      const response = await api.get('/api/prefs');
      setPrefs(response.data.prefs);
    } catch {
      setPrefs(null); // views hide the availability control rather than guess
    }
  }, []);

  // UC-004 step 3 — the colours a student chose have to be registered before
  // anything renders a module, or the first paint uses the hashed fallback
  // and then visibly changes colour underneath them.
  const refreshModules = useCallback(async () => {
    try {
      const response = await api.get('/api/modules');
      setModules(response.data.modules || []);
      registerModuleColours(response.data.modules || []);
    } catch {
      setModules([]);
    }
  }, []);

  useEffect(() => {
    // This provider wraps every route, including /login and /register, so
    // without the guard it fires three authenticated requests at a signed-out
    // visitor — each one a 401, each one triggering a redirect.
    if (!getToken()) { setLoading(false); return; }
    refresh();
    refreshPrefs();
    refreshModules();
  }, [refresh, refreshPrefs, refreshModules]);

  const value = useMemo(() => ({
    ranking,
    weights,
    prefs,
    modules,
    loading,
    error,
    degraded,
    refresh,
    refreshPrefs,
    refreshModules,
    setWeights,
    setPrefs,
    active: ranking.filter((task) => task.status === 'active' || task.status === 'overdue'),
  }), [ranking, weights, prefs, modules, loading, error, degraded,
    refresh, refreshPrefs, refreshModules]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  return useContext(TasksContext);
}
