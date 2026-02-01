import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryObserverResult,
} from "@tanstack/react-query";
import type { AuthReason, AuthStatus, UserProfile } from "@factdb/types";

interface ProviderOption {
  name?: string;
  url?: string;
  available?: boolean;
}

interface AuthStatusResponse {
  discord: AuthStatus;
  token?: string;
}

export type LoginProviderPayload = ProviderOption;

const defaultProviders: LoginProviderPayload[] = [
  {
    name: "Discord",
    url: "/auth/discord",
    available: true,
  },
];

function filterProviders(providers?: LoginProviderPayload[]): LoginProviderPayload[] {
  if (!providers?.length) return defaultProviders;
  const available = providers.filter((provider) => provider?.url && provider.available !== false);
  return available.length > 0 ? available : defaultProviders;
}

const AUTH_STATUS_KEY = ["auth", "status"];
const JWT_TOKEN_KEY = "auth_jwt_token";

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(JWT_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (!token) return;
    localStorage.setItem(JWT_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(JWT_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function getJWTToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const url = new URL(window.location.href);
    const urlToken = url.searchParams.get("token");

    if (urlToken) {
      storeToken(urlToken);
      url.searchParams.delete("token");

      const next =
        url.pathname +
        (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
        (url.hash || "");

      window.history.replaceState({}, document.title, next);
      return urlToken;
    }
  } catch {
    // ignore URL parsing errors
  }

  return readStoredToken();
}

async function fetchAuthStatus({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<AuthStatusResponse> {
  try {
    const token = getJWTToken();
    const headers: Record<string, string> = { Accept: "application/json" };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/auth/status", {
      credentials: "include",
      signal,
      headers,
    });

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (json && typeof json === "object") {
      const tokenValue = (json as { token?: string }).token;
      if (tokenValue && tokenValue !== readStoredToken()) {
        storeToken(tokenValue);
      }
    }

    if (!json || typeof json !== "object") {
      return { discord: { authenticated: false, user: null, reason: "bad_json" } };
    }
    const normalized = json as AuthStatusResponse;
    if (!normalized.discord) {
      return { discord: { authenticated: false, user: null, reason: "bad_payload" } };
    }
    return normalized;
  } catch {
    return { discord: { authenticated: false, user: null, reason: "network_error" } };
  }
}

function getAuthHeaders(
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const token = getJWTToken();
  const headers: Record<string, string> = { ...additionalHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function getAuthToken(): string | null {
  return getJWTToken();
}

export interface AuthContextValue {
  loading: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  user: UserProfile | null;
  reason: AuthReason | string | null;
  login: (fallbackUrl?: string) => Promise<void>;
  refresh: () => Promise<QueryObserverResult<AuthStatusResponse>>;
  logout: () => Promise<void>;
  checkAvailable: () => Promise<{ available: boolean; providers?: ProviderOption[] }>;
  authAvailable: boolean;
  providerOptions: LoginProviderPayload[];
  errorReason: string | null;
  reasonCode: string | null;
  userMessage: string | null;
  showHelp: boolean;
  helpToggle: (event?: MouseEvent<HTMLButtonElement>) => void;
}

export function useAuth(): AuthContextValue {
  const queryClient = useQueryClient();
  const [authAvailable, setAuthAvailable] = useState(true);
  const [providerOptions, setProviderOptions] = useState<LoginProviderPayload[]>(defaultProviders);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const checkAuth = async () => {
      try {
        const res = await fetch("/auth/available", { signal: controller.signal });
        if (!mounted) return;

        let payload: { available?: boolean; providers?: LoginProviderPayload[] } | null = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }

        if (!mounted) return;
        setAuthAvailable(Boolean(payload?.available) || res.ok);
        if (!mounted) return;

        setProviderOptions(filterProviders(payload?.providers));
      } catch {
        if (!mounted) return;
        setAuthAvailable(false);
      }
    };

    checkAuth();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const reason = qp.get("reason");
    const rcode = qp.get("reasonCode");
    const um = qp.get("userMessage");

    if (!reason && !rcode && !um) return;

    Promise.resolve().then(() => {
      if (reason) setErrorReason(reason);
      if (rcode) setReasonCode(rcode);
      if (um) setUserMessage(um);
    });
  }, []);

  const helpToggle = useCallback((event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    setShowHelp((current) => !current);
  }, []);

  const statusQuery = useQuery<AuthStatusResponse>({
    queryKey: AUTH_STATUS_KEY,
    queryFn: fetchAuthStatus,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    retry: 0,
  });

  useEffect(() => {
    const reason = statusQuery.data?.discord?.reason;
    const token = readStoredToken();
    if (token && (reason === "invalid_token" || reason === "jwt_invalid" || reason === "jwt_expired")) {
      clearStoredToken();
      queryClient.setQueryData(AUTH_STATUS_KEY, {
        discord: { authenticated: false, user: null, reason: "invalid_token" },
      });
    }
  }, [statusQuery.data, queryClient]);

  const checkAvailable = useCallback(async () => {
    try {
      const token = getJWTToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/auth/available", {
        credentials: "include",
        headers,
      });

      if (!res.ok) return { available: false };
      return (await res.json()) as { available: boolean; providers?: ProviderOption[] };
    } catch {
      return { available: false };
    }
  }, []);

  const loginWithCheck = useCallback(
    async (fallbackUrl = "/auth/discord") => {
      const avail = await checkAvailable();

      const provider =
        avail?.providers?.find((p) => p?.name === "discord" && p?.available) ||
        avail?.providers?.find((p) => p?.available);

      const ok = Boolean(avail?.available) && Boolean(provider?.url || fallbackUrl);
      if (!ok) throw new Error("Login currently unavailable");

      window.location.href = provider?.url || fallbackUrl;
    },
    [checkAvailable]
  );

  const logoutMutation = useMutation<void, Error>({
    mutationFn: async () => {
      const token = getJWTToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Logout failed");

      clearStoredToken();
    },
    onSettled: () => {
      const desired = { discord: { authenticated: false, user: null, reason: null } };
      const current = queryClient.getQueryData(AUTH_STATUS_KEY);
      try {
        if (JSON.stringify(current) !== JSON.stringify(desired)) {
          queryClient.setQueryData(AUTH_STATUS_KEY, desired);
        }
      } catch {
        queryClient.setQueryData(AUTH_STATUS_KEY, desired);
      }
    },
  });

  const discord: AuthStatus =
    statusQuery.data?.discord ?? { authenticated: false, user: null, reason: null };
  const authenticated = Boolean(discord.authenticated);
  const user = (discord.user ?? null) as UserProfile | null;
  const reason = discord.reason ?? null;
  const isAdmin = Boolean(discord.user?.isAdmin);

  const refresh = useCallback(
    () => statusQuery.refetch({ cancelRefetch: false }),
    [statusQuery]
  );

  const logoutFn = useCallback(() => logoutMutation.mutateAsync(), [logoutMutation]);

  const baseValue = useMemo<AuthContextValue>(
    () => ({
      loading: statusQuery.isInitialLoading || statusQuery.isFetching,
      authenticated,
      isAdmin,
      user,
      reason,
      login: loginWithCheck,
      refresh,
      logout: logoutFn,
      checkAvailable,
    }),
    [statusQuery.isFetching, statusQuery.isInitialLoading, authenticated, isAdmin, user, reason, loginWithCheck, refresh, logoutFn, checkAvailable]
  );

  return useMemo<AuthContextValue>(
    () => ({
      ...baseValue,
      authAvailable,
      providerOptions,
      errorReason,
      reasonCode,
      userMessage,
      showHelp,
      helpToggle,
    }),
    [baseValue, authAvailable, providerOptions, errorReason, reasonCode, userMessage, showHelp, helpToggle]
  );
}

export type { AuthStatusResponse };
