// src/components/ProtectedRoute.jsx
import React from "react";
import { useAuthContext } from "../hooks/useAuth"; // ✅ Correct import path
import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * ProtectedRoute ensures only authenticated users can access its child routes.
 * - Shows a loading state while auth is being determined.
 * - Redirects unauthenticated users to /login, saving the intended destination.
 * - Renders nested routes via <Outlet /> when the user is authenticated.
 */
export default function ProtectedRoute() {
  const { loading, authenticated } = useAuthContext();
  const location = useLocation();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!authenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return <Outlet />;
}
