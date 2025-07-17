import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./hooks/useAuth"; // ✅ Correct import path
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home/Home";
import Login from "./pages/login/login";
import FactDatabase from "./pages/FactDatabase/FactDatabase";
import FactDetail from "./pages/FactDatabase/FactDetail";
import FactEdit from "./pages/FactDatabase/FactEdit";
import TestPage from "./pages/TestPage/TestPage";
import "./App.scss";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <NavBar />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login/>} />
            <Route path="/test" element={<TestPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/facts" element={<FactDatabase />} />
              <Route path="/facts/new" element={<FactEdit />} />
              <Route path="/facts/:id" element={<FactDetail />} />
              <Route path="/facts/:id/edit" element={<FactEdit />} />
            </Route>

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
