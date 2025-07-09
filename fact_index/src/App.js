import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home/Home";
import Login from "./pages/login/login";
import FactDatabase from "./pages/FactDatabase/FactDatabase";
import FactDetail from "./pages/FactDatabase/FactDetail";
import FactEdit from "./pages/FactDatabase/FactEdit";

import "./App.scss";

// Helper component for login redirect logic
function LoginRedirect() {
  const { authenticated, loading } = useAuthContext();

  if (loading) return <div>Loading...</div>;
  return authenticated ? <Navigate to="/" /> : <Login />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <NavBar />

        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route
            path="/login"
            element={
              // If already logged in, redirect to home, else show login
              <LoginRedirect />
            }
          />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/facts" element={<FactDatabase />} />
            <Route path="/facts/new" element={<FactEdit />} />
            <Route path="/facts/:id" element={<FactDetail />} />
            <Route path="/facts/:id/edit" element={<FactEdit />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
