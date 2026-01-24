// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const AuthContext = createContext(null);

const AUTH_STATUS_KEY = ["auth", "status"];
const JWT_TOKEN_KEY = "auth_jwt_token";

function readStoredToken() {
  try {
    return localStorage.getItem(JWT_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    if (!token) return;
    localStorage.setItem(JWT_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(JWT_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Helper to get JWT token from localStorage or URL query parameter (?token=...)
 * - Stores URL token into localStorage
 * - Removes ONLY the token param, preserving any other query params/hash
 */
function getJWTToken() {
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

async function fetchAuthStatus({ signal }) {
  try {
    const token = getJWTToken();
    const headers = { Accept: "application/json" };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/auth/status", {
      credentials: "include",
      signal,
      headers,
    });

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    // If server rotates JWT (optional), accept it.
    if (json && typeof json === "object" && typeof json.token === "string") {
      const current = readStoredToken();
      if (json.token && json.token !== current) {
        storeToken(json.token);
      }
    }

    // Normalize shape: { discord: {...} }
    if (!json || typeof json !== "object") {
      return { discord: { authenticated: false, user: null, reason: "bad_json" } };
    }
    if (!json.discord) {
      return { discord: { authenticated: false, user: null, reason: "bad_payload" } };
    }
    return json;
  } catch {
    return { discord: { authenticated: false, user: null, reason: "network_error" } };
  }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  // Pull token from URL on mount and refresh auth status
  useEffect(() => {
    const token = getJWTToken();
    if (token) {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    }
  }, [queryClient]);

  // Cross-tab sync: if another tab logs in/out, reflect it here.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === JWT_TOKEN_KEY) {
        queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  const statusQuery = useQuery({
    queryKey: AUTH_STATUS_KEY,
    queryFn: fetchAuthStatus,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    retry: 0,
  });

  // If token is invalid, clear it once to avoid "forever invalid" loops.
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
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/auth/available", {
        credentials: "include",
        headers,
      });

      if (!res.ok) return { available: false };
      return await res.json();
    } catch {
      return { available: false };
    }
  }, []);

  /**
   * Starts OAuth flow.
   * - Uses /auth/available to pick the correct provider URL (dev-bypass vs real OAuth).
   */
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

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const token = getJWTToken();
      const headers = { "Content-Type": "application/json" };
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

  const discord = statusQuery.data?.discord || {};
  const authenticated = Boolean(discord.authenticated);
  const user = discord.user ?? null;
  const reason = discord.reason ?? null;

  const refresh = useCallback(
    () => statusQuery.refetch({ cancelRefetch: false }),
    [statusQuery]
  );

  const logoutFn = useCallback(() => logoutMutation.mutateAsync(), [logoutMutation]);

  const value = useMemo(
    () => ({
      loading: statusQuery.isInitialLoading || statusQuery.isFetching,
      authenticated,
      user,
      reason,
      login: loginWithCheck,
      refresh,
      logout: logoutFn,
      checkAvailable,
    }),
    [
      statusQuery.isInitialLoading,
      statusQuery.isFetching,
      authenticated,
      user,
      reason,
      loginWithCheck,
      refresh,
      logoutFn,
      checkAvailable,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}

// Helper function to get JWT token for API requests
export function getAuthToken() {
  return getJWTToken();
}

// Helper function to create authenticated fetch headers
export function getAuthHeaders(additionalHeaders = {}) {
  const token = getJWTToken();
  const headers = { ...additionalHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
