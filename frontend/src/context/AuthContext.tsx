/**
 * Session state — UC-001. Holds the token and the signed-in student.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

type User = { userId: string; displayName?: string; email?: string; tz?: string } | null;

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: any }) {
  const [user, setUser] = useState<User>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.get('/api/users/me')
      .then((response) => setUser(response.data.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    isAuthenticated: Boolean(user) || Boolean(getToken()),
    async login(email: string, password: string) {
      const response = await api.post('/api/auth/login', { email, password });
      setToken(response.data.token);
      setUser(response.data.user);
      return response.data.user;
    },
    // UC-001 steps 2–7. The server also writes the default PREFS item, so
    // scoring has a capacity model before the first task is added.
    async register(displayName: string, email: string, password: string) {
      const response = await api.post('/api/auth/register', {
        displayName,
        email,
        password,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setToken(response.data.token);
      setUser(response.data.user);
      return response.data.user;
    },
    logout() {
      setToken(null);
      setUser(null);
    },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
