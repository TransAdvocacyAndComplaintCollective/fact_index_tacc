import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";
import { AppShell, Container, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import { RBACProvider, useRBAC, useRBACContext } from "@impelsysinc/react-rbac";
import AdminConsole from "./pages/admin/AdminConsole";
import AdminGuard from "./pages/admin/AdminGuard";

import Home from "./pages/Home/Home";
import Login from "./pages/login/login";
import DataPortal from "./pages/DataPortal/DataPortal";
import FactDatabase from "./pages/FactDatabase/FactDatabase";
import FactDetail from "./pages/FactDatabase/FactDetail";
import FactEdit from "./pages/FactDatabase/FactEdit";
import '@mantine/core/styles.css';

function RBACPermissionsSync() {
  const { user } = useAuthContext();
  const { setPermissions, clearPermissions } = useRBACContext();

  useEffect(() => {
    const granted = Array.isArray(user?.permissions) ? user.permissions : [];
    if (!granted.length) {
      clearPermissions();
      return;
    }

    const hasSuperuser = granted.includes("superuser");
    const hasFactSuperuser = granted.includes("fact:superuser");

    const normalized = granted
      .map((permission) => {
        let raw = String(permission || "").trim();
        // Back-compat: action-first permissions like "read:admin".
        if (raw === "read:admin") raw = "admin:read";
        if (raw === "write:admin") raw = "admin:write";
        // Back-compat: older resource name "facts".
        if (raw.startsWith("facts:")) raw = `fact:${raw.slice("facts:".length)}`;
        const splitAt = raw.lastIndexOf(":");
        if (splitAt <= 0 || splitAt === raw.length - 1) return null;
        return {
          type: "allow",
          resource: raw.slice(0, splitAt),
          action: [raw.slice(splitAt + 1)],
        };
      })
      .filter((item): item is { type: "allow"; resource: string; action: string[] } => Boolean(item));

    if (!normalized.length && !hasSuperuser) {
      clearPermissions();
      return;
    }

    if (hasSuperuser) {
      setPermissions([
        ...normalized,
        { type: "allow", resource: "admin", action: ["read"] },
        { type: "allow", resource: "admin", action: ["write"] },
        { type: "allow", resource: "fact", action: ["read"] },
        { type: "allow", resource: "fact", action: ["write"] },
        { type: "allow", resource: "fact", action: ["pubwrite"] },
        { type: "allow", resource: "fact", action: ["admin"] },
        { type: "allow", resource: "taxonomy", action: ["read"] },
        { type: "allow", resource: "taxonomy", action: ["write"] },
      ]);
      return;
    }

    if (hasFactSuperuser) {
      setPermissions([
        ...normalized.filter((p) => !(p.resource === "fact" && p.action.includes("superuser"))),
        { type: "allow", resource: "fact", action: ["read"] },
        { type: "allow", resource: "fact", action: ["write"] },
        { type: "allow", resource: "fact", action: ["pubwrite"] },
        { type: "allow", resource: "fact", action: ["admin"] },
      ]);
      return;
    }

    setPermissions(normalized);
  }, [user?.permissions, setPermissions, clearPermissions]);

  return null;
}

function AppContent() {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? theme.colors.dark[8] : theme.colors.gray[0];

  return (
    <AppShell 
      header={{ height: 70 }}
      navbar={{ width: { base: 0 }, breakpoint: "sm" }}
      padding="md"
      style={{
        backgroundColor: bgColor,
        transition: 'background-color 150ms ease',
      }}
    >
      <AppShell.Header>
        <NavBar />
      </AppShell.Header>
      <AppShell.Main>
        <Container fluid px={0}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/facts" element={<FactDatabase />} />
            <Route path="/facts/:id" element={<FactDetail />} />
            <Route path="/data-portal" element={<DataPortal />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/facts/new" element={<FactEdit />} />
              <Route path="/facts/:id/edit" element={<FactEdit />} />
              <Route
                path="/admin"
                element={
                  <AdminGuard>
                    <AdminConsole />
                  </AdminGuard>
                }
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function App() {
  const rbac = useRBAC();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RBACProvider rbac={rbac}>
        <AuthProvider>
          <RBACPermissionsSync />
          <AppContent />
        </AuthProvider>
      </RBACProvider>
    </Router>
  );
}

export default App;
