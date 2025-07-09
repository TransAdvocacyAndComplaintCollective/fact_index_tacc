// /src/hooks/useAuth.jsx
// Custom hook to access authentication state and actions.
// Exposes all relevant values and actions from AuthContext,
// including loading state, authentication status, user info,
// logout reasons (e.g., kicked for missing role), and refresh.
// This hook makes it easy to consume and use auth state anywhere in your app.

import { useAuthContext } from "../context/AuthContext";

export function useAuth() {
  const {
    loading,
    authenticated,
    user,
    reason,    // NEW: possible logout/kick reason ("token_expired", "not_in_guild", etc)
    login,
    logout,
    refresh,   // NEW: force-refresh authentication status
  } = useAuthContext();

  return {
    loading,
    authenticated,
    user,
    reason,
    login,
    logout,
    refresh,
  };
}
