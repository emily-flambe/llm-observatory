import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean | null; // null = loading
  email: string | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: null,
  email: null,
  isLoading: true
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: null,
    email: null,
    isLoading: true
  });

  useEffect(() => {
    fetch('/api/admin/auth/check', { credentials: 'include' })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data: { authenticated: boolean; email: string }) => setAuth({ isAuthenticated: true, email: data.email, isLoading: false }))
      .catch(() => setAuth({ isAuthenticated: false, email: null, isLoading: false }));
  }, []);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
