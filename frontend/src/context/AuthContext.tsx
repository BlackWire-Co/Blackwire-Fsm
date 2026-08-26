import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken, clearToken, isAuthed } from "../api/client";

interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: ("ADMIN" | "OFFICE" | "TECHNICIAN")[];
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: CurrentUser["roles"]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthed()) {
      setLoading(false);
      return;
    }
    api<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api<{ token: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    clearToken();
    setUser(null);
    window.location.href = "/login";
  }

  function hasRole(...roles: CurrentUser["roles"]) {
    return Boolean(user && roles.some((r) => user.roles.includes(r)));
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
