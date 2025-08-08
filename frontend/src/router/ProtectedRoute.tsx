// src/components/ProtectedRoute.tsx
import type { ReactElement } from "react";
import React from "react";
import { useAuthContext } from "../hooks/useAuth"; // Adjust path as needed
import type { Location } from "react-router-dom";
import { Navigate, Outlet, useLocation } from "react-router-dom";

interface AuthContextType {
  loading: boolean;
  authenticated: boolean;
}

interface LocationState {
  from: Location;
}

export default function ProtectedRoute(): ReactElement {
  // Type useAuthContext if needed, else rely on your existing hook
  const { loading, authenticated } = useAuthContext() as AuthContextType;
  const location = useLocation();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!authenticated) {
    // Type for Navigate state
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location } as LocationState}
      />
    );
  }

  return <Outlet />;
}
