import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
  tenantName: string;
}

interface AuthState {
  user: StaffUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api
      .get<{ type: string; user?: StaffUser }>("/api/auth/me")
      .then((r) => { if (r.type === "staff" && r.user) setUser(r.user); else setToken(null); })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const r = await api.post<{ token: string; user: StaffUser }>("/api/auth/staff/login", { email, password });
        setToken(r.token);
        setUser(r.user);
      },
      logout: () => { setToken(null); setUser(null); },
    }),
    [user, loading],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  COMPANY_ADMIN: "Company Admin",
  BRANCH_MANAGER: "Branch Manager",
  SALES_STAFF: "Sales",
  INVENTORY_STAFF: "Inventory",
  ANALYST: "Analyst",
};
export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}
