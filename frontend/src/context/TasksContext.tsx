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
import { api, errorMessage } from '../lib/api';
import { DEFAULT_WEIGHTS, normaliseWeights } from '../lib/priority';

const TasksContext = createContext<any>(null);

export function TasksProvider({ children }: { children: any }) {
  const [ranking, setRanking] = useState<any[]>([]);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [prefs, setPrefs] = useState<any>(null);
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
      setPrefs(null); // UC-004 not deployed yet — views hide the control
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshPrefs();
  }, [refresh, refreshPrefs]);

  const value = useMemo(() => ({
    ranking,
    weights,
    prefs,
    loading,
    error,
    degraded,
    refresh,
    refreshPrefs,
    setWeights,
    setPrefs,
    active: ranking.filter((task) => task.status === 'active' || task.status === 'overdue'),
  }), [ranking, weights, prefs, loading, error, degraded, refresh, refreshPrefs]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  return useContext(TasksContext);
}
