/**
 * axios instance with the bearer interceptor — UC-001 steps 7 and 9.
 */

import axios from 'axios';

const TOKEN_KEY = 'deadlineiq.token';

export const api = axios.create({
  // Falls back to the local dev API (`npm run dev:api` in backend/), which
  // listens on 3001. Deployed builds set VITE_API_URL to the invoke URL.
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  timeout: 10000,
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * One silent refresh attempt, shared across concurrent 401s so a dashboard
 * firing five requests at once does not fire five refreshes.
 *
 * Uses bare axios rather than `api` — going through the instance would put
 * this call back through the interceptor below and recurse.
 */
let refreshing: Promise<string | null> | null = null;

function refreshToken(): Promise<string | null> {
  if (refreshing) return refreshing;

  const token = getToken();
  refreshing = (token
    ? axios.post(`${api.defaults.baseURL}/api/auth/refresh`, null, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        setToken(response.data.token);
        return response.data.token as string;
      })
      .catch(() => null)
    : Promise.resolve(null)
  ).finally(() => { refreshing = null; }) as Promise<string | null>;

  return refreshing;
}

// UC-001 E3 — on a 401, try one silent refresh and replay the request. Only on
// failure do we redirect, preserving where the student was so the round trip
// through sign-in is invisible.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthCall = String(request?.url || '').includes('/api/auth/');

    if (error.response?.status === 401 && request && !request._retried && !isAuthCall) {
      request._retried = true;

      const fresh = await refreshToken();
      if (fresh) {
        request.headers.Authorization = `Bearer ${fresh}`;
        return api(request);
      }

      setToken(null);

      // Redirecting to /login FROM /login is a reload loop: the page remounts,
      // refetches, gets another 401, and redirects again — several times a
      // second. Any expired token would trigger it, not just a stale one.
      if (window.location.pathname !== '/login') {
        sessionStorage.setItem('deadlineiq.returnTo', window.location.pathname);
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);

/**
 * The `{code, message}` shape every endpoint fails with (HLD §6.1).
 *
 * An unreachable API is reported as exactly that. "Could not sign in" when the
 * server was never contacted sends you looking for the wrong problem.
 */
export function errorMessage(error: any, fallback = 'Something went wrong.'): string {
  if (error?.response?.data?.message) return error.response.data.message;

  if (!error?.response) {
    const where = api.defaults.baseURL || 'the API';
    return `Could not reach the API at ${where}. Is it running?`;
  }

  return fallback;
}

export function errorCode(error: any): string | null {
  return error?.response?.data?.code || null;
}
