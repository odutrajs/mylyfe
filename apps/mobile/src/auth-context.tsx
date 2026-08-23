import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, ApiError, clearAuthToken, readAuthToken, writeAuthToken, type AuthResult, type PublicSession } from "./api";

type AuthContextValue = {
  ready: boolean;
  session: PublicSession | null;
  pendingSession: PublicSession | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<PublicSession>;
  enterApp: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const persistAuth = async (result: AuthResult) => {
  await writeAuthToken(result.token);
  return result.session;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [pendingSession, setPendingSession] = useState<PublicSession | null>(null);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const token = await readAuthToken();
        if (!token) return;
        const response = await apiRequest("/auth/me", undefined, token);
        const payload = (await response.json()) as { session: PublicSession };
        if (active) setSession(payload.session);
      } catch {
        await clearAuthToken();
      } finally {
        if (active) setReady(true);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      pendingSession,
      login: async (email, password) => {
        const response = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        setPendingSession(null);
        setSession(await persistAuth((await response.json()) as AuthResult));
      },
      register: async (name, email, password, phone) => {
        const response = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password, phone: phone?.trim() || undefined })
        });
        const next = await persistAuth((await response.json()) as AuthResult);
        setPendingSession(next);
        return next;
      },
      enterApp: () => {
        if (pendingSession) setSession(pendingSession);
        setPendingSession(null);
      },
      logout: async () => {
        try {
          await apiRequest("/auth/logout", { method: "POST" });
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
        await clearAuthToken();
        setPendingSession(null);
        setSession(null);
      },
      deleteAccount: async () => {
        await apiRequest("/auth/me", { method: "DELETE" });
        await clearAuthToken();
        setPendingSession(null);
        setSession(null);
      }
    }),
    [pendingSession, ready, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return context;
};

export const useAuthSession = () => {
  const { session, pendingSession } = useAuth();
  return session ?? pendingSession;
};
