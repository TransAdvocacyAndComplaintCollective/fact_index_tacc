// src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

type ProviderKeys = "discord" | "google" | "facebook" | "bluesky" | "dev" | "admin";
type ProvidersStatus = Partial<Record<ProviderKeys, boolean>>;


export type User = {
  id: string;
  username: string;
  avatar?: string;
  provider?: string;
  profileImage?: string; // admin profile image
};

type Status ={
  authenticated: boolean;
  user?: User | null;
  reason?: string | null;
}
interface AuthContextValue {
  loading: boolean;
  providers: ProvidersStatus;
  authenticated: boolean;
  user: Record<string, User> | null;
  reason: string | null;
  login: (provider: ProviderKeys, adminCreds?: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProvidersStatus>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<Record<string, User> | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/auth/list_auth", { credentials: "include" });
      const data = await res.json();
      setProviders(data || {});
    } catch {
      setProviders({});
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/auth/status", { credentials: "include" });

      let data: Status;
      if (res.ok) {
        data = await res.json();
      } else if (res.status === 401) {
        data = { authenticated: false, reason: "not_logged_in" };
      } else {
        throw new Error("Unexpected response");
      }

      setAuthenticated(Boolean(data.authenticated));
      if(data.user) {
        setUser({ [data.user.id]: data.user });
      } else {
        setUser(null);
      }
      setReason(data.reason || null);
    } catch {
      setAuthenticated(false);
      setUser(null);
      setReason("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    fetchStatus();
  }, [fetchProviders, fetchStatus]);

  const login = async (provider: ProviderKeys, adminCreds?: { username: string; password: string }) => {
    if (!providers[provider]) {
      return Promise.reject(new Error("Provider disabled"));
    }

    if (provider === "admin") {
      if (adminCreds) {
        const res = await fetch("/auth/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username: adminCreds.username.trim(),
            password: adminCreds.password,
          }),
        });

        if (res.ok) {
          await fetchStatus();
          return;
        } else if (res.status === 403) {
          throw new Error("Access denied");
        } else if (res.status === 503) {
          throw new Error("Admin unavailable");
        } else {
          throw new Error("Login failed");
        }
      } else {
        // Let UI show modal
        return Promise.resolve();
      }
    }

    const urls: Record<Exclude<ProviderKeys, "admin">, string> = {
      discord: "/auth/discord/login",
      google: "/auth/google/login",
      facebook: "/auth/facebook/login",
      bluesky: "/auth/bluesky/login",
      dev: "/auth/dev/login",
    };

    window.location.href = urls[provider] || `/auth/${provider}`;
    return Promise.resolve();
  };

  const logout = async () => {
    setLoading(true);
    try {
      await fetch("/auth/logout", { credentials: "include" });
      setAuthenticated(false);
      setUser(null);
      setReason(null);
    } catch {
      setAuthenticated(false);
      setUser(null);
      setReason("network_error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        providers,
        authenticated,
        user,
        reason,
        login,
        logout,
        refresh: fetchStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
}

export function useAuth() {
  const { loading, providers, authenticated, user, reason, login, logout, refresh } = useAuthContext();
  return { loading, providers, authenticated, user, reason, login, logout, refresh };
}
