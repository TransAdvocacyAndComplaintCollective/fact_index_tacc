// +// src/components/ProtectedRoute.jsx
// This component is used to protect routes that require authentication.
// It checks if the user is authenticated and either renders the child components or redirects to the login page.
// If the authentication status is still loading, it shows a loading message.
// It uses React Router's `Outlet` to render nested routes, allowing for more complex routing
// structures where child routes can be protected under a single parent route.
// It also uses the `useLocation` hook to preserve the attempted URL for redirecting after login.
//  


import React from "react";
import { useAuthContext } from "../context/AuthContext";
import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute() {
  const { loading, authenticated } = useAuthContext();
  const location = useLocation();

  if (loading) return <div>Loading...</div>;

  if (!authenticated) {
    // Redirect to login and preserve attempted URL for redirect after login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // For nested routing: renders matched child routes (see previous App.js suggestion)
  return <Outlet />;
}
