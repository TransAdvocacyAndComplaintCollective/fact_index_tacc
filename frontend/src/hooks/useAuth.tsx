// src/context/AuthContext.tsx
import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";
import axios from "axios";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

export type ProviderKeys =
  | "discord"
  | "google"
  | "facebook"
  | "bluesky"
  | "dev"
  | "admin";
type ProvidersStatus = Partial<Record<ProviderKeys, boolean>>;

export type User = {
  id: string;
  username: string;
  avatar?: string;
  provider?: string;
  profileImage?: string; // admin profile image
};

type Status = {
  authenticated: boolean;
  user?: User | null;
  reason?: string | null;
};

interface AuthContextValue {
  loading: boolean;
  providers: ProvidersStatus;
  authenticated: boolean;
  user: Record<string, User> | null;
  reason: string | null;
  login: (
    provider: ProviderKeys,
    adminCreds?: { username: string; password: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

axios.defaults.withCredentials = true;

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient();

  // --- Logging: Mount
  React.useEffect(() => {
    console.log("[Auth] AuthProvider mounted");
    return () => console.log("[Auth] AuthProvider unmounted");
  }, []);

  // Fetch provider statuses
  const {
    data: providers = {},
    isLoading: loadingProviders,
  } = useQuery<ProvidersStatus>({
    queryKey: ["auth", "providers"],
    queryFn: async () => {
      console.log("[Auth] Fetching provider statuses");
      try {
        const res = await axios.get<ProvidersStatus>("/auth/list_auth");
        console.log("[Auth] Provider statuses fetched", res.data);
        return res.data ?? {};
      } catch (err) {
        console.error("[Auth] Error fetching provider statuses", err);
        return {};
      }
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch login status and user info
  const {
    data: status,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = useQuery<Status>({
    queryKey: ["auth", "status"],
    queryFn: async () => {
      console.log("[Auth] Fetching auth status");
      try {
        const res = await axios.get<Status>("/auth/status");
        console.log("[Auth] Auth status fetched", res.data);
        return res.data;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 401) {
            console.warn("[Auth] Not authenticated (401)");
            return { authenticated: false, user: null, reason: "not_logged_in" };
          }
        }
        console.error("[Auth] Error fetching auth status", err);
        return { authenticated: false, user: null, reason: "network_error" };
      }
    },
    refetchOnWindowFocus: false,
  });

  // Memo user object as { id: user }
  const user: Record<string, User> | null = useMemo(() => {
    if (!status?.user) {
      console.log("[Auth] No user in status");
      return null;
    }
    console.log("[Auth] Memoizing user", status.user);
    return { [status.user.id]: status.user };
  }, [status?.user]);

  // --- LOGIN MUTATION ---
  const loginAdmin = React.useCallback(async (adminCreds?: { username: string; password: string }) => {
    if (!adminCreds) {
      console.warn("[Auth] No admin credentials provided");
      return; // Let UI prompt
    }
    try {
      console.log("[Auth] Attempting admin login", adminCreds.username);
      const res = await axios.post("/auth/admin/login", {
        username: adminCreds.username.trim(),
        password: adminCreds.password,
      });
      if (res.status === 200) {
        console.log("[Auth] Admin login success");
        await refetchStatus();
        return;
      }
      console.error("[Auth] Admin login failed (not 200)");
      throw new Error("Login failed");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403) {
          console.error("[Auth] Admin login: Access denied (403)");
          throw new Error("Access denied");
        }
        if (err.response?.status === 503) {
          console.error("[Auth] Admin login: Admin unavailable (503)");
          throw new Error("Admin unavailable");
        }
      }
      console.error("[Auth] Admin login failed", err);
      throw new Error("Login failed");
    }
  }, [refetchStatus]);

  const loginExternal = (provider: Exclude<ProviderKeys, "admin">) => {
    const urls: Record<Exclude<ProviderKeys, "admin">, string> = {
      discord: "/auth/discord/login",
      google: "/auth/google/login",
      facebook: "/auth/facebook/login",
      bluesky: "/auth/bluesky/login",
      dev: "/auth/dev/login",
    };
    console.log("[Auth] Redirecting for external login:", provider, "→", urls[provider]);
    window.location.href = urls[provider] || `/auth/${provider}`;
    return Promise.resolve();
  };

  // login mutation (not using react-query mutation since we want to redirect for external)
  const login = React.useCallback(
    async (provider: ProviderKeys, adminCreds?: { username: string; password: string }): Promise<void> => {
      console.log("[Auth] Login called", { provider, hasAdminCreds: !!adminCreds });
      if (providers[provider] !== true) {
        console.warn("[Auth] Login: Provider disabled:", provider);
        return Promise.reject(new Error("Provider disabled"));
      }
      if (provider === "admin") {
        return loginAdmin(adminCreds);
      }
      return loginExternal(provider);
    },
    [loginAdmin, providers]
  );

  // --- LOGOUT MUTATION ---
  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("[Auth] Logging out...");
      await axios.post("/auth/logout");
    },
    onSettled: async () => {
      console.log("[Auth] Logout settled: refetching status & invalidating queries");
      await refetchStatus();
      await queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
    },
  });

  // --- Refresh just refetches status
  const refresh = React.useCallback(async () => {
    console.log("[Auth] Refresh called");
    await refetchStatus();
    await queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
  }, [refetchStatus, queryClient]);

  // --- State composition
  const value: AuthContextValue = useMemo(
    () => ({
      loading: loadingProviders || loadingStatus,
      providers,
      authenticated: status?.authenticated ?? false,
      user,
      reason: status?.reason ?? null,
      login,
      logout: async () => {
        console.log("[Auth] logout() called from context");
        await logoutMutation.mutateAsync();
      },
      refresh,
    }),
    [
      loadingProviders,
      loadingStatus,
      providers,
      status?.authenticated,
      user,
      status?.reason,
      login,
      logoutMutation,
      refresh,
    ]
  );

  React.useEffect(() => {
    console.log("[Auth] Auth context value changed", value);
  }, [value]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// --- Helper hooks ---

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    console.error("[Auth] useAuthContext used outside AuthProvider");
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
}

export function useAuth() {
  return useAuthContext();
}

// --- QueryClientProvider Wrapper ---
// Use this at your app root if not already using it elsewhere
interface AuthProviderWithQueryClientProps {
  readonly children: ReactNode;
}

export function AuthProviderWithQueryClient({ children }: AuthProviderWithQueryClientProps) {
  const queryClient = useMemo(() => {
    console.log("[Auth] Creating QueryClient");
    return new QueryClient();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
