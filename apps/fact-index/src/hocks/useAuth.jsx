// /src/hooks/useAuth.jsx
//
// Stateless JWT auth using:
// - Zustand for global auth state (no provider needed)
// - Axios interceptors for attaching tokens + refresh-on-401
// - TanStack Query for /auth/me query + mutations
// - jose decodeJwt for exp checks (decode only; does not verify signature)
//
// Storage choice: access token in localStorage (simple; XSS can steal it)

import { useCallback, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { decodeJwt } from "jose";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// -------------------- Config --------------------
const TOKEN_KEY = "access_token";
const API_BASE_URL = import.meta?.env?.VITE_API_BASE_URL ?? ""; // or CRA: process.env.REACT_APP_API_BASE_URL

const ENDPOINTS = {
  login: "/auth/login", // POST -> { accessToken, user? }
  refresh: "/auth/refresh", // POST -> { accessToken }
  logout: "/auth/logout", // POST -> 200/204
  me: "/auth/me", // GET  -> { user } or user
  health: "/health", // GET  -> optional
};

function joinUrl(base, path) {
  if (!base) return path;
  const b = String(base).replace(/\/+$/, "");
  const p = String(path).startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

// -------------------- Token helpers --------------------
function getAccessTokenLS() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAccessTokenLS(token) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function safeDecode(token) {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

function isTokenExpiredOrNearExpiry(token, skewSeconds = 30) {
  const payload = safeDecode(token);
  if (!payload || typeof payload.exp !== "number") return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + skewSeconds;
}

// -------------------- Zustand store --------------------
export const useAuthStore = create((set) => ({
  accessToken: getAccessTokenLS(),
  user: null,
  authenticated: false,
  reason: getAccessTokenLS() ? null : "no_token",
  loginAttempted: false,
  bootstrapped: false,

  setLoginAttempted: (v) => set({ loginAttempted: !!v }),
  setBootstrapped: (v) => set({ bootstrapped: !!v }),
  setReason: (reason) => set({ reason: reason ?? null }),

  setToken: (token) => {
    const next = token || null;
    setAccessTokenLS(next);
    set((s) => ({
      accessToken: next,
      authenticated: !!next && !!s.user,
      reason: next ? null : "no_token",
    }));
  },

  setUser: (user) => {
    set((s) => ({
      user: user ?? null,
      authenticated: !!(user && s.accessToken),
    }));
  },

  clear: (reason = "not_logged_in") => {
    setAccessTokenLS(null);
    set({
      accessToken: null,
      user: null,
      authenticated: false,
      reason,
      bootstrapped: true,
    });
  },
}));

// ✅ Selector defined once (helps stability/debugging)
const selectAuthSlice = (s) => ({
  accessToken: s.accessToken,
  user: s.user,
  authenticated: s.authenticated,
  reason: s.reason,
  loginAttempted: s.loginAttempted,
  bootstrapped: s.bootstrapped,

  setToken: s.setToken,
  setUser: s.setUser,
  setReason: s.setReason,
  setLoginAttempted: s.setLoginAttempted,
  setBootstrapped: s.setBootstrapped,
  clear: s.clear,
});

// ✅ useShallow memoizes snapshot when shallow-equal (fixes getSnapshot warning)
function useAuthSlice() {
  return useAuthStore(useShallow(selectAuthSlice));
}

// -------------------- Axios client (per-hook instance) --------------------
function createApiClient({ onAuthFailure, refreshAccessToken }) {
  const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, // if refresh uses cookies; harmless otherwise
  });

  api.interceptors.request.use((config) => {
    const token = getAccessTokenLS();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  let refreshPromise = null;

  api.interceptors.response.use(
    (res) => res,
    async (error) => {
      const original = error?.config;
      const status = error?.response?.status;

      if (!original || status !== 401) return Promise.reject(error);

      // prevent infinite loop
      if (original.__isRetryRequest) {
        onAuthFailure?.("invalid_token");
        return Promise.reject(error);
      }
      original.__isRetryRequest = true;

      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }

        const newToken = await refreshPromise;
        if (!newToken) {
          onAuthFailure?.("token_expired");
          return Promise.reject(error);
        }

        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      } catch (e) {
        onAuthFailure?.("token_expired");
        return Promise.reject(e);
      }
    }
  );

  return api;
}

// -------------------- React Query keys --------------------
const qk = {
  me: ["auth", "me"],
};

// -------------------- Main hook --------------------
export function useAuth() {
  const queryClient = useQueryClient();

  const {
    accessToken,
    user,
    authenticated,
    reason,
    loginAttempted,
    bootstrapped,
    setToken,
    setUser,
    setReason,
    setLoginAttempted,
    setBootstrapped,
    clear,
  } = useAuthSlice();

  // Extract JWT token from URL query parameters (OAuth callback)
  useEffect(() => {
    if (bootstrapped) return; // Only do this once at startup

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');

    if (tokenFromUrl) {
      // Store token and remove from URL
      setToken(tokenFromUrl);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (!accessToken) {
      // No token in URL and no token in storage = not authenticated
      setBootstrapped(true);
    }
  }, [bootstrapped, accessToken, setToken, setBootstrapped]);

  // If there's no token, we're "bootstrapped" immediately.
  useEffect(() => {
    if (!accessToken && !bootstrapped) {
      clear("no_token");
    }
  }, [accessToken, bootstrapped, clear]);

  // Refresh (used by interceptor + manual refresh)
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(
        joinUrl(API_BASE_URL, ENDPOINTS.refresh),
        {},
        { withCredentials: true }
      );
      const newToken = res?.data?.accessToken ?? null;
      if (newToken) setToken(newToken);
      return newToken;
    },
    onError: () => {
      clear("token_expired");
    },
  });

  const refreshAccessToken = useCallback(async () => {
    return await refreshMutation.mutateAsync();
  }, [refreshMutation]);

  const onAuthFailure = useCallback(
    (r) => {
      clear(r || "invalid_token");
      queryClient.removeQueries({ queryKey: qk.me });
    },
    [clear, queryClient]
  );

  const api = useMemo(() => {
    return createApiClient({ onAuthFailure, refreshAccessToken });
  }, [onAuthFailure, refreshAccessToken]);

  // /auth/me query (only runs when we have a token)
  const meQuery = useQuery({
    queryKey: qk.me,
    enabled: !!accessToken,
    retry: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      const token = accessToken || getAccessTokenLS();
      if (!token) throw Object.assign(new Error("no_token"), { code: "no_token" });

      // proactive refresh if expiring/expired
      if (isTokenExpiredOrNearExpiry(token)) {
        const newToken = await refreshAccessToken();
        if (!newToken) throw Object.assign(new Error("token_expired"), { code: "token_expired" });
      }

      const res = await api.get(ENDPOINTS.me);
      return res.data?.user ?? res.data;
    },
  });

  // ✅ TanStack Query v5: move query side-effects here (no onSuccess/onError on useQuery)
  useEffect(() => {
    if (!accessToken) return;

    if (meQuery.status === "success") {
      setUser(meQuery.data ?? null);
      setReason(null);
      setBootstrapped(true);
      return;
    }

    if (meQuery.status === "error") {
      const err = meQuery.error;
      const code = err?.code;

      if (code === "token_expired") clear("token_expired");
      else if (code === "no_token") clear("no_token");
      else if (err?.response?.status === 401) clear("invalid_token");
      else clear("not_logged_in");

      setBootstrapped(true);
    }
  }, [
    accessToken,
    meQuery.status,
    meQuery.data,
    meQuery.error,
    setUser,
    setReason,
    setBootstrapped,
    clear,
  ]);

  // Login mutation (example: email/password; adapt payload to your API)
  const loginMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await axios.post(
        joinUrl(API_BASE_URL, ENDPOINTS.login),
        payload,
        { withCredentials: true }
      );
      const token = res?.data?.accessToken;
      if (!token) throw new Error("login_missing_token");

      setToken(token);

      // optional: accept user from login response
      const maybeUser = res?.data?.user ?? null;
      if (maybeUser) setUser(maybeUser);

      return { token, user: maybeUser };
    },
    onSuccess: async () => {
      setReason(null);
      setBootstrapped(false); // we’re about to fetch /me
      await queryClient.invalidateQueries({ queryKey: qk.me });
    },
    onError: () => {
      clear("invalid_credentials");
      queryClient.removeQueries({ queryKey: qk.me });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await axios.post(
          joinUrl(API_BASE_URL, ENDPOINTS.logout),
          {},
          { withCredentials: true }
        );
      } catch {
        // best effort
      } finally {
        clear("not_logged_in");
      }
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: qk.me });
    },
  });

  const login = useCallback(
    async (payload) => {
      setLoginAttempted(true);
      return await loginMutation.mutateAsync(payload);
    },
    [loginMutation, setLoginAttempted]
  );

  const logout = useCallback(async () => {
    return await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const refresh = useCallback(async () => {
    const token = await refreshAccessToken();
    if (token) {
      setReason(null);
      await queryClient.invalidateQueries({ queryKey: qk.me });
    }
    return token;
  }, [refreshAccessToken, queryClient, setReason]);

  const checkAvailable = useCallback(async () => {
    try {
      await api.get(ENDPOINTS.health);
      return true;
    } catch {
      return false;
    }
  }, [api]);

  // Loading: query + mutations + bootstrap
  const loading =
    !bootstrapped ||
    meQuery.isLoading ||
    loginMutation.isPending ||
    logoutMutation.isPending ||
    refreshMutation.isPending;

  // Auto-logout (kept from your original intent)
  const autoLogoutDone = useRef(false);
  useEffect(() => {
    if (!loading && !authenticated && reason) {
      const AUTO_LOGOUT_REASONS = new Set([
        "not_logged_in",
        "invalid_token",
        "no_token",
        "token_expired",
        "unexpected_error",
        "bad_payload",
        "bad_json",
        "discord_error",
        "invalid_credentials",
      ]);

      if (!AUTO_LOGOUT_REASONS.has(String(reason))) return;
      if (autoLogoutDone.current) return;
      autoLogoutDone.current = true;

      clear(String(reason));
      queryClient.removeQueries({ queryKey: qk.me });
    }
  }, [loading, authenticated, reason, clear, queryClient]);

  return {
    loading,
    authenticated,
    user: user ?? null,
    reason,

    // actions
    login,
    logout,
    refresh,
    checkAvailable,

    // flags
    loginAttempted,
    setLoginAttempted,

    // axios instance (optional)
    api,
  };
}

/*
  Reminder: You still need QueryClientProvider at the app root for TanStack Query.

  Zustand needs no provider.
*/
