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
  profileImage?: string;
};

export type Status = {
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

// --- helper: set and clear client-side session bits ---
function setSession(provider: ProviderKeys, token: string) {
  try {
    // Cookie so backend can read token on /auth/status (validateAndRefreshStateless looks for cookies.auth_token)
    document.cookie = `auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;

    // Header so backend knows which validator to use
    axios.defaults.headers.common["x-provider"] = provider;
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

    // Persist provider so we can restore header on reload
    localStorage.setItem("auth_provider", provider);
  } catch {
    // ignore
  }
}

function clearSession() {
  try {
    // Expire cookie
    document.cookie = "auth_token=; Max-Age=0; Path=/; SameSite=Lax";

    delete axios.defaults.headers.common["Authorization"];
    delete axios.defaults.headers.common["x-provider"];

    localStorage.removeItem("auth_provider");
  } catch {
    // ignore
  }
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    console.log("[Auth] AuthProvider mounted");
    // restore provider header if we have it
    const p = localStorage.getItem("auth_provider") as ProviderKeys | null;
    if (p) {
      axios.defaults.headers.common["x-provider"] = p;
    }
    return () => console.log("[Auth] AuthProvider unmounted");
  }, []);

  // Providers
  const {
    data: providers = {},
    isLoading: loadingProviders,
  } = useQuery<ProvidersStatus>({
    queryKey: ["auth", "providers"],
    queryFn: async () => {
      try {
        const res = await axios.get<ProvidersStatus>("/auth/list_auth");
        return res.data ?? {};
      } catch {
        return {};
      }
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Status
  const {
    data: status,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = useQuery<Status>({
    queryKey: ["auth", "status"],
    queryFn: async () => {
      try {
        const res = await axios.get("/auth/status");
        if (res.data.authenticated) {
          return {
            authenticated: true,
            user: {
              id: res.data.id,
              username: res.data.username,
              avatar: res.data.avatar,
              provider: res.data.provider,
            },
            reason: null,
          } as Status;
        } else {
          return { authenticated: false, user: null, reason: res.data.reason || "unknown" };
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          return { authenticated: false, user: null, reason: "not_logged_in" };
        }
        return { authenticated: false, user: null, reason: "network_error" };
      }
    },
    refetchOnWindowFocus: false,
  });

  // Memo user
  const user: Record<string, User> | null = useMemo(() => {
    if (!status?.user) return null;
    return { [status.user.id]: status.user };
  }, [status?.user]);

  // Admin login
  const loginAdmin = React.useCallback(
    async (adminCreds?: { username: string; password: string }) => {
      if (!adminCreds) return;
      const res = await axios.post("/auth/admin/login", {
        username: adminCreds.username.trim(),
        password: adminCreds.password,
      });
      if (res.status !== 200) throw new Error("Login failed");
      await refetchStatus();
    },
    [refetchStatus]
  );

  // External login (providers except admin)
  const loginExternal = (provider: Exclude<ProviderKeys, "admin">) => {
    if (provider === "bluesky") {
      const handle = prompt("Enter your Bluesky handle (e.g. alice.bsky.social)");
      if (!handle) return Promise.reject(new Error("No handle provided"));
      return axios
        .post(`/auth/bluesky/login?redirect_uri=${encodeURIComponent(window.location.origin)}`, { handle })
        .then((res) => {
          if (res.request?.responseURL) window.location.href = res.request.responseURL;
        });
    }

    if (provider === "dev") {
      // IMPORTANT: dev login must POST
      return axios.post("/auth/dev/login").then(async (res) => {
        const token = res.data?.token as string | undefined;
        if (!token) throw new Error("Dev login failed: no token");
        setSession("dev", token);
        await refetchStatus();
      });
    }

    const urls: Record<Exclude<ProviderKeys, "admin">, string> = {
      discord: "/auth/discord/login",
      google: "/auth/google/login",
      facebook: "/auth/facebook/login",
      bluesky: "", // handled above
      dev: "", // handled above
    };
    window.location.href = urls[provider] || `/auth/${provider}`;
    return Promise.resolve();
  };

  const login = React.useCallback(
    async (provider: ProviderKeys, adminCreds?: { username: string; password: string }) => {
      if (providers[provider] !== true) return Promise.reject(new Error("Provider disabled"));
      if (provider === "admin") return loginAdmin(adminCreds);
      return loginExternal(provider);
    },
    [loginAdmin, providers]
  );

  // Logout
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await axios.get("/auth/logout");
    },
    onSettled: async () => {
      clearSession();
      await refetchStatus();
      await queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
    },
  });

  const refresh = React.useCallback(async () => {
    await refetchStatus();
    await queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
  }, [refetchStatus, queryClient]);

  const value: AuthContextValue = useMemo(
    () => ({
      loading: loadingProviders || loadingStatus,
      providers,
      authenticated: status?.authenticated ?? false,
      user,
      reason: status?.reason ?? null,
      login,
      logout: async () => {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}

export function useAuth() {
  return useAuthContext();
}

interface AuthProviderWithQueryClientProps {
  readonly children: ReactNode;
}

export function AuthProviderWithQueryClient({ children }: AuthProviderWithQueryClientProps) {
  const queryClient = React.useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
