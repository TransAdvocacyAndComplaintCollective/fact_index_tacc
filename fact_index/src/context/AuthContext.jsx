// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext();

/**
 * Provides authentication context for the app.
 * - Manages minimal user state (only id, guild, hasRole if present).
 * - Handles session expiry, logout, and refetch.
 */
export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [reason, setReason] = useState(null); // (optional) if backend provides a reason for logout

  // Unified function to fetch and update auth state
  const fetchStatus = useCallback(() => {
    setLoading(true);
    console.log("[Auth] Fetching auth status...");
    return fetch("/auth/status", { credentials: "include" })
      .then(res => {
        console.log(`[Auth] /auth/status response status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        const discord = data.discord || {};
        setAuthenticated(!!discord.authenticated);
        setUser(discord.user || null);
        setReason(discord.reason || null);
        console.log("[Auth] Auth status updated:", {
          authenticated: !!discord.authenticated,
          user: discord.user,
          reason: discord.reason,
        });
      })
      .catch((err) => {
        setAuthenticated(false);
        setUser(null);
        setReason("network_error");
        console.error("[Auth] Error fetching auth status:", err);
      })
      .finally(() => {
        setLoading(false);
        console.log("[Auth] Done fetching auth status.");
      });
  }, []);

  // On mount, fetch status
  useEffect(() => {
    console.log("[Auth] Mount: fetching initial auth status.");
    fetchStatus();
    // Optionally, return a cleanup to log unmount
    return () => {
      console.log("[Auth] Unmount: AuthProvider cleanup.");
    };
  }, [fetchStatus]);

  // Use this for login redirect back
  const refresh = fetchStatus;

  // Optional: after a login flow, call refresh() to sync state
  const login = () => {
    console.log("[Auth] login() called.");
    // Most login flows redirect and reload, but for SPA you may want to manually refresh.
    return fetchStatus();
  };

  // Logs the user out and clears state
  const logout = () => {
    setLoading(true);
    console.log("[Auth] logout() called.");
    return fetch("/auth/logout", { credentials: "include" })
      .then(() => {
        setAuthenticated(false);
        setUser(null);
        setReason(null);
        console.log("[Auth] Logout successful, user state cleared.");
      })
      .catch((err) => {
        setAuthenticated(false);
        setUser(null);
        setReason("network_error");
        console.error("[Auth] Error during logout:", err);
      })
      .finally(() => {
        setLoading(false);
        console.log("[Auth] Done with logout.");
      });
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        authenticated,
        user,
        reason,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
