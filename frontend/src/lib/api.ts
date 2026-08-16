/**
 * axios instance with the bearer interceptor.
 *
 * PROVISIONAL: this file belongs to Philena's [P-04]. Written here so the
 * Intelligence views can be built and run before the shell lands — replace or
 * reconcile freely.
 */

import axios from 'axios';

const TOKEN_KEY = 'deadlineiq.token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null);
      // Preserve where they were so the round trip through login is invisible.
      sessionStorage.setItem('deadlineiq.returnTo', window.location.pathname);
      window.location.assign('/login');
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
