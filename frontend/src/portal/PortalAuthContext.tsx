import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { portalApi, setPortalToken, clearPortalToken, isPortalAuthed } from "./api";

interface PortalCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface PortalAuthValue {
  customer: PortalCustomer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
  logout: () => void;
}

const PortalAuthContext = createContext<PortalAuthValue | undefined>(undefined);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPortalAuthed()) {
      setLoading(false);
      return;
    }
    portalApi<PortalCustomer>("/auth/me")
      .then(setCustomer)
      .catch(() => clearPortalToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await portalApi<{ token: string; customer: PortalCustomer }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setPortalToken(res.token);
    setCustomer(res.customer);
  }

  async function acceptInvite(token: string, password: string) {
    const res = await portalApi<{ token: string; customer: PortalCustomer }>("/auth/accept-invite", {
      method: "POST",
      body: { token, password },
    });
    setPortalToken(res.token);
    setCustomer(res.customer);
  }

  function logout() {
    clearPortalToken();
    setCustomer(null);
    window.location.href = "/portal/login";
  }

  return (
    <PortalAuthContext.Provider value={{ customer, loading, login, acceptInvite, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
